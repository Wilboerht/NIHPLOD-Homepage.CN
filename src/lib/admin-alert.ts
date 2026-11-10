/**
 * 管理端系统告警（发综合管理群）：定时任务、Webhook、注销、对账、导出、安全事件。
 *
 * 所有告警均尽力而为，失败只记录日志，不阻断主流程。
 */
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { maskPhone } from "./mask-phone";
import { claimAlert, notifyWithCooldown, sendAlert } from "./alert-notify";
import type { PointInvariantResult } from "./points-invariants";
import type { ReconciliationReport } from "./admin-reconciliation";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function nowText(now = new Date()): string {
  return now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function truncate(value: string | null | undefined, max = 500): string {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text || "-";
}

/** 定时任务失败（cron/external 触发；manual 由操作人自行处理） */
export function notifyCronFailure(
  taskName: string,
  trigger: string,
  error: string,
  status: "FAILED" | "TIMEOUT" = "FAILED"
): void {
  if (trigger === "manual") return;
  notifyWithCooldown({
    ruleKey: `cron-failure:${taskName}`,
    count: 1,
    cooldownMs: 30 * MINUTE,
    type: "admin",
    title: status === "TIMEOUT" ? "定时任务超时" : "定时任务失败",
    lines: [
      `- 任务名：${taskName}`,
      `- 状态：${status}`,
      `- 触发方式：${trigger}`,
      `- 时间：${nowText()}`,
      `- 错误：${truncate(error)}`,
    ],
  });
}

/** 事务通知进入死信队列（按 30 分钟冷却聚合） */
export function notifyNotificationOutboxDead(count: number): void {
  if (count <= 0) return;
  notifyWithCooldown({
    ruleKey: "notification-outbox-dead",
    count,
    cooldownMs: 30 * MINUTE,
    type: "admin",
    title: "事务通知出现死信",
    lines: [
      `- 新增死信：${count} 条`,
      `- 时间：${nowText()}`,
      "- 请到后台「事务通知队列」查看并重试",
    ],
  });
}

const WEBHOOK_KIND_LABELS: Record<string, string> = {
  profile_update: "资料变更 Webhook",
  account_status_change: "账户状态 Webhook",
  backchannel_logout: "Backchannel Logout",
};

/** 投递重试耗尽、记录被丢弃 */
export function notifyWebhookFailureDrop(params: {
  kind: "profile_update" | "account_status_change" | "backchannel_logout";
  clientId: string;
  userId: string;
  attempts: number;
  error?: string | null;
}): void {
  notifyWithCooldown({
    ruleKey: `webhook-drop:${params.kind}:${params.clientId}`,
    count: 1,
    cooldownMs: 30 * MINUTE,
    type: "admin",
    title: "Webhook 投递已放弃",
    lines: [
      `- 类型：${WEBHOOK_KIND_LABELS[params.kind]}`,
      `- Client：${params.clientId}`,
      `- 用户：${params.userId}`,
      `- 已重试：${params.attempts} 次`,
      ...(params.error ? [`- 原因：${truncate(params.error)}`] : []),
      `- 时间：${nowText()}`,
      "- 说明：已从重试队列移除，请检查子站端点或配置",
    ],
  });
}

/** 扫描 Webhook / Backchannel 失败队列，积压或接近耗尽时告警 */
export async function scanWebhookFailureQueues(now = new Date()): Promise<void> {
  const [webhookTotal, backchannelTotal, webhookNear, backchannelNear] = await Promise.all([
    prisma.webhookDeliveryFailure.count(),
    prisma.backchannelLogoutFailure.count(),
    prisma.webhookDeliveryFailure.count({ where: { attempts: { gte: 5 } } }),
    prisma.backchannelLogoutFailure.count({ where: { attempts: { gte: 5 } } }),
  ]);

  const total = webhookTotal + backchannelTotal;
  if (total === 0) return;

  if (!(await claimAlert("webhook-failure-backlog", total, 6 * HOUR, now))) return;

  sendAlert("admin", "Webhook 投递失败堆积", [
    `- 资料/状态 Webhook：${webhookTotal} 条待重投（接近耗尽 ${webhookNear} 条）`,
    `- Backchannel Logout：${backchannelTotal} 条待重投（接近耗尽 ${backchannelNear} 条）`,
    `- 检查时间：${nowText(now)}`,
    "- 请前往「通知失败队列」查看并手动重投或处理子站端点",
  ]);
}

/** 账号注销执行失败达到自动重试上限 */
export function notifyAccountDeletionFailure(params: {
  requestId: string;
  userId: string;
  attempts: number;
  error: string;
}): void {
  void (async () => {
    const user = await prisma.user
      .findUnique({
        where: { id: params.userId },
        select: { nickname: true, phone: true },
      })
      .catch(() => null);
    const userLabel = user ? user.nickname || maskPhone(user.phone) : params.userId;

    notifyWithCooldown({
      ruleKey: `account-deletion-failed:${params.requestId}`,
      count: params.attempts,
      cooldownMs: DAY,
      type: "admin",
      title: "账号注销执行失败",
      lines: [
        `- 用户：${userLabel}`,
        `- 注销申请：${params.requestId}`,
        `- 已尝试：${params.attempts} 次（已达自动重试上限）`,
        `- 原因：${truncate(params.error)}`,
        `- 时间：${nowText()}`,
        "- 请前往「注销申请」人工处理",
      ],
    });
  })().catch((error) => apiConsole.warn("[AdminAlert] 注销失败告警异常:", error));
}

/** 积分账本对账异常 / 负余额 */
export function notifyPointInvariantIssues(result: PointInvariantResult): void {
  const samples = result.issues.slice(0, 5).map((issue) => `- ${issue.kind} · ${issue.userId}`);
  notifyWithCooldown({
    ruleKey: "point-invariants",
    count: result.issues.length + result.negativeBalances + result.deletedUsersWithRemaining,
    cooldownMs: 6 * HOUR,
    type: "admin",
    title: "积分账本对账异常",
    lines: [
      `- 已检查账户：${result.checked}`,
      `- 负余额账户：${result.negativeBalances}`,
      `- 已注销但仍有积分：${result.deletedUsersWithRemaining}`,
      `- 对账异常：${result.issues.length}${result.truncated ? "（已截断）" : ""}`,
      ...(samples.length > 0 ? ["", "异常样例：", ...samples] : []),
      "- 请运行 `npm run points:check-invariants` 查看并人工处理",
    ],
  });
}

export function notifyReconciliationIssues(result: ReconciliationReport): void {
  notifyWithCooldown({
    ruleKey: "admin-reconciliation",
    count: result.summary.totalIssueCount,
    cooldownMs: 6 * HOUR,
    type: "admin",
    title: "财务对账发现待处理事项",
    lines: [
      `- 积分相关：${result.summary.pointIssueCount} 项`,
      `- 消费相关：${result.summary.spentIssueCount} 项`,
      `- 兑换流水关联：${result.points.redemptionLinks.count} 项`,
      `- 累计消费不一致：${result.spent.totalMismatches.count} 项`,
      `- 订单退款/占用异常：${result.spent.claimIssues.count} 项`,
      `- 时间：${nowText()}`,
      "- 请前往管理端「对账中心」核对并处理",
    ],
  });
}

/** 审计导出任务失败 */
export function notifyAuditExportFailure(params: {
  jobId: string;
  stream: string;
  format: string;
  adminName: string | null;
  adminEmail: string | null;
  error: string;
}): void {
  notifyWithCooldown({
    ruleKey: `audit-export-failed:${params.jobId}`,
    count: 1,
    cooldownMs: DAY,
    type: "admin",
    title: "审计导出任务失败",
    lines: [
      `- 任务：${params.jobId}`,
      `- 范围：${params.stream} / ${params.format}`,
      `- 申请人：${params.adminName || params.adminEmail || "-"}`,
      `- 错误：${truncate(params.error)}`,
      `- 时间：${nowText()}`,
    ],
  });
}

/** 审计链完整性校验失败 */
/** 审计保留清理完成/失败：高风险删除任务必须有可观测的结果通知 */
export function notifyAuditRetentionResult(params: {
  jobId: string;
  status: "SUCCEEDED" | "FAILED";
  deletedCount?: number;
  error?: string | null;
}): void {
  notifyWithCooldown({
    ruleKey: `audit-retention:${params.status}`,
    count: 1,
    cooldownMs: 10 * MINUTE,
    type: "admin",
    title: params.status === "SUCCEEDED" ? "审计保留清理完成" : "审计保留清理失败",
    lines: [
      `- 任务：${params.jobId}`,
      `- 时间：${nowText()}`,
      ...(params.status === "SUCCEEDED"
        ? [`- 已删除：${params.deletedCount ?? 0} 条`]
        : [`- 错误：${truncate(params.error)}`]),
    ],
  });
}

export function notifyAuditIntegrityFailure(
  results: Array<{ stream: string; day: string; error?: string }>
): void {
  notifyWithCooldown({
    ruleKey: "audit-integrity-failed",
    count: results.length,
    cooldownMs: 6 * HOUR,
    type: "admin",
    title: "审计链完整性校验失败",
    lines: [
      ...results
        .slice(0, 10)
        .map((row) => `- ${row.stream} / ${row.day}：${row.error ?? "VERIFY_FAILED"}`),
      results.length > 10 ? `- 其余 ${results.length - 10} 项省略` : "",
      `- 时间：${nowText()}`,
    ].filter(Boolean),
  });
}
