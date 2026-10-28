/**
 * 审计异常告警与日报。
 *
 * 规则保持轻量，依赖 AuditLog 索引：
 * - 管理员登录/TOTP 连续失败
 * - 高危操作
 * - PENDING 堆积
 * - 锚点缺失
 *
 * 通知走企业微信 webhook；未配置时只记录日志。告警去重写入 AuditAlertState。
 */
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { sendWecomNotification } from "./wecom";
import { getUtc8DayRange } from "./audit-integrity";
import { AUDIT_ACTION_LABELS } from "./audit-labels";
import { buildRetentionPreview, defaultRetentionCutoffs } from "./audit-retention";

const COOLDOWN_MS = 30 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * 每日锚点任务在 01:15 执行。凌晨 00:00–02:00 之间“昨天”的锚点
 * 还没生成，这是正常窗口，不应告警；02:00 后才要求前一日锚点存在。
 */
function getExpectedAnchorDay(now: Date): string {
  const raw = Number(process.env.AUDIT_ANCHOR_GRACE_HOURS ?? 2);
  const graceHours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 12) : 2;
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const utc8Hour = shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
  const daysAgo = utc8Hour < graceHours ? 2 : 1;
  return getUtc8DayRange(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)).day;
}

async function claimAlert(ruleKey: string, count: number, now: Date): Promise<boolean> {
  const state = await prisma.auditAlertState.findUnique({ where: { ruleKey } });
  if (state && now.getTime() - state.lastSentAt.getTime() < COOLDOWN_MS) return false;
  await prisma.auditAlertState.upsert({
    where: { ruleKey },
    create: { ruleKey, lastSentAt: now, lastCount: count },
    update: { lastSentAt: now, lastCount: count },
  });
  return true;
}

async function notify(title: string, lines: string[]): Promise<void> {
  const content = [`## ${title}`, "", ...lines].join("\n");
  const result = await sendWecomNotification(content, "admin");
  if (!result.success) {
    apiConsole.warn(`[AuditAlert] 企业微信通知未发送: ${result.error ?? "unknown"}`);
  }
}

export async function scanAuditAlerts(now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - WINDOW_MS);

  const authFailures = await prisma.auditLog.groupBy({
    by: ["actorEmail", "ipAddress"],
    where: {
      action: { in: ["admin_login_failed", "admin_totp_failed", "step_up_failed"] },
      createdAt: { gte: since },
    },
    _count: { _all: true },
  });
  const failing = authFailures.filter((row) => row._count._all >= 5);
  if (failing.length > 0) {
    const count = failing.reduce((sum, row) => sum + row._count._all, 0);
    if (await claimAlert("auth-failure-burst", count, now)) {
      await notify("审计告警：管理员认证连续失败", [
        `10 分钟内失败 ${count} 次，涉及 ${failing.length} 个账号/IP：`,
        ...failing
          .slice(0, 10)
          .map(
            (row) => `- ${row.actorEmail ?? "-"} / ${row.ipAddress ?? "-"}：${row._count._all} 次`
          ),
      ]);
    }
  }

  const highRisk = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: since },
      riskLevel: { in: ["HIGH", "CRITICAL"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      action: true,
      actorName: true,
      actorEmail: true,
      targetLabel: true,
      createdAt: true,
    },
  });
  if (highRisk.length > 0) {
    const ruleKey = `high-risk:${highRisk[0].action}`;
    if (await claimAlert(ruleKey, highRisk.length, now)) {
      await notify("审计告警：高危操作", [
        `10 分钟内 ${highRisk.length} 条高危操作：`,
        ...highRisk
          .slice(0, 10)
          .map(
            (row) =>
              `- ${AUDIT_ACTION_LABELS[row.action] ?? row.action} · ${
                row.actorName || row.actorEmail || "-"
              } · ${row.targetLabel ?? "-"} · ${row.createdAt.toISOString()}`
          ),
      ]);
    }
  }

  const pending = await prisma.auditLog.count({ where: { outcome: "PENDING" } });
  if (pending >= 10) {
    if (await claimAlert("pending-backlog", pending, now)) {
      await notify("审计告警：PENDING 堆积", [`当前 PENDING 审计记录 ${pending} 条。`]);
    }
  }

  const expectedAnchorDay = getExpectedAnchorDay(now);
  const latest = await prisma.auditLogAnchor.findFirst({
    where: { stream: "audit", signatureVersion: 2 },
    orderBy: { day: "desc" },
    select: { day: true },
  });
  if (!latest || latest.day < expectedAnchorDay) {
    if (await claimAlert("anchor-missing", 1, now)) {
      await notify("审计告警：锚点缺失", [
        `最新 v2 审计锚点：${latest?.day ?? "无"}，期望至少到 ${expectedAnchorDay}。`,
        "每日锚点任务在 01:15 执行，02:00 前为正常宽限期。",
      ]);
    }
  }
}

export async function sendAuditDailyDigest(now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sensitiveActions = [
    "application_detail_view",
    "application_list_view",
    "resume_download",
    "point_redemption_pii_view",
    "spent_receipt_view",
    "user_detail_sensitive_view",
    "message_sensitive_view",
    "amap_config_view",
  ];
  const [total, failures, highRisk, topActions, sensitiveViews] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since }, outcome: "FAILURE" } }),
    prisma.auditLog.count({
      where: { createdAt: { gte: since }, riskLevel: { in: ["HIGH", "CRITICAL"] } },
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 5,
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since }, action: { in: sensitiveActions } },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
    }),
  ]);
  const sensitiveTotal = sensitiveViews.reduce((sum, row) => sum + row._count._all, 0);

  await notify("审计日报（近 24 小时）", [
    `- 总操作：${total}`,
    `- 失败：${failures}`,
    `- 高危/严重：${highRisk}`,
    "",
    "Top actions：",
    ...topActions.map(
      (row) => `- ${AUDIT_ACTION_LABELS[row.action] ?? row.action}：${row._count._all}`
    ),
    "",
    `敏感信息查看：${sensitiveTotal}`,
    ...sensitiveViews.map(
      (row) => `- ${AUDIT_ACTION_LABELS[row.action] ?? row.action}：${row._count._all}`
    ),
  ]);
}

/** 每日检查是否有到期可清理数据；只提醒，不删除。 */
export async function sendRetentionEligibilityAlert(now = new Date()): Promise<void> {
  const preview = await buildRetentionPreview({ cutoffs: defaultRetentionCutoffs(now) });
  if (preview.expectedCount === 0) return;
  if (await claimAlert(`retention-eligible:${preview.previewHash}`, preview.expectedCount, now)) {
    await notify("审计到期提醒", [
      `当前有 ${preview.expectedCount} 条审计记录超过保留期，预计释放 ${preview.expectedBytes} 字节。`,
      "仅 owner 可在后台「审计保留」页通过 TOTP 发起清理。",
      ...preview.warnings.slice(0, 10).map((warning) => `- ${warning}`),
    ]);
  }
}
