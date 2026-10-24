/**
 * 定时任务管理器
 * 自托管服务器上使用 node-cron 运行周期性任务
 * 通过 ENABLE_LOCAL_CRON=true 环境变量启用
 */
import cron from "node-cron";
import {
  cleanupExpiredRefreshTokens,
  cleanupOldLoginAttempts,
  cleanupExpiredSmsCodes,
  cleanupRevokedSessionsAndTokens,
  cleanupRevokedUserConsents,
} from "./auth-security";
import { cleanupExpiredCodes } from "./oauth-code";
import { cleanupExpiredAdminSsoCodes } from "./admin-sso";
import { cleanupInternalApiNonces } from "./internal-api";
import { retryFailedBackchannelLogouts } from "./backchannel-logout";
import { retryFailedWebhookDeliveries } from "./profile-webhook";
import { cleanupRateLimitRecords } from "./ratelimit";
import { grantBirthdayRewards } from "./points-ledger";
import { expirePendingRedemptions } from "./point-gifts";
import { checkPointInvariants } from "./points-invariants";
import { expirePointsCron } from "./points-ledger";
import { failStaleImportBatches } from "./spent-import";
import { findSpentOrderConflicts } from "./spent-order-conflicts";
import { sendRetestReminders } from "./retest-reminder";
import { executeDueAccountDeletions } from "./account-deletion";
import { cleanupExpiredAdminStepUpGrants } from "./admin-step-up";
import { cleanupExpiredAdminTotpRecoveries } from "./admin-totp-recovery";
import { anchorMissingAuditDays } from "./audit-integrity";
import { archiveAuditDay } from "./audit-archive";
import { expireAuditExportJobs, processAuditExportJobs } from "./audit-export";
import { expirePendingApprovals } from "./admin-approval";
import { reapStalePendingAuditLogs } from "./audit";
import {
  scanAuditAlerts,
  sendAuditDailyDigest,
  sendRetentionEligibilityAlert,
} from "./audit-alert";
import { apiConsole } from "@/lib/logger";
import { prisma } from "./prisma";
import { acquireCronLock, releaseCronLock } from "./cron-lock";

interface ScheduledTask {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  /** 清理类任务标记：供外部调度器端点 /api/cron/run 批量触发 */
  isCleanup?: boolean;
}

/** 定时任务运行记录的保留上限（超出后由 runTask 顺带清理） */
const CRON_RUN_RETENTION = 500;

// 清理类任务连续失败计数：单次失败已在 catch 中 console.error（下周期自愈），
// 连续失败 >=2 次再打 warn，便于日志监控区分偶发抖动与持续性故障
const cleanupFailureCounts = new Map<string, number>();

function markCleanupOk(taskName: string): void {
  cleanupFailureCounts.delete(taskName);
}

function markCleanupFailed(taskName: string): void {
  const count = (cleanupFailureCounts.get(taskName) ?? 0) + 1;
  cleanupFailureCounts.set(taskName, count);
  if (count >= 2) {
    apiConsole.warn(`[Cron] 清理任务「${taskName}」已连续失败 ${count} 次，请检查数据库连接与权限`);
  }
}

// 定义所有定时任务
const tasks: ScheduledTask[] = [
  {
    name: "Cleanup Expired Refresh Tokens",
    cronExpression: "0 3 * * *", // 每天凌晨 3 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期 Refresh Token...");
        const count = await cleanupExpiredRefreshTokens();
        apiConsole.info(`[Cron] 过期 Refresh Token 清理完成: ${count} 个`);
        markCleanupOk("过期 Refresh Token");
      } catch (error) {
        apiConsole.error("[Cron] 过期 Refresh Token 清理失败:", error);
        markCleanupFailed("过期 Refresh Token");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Expired Rate Limit Records",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期限流记录...");
        const count = await cleanupRateLimitRecords();
        apiConsole.info(`[Cron] 过期限流记录清理完成: ${count} 条`);
        markCleanupOk("过期限流记录");
      } catch (error) {
        apiConsole.error("[Cron] 过期限流记录清理失败:", error);
        markCleanupFailed("过期限流记录");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Old Login Attempts",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理陈旧登录尝试记录...");
        const loginCount = await cleanupOldLoginAttempts();
        apiConsole.info(`[Cron] 登录尝试记录清理完成: ${loginCount} 条`);
        markCleanupOk("登录尝试记录");
      } catch (error) {
        apiConsole.error("[Cron] 登录尝试记录清理失败:", error);
        markCleanupFailed("登录尝试记录");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Expired Sms Codes",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期验证码记录...");
        const count = await cleanupExpiredSmsCodes();
        apiConsole.info(`[Cron] 过期验证码记录清理完成: ${count} 条`);
        markCleanupOk("过期验证码记录");
      } catch (error) {
        apiConsole.error("[Cron] 过期验证码记录清理失败:", error);
        markCleanupFailed("过期验证码记录");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Expired OAuth Authorization Codes",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期授权码...");
        const count = await cleanupExpiredCodes();
        const adminSsoCount = await cleanupExpiredAdminSsoCodes();
        const adminTotpRecoveryCount = await cleanupExpiredAdminTotpRecoveries();
        apiConsole.info(
          `[Cron] expired admin TOTP recovery codes removed: ${adminTotpRecoveryCount}`
        );
        apiConsole.info(`[Cron] 过期授权码清理完成: ${count} 条（管理员 SSO ${adminSsoCount} 条）`);
        markCleanupOk("过期授权码");
      } catch (error) {
        apiConsole.error("[Cron] 过期授权码清理失败:", error);
        markCleanupFailed("过期授权码");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Expired Admin Step-Up Grants",
    cronExpression: "15 5 * * *",
    isCleanup: true,
    handler: async () => {
      try {
        const count = await cleanupExpiredAdminStepUpGrants();
        apiConsole.info(`[Cron] 过期管理员 step-up 凭证清理完成: ${count} 条`);
        markCleanupOk("管理员 step-up 凭证");
      } catch (error) {
        apiConsole.error("[Cron] 管理员 step-up 凭证清理失败:", error);
        markCleanupFailed("管理员 step-up 凭证");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Internal API Nonces",
    cronExpression: "0 * * * *", // 每小时执行一次（nonce 记录随内部 API 调用量增长，需高频清理）
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期内部 API nonce 记录...");
        const count = await cleanupInternalApiNonces();
        apiConsole.info(`[Cron] 过期 nonce 记录清理完成: ${count} 条`);
        markCleanupOk("过期 nonce 记录");
      } catch (error) {
        apiConsole.error("[Cron] 过期 nonce 记录清理失败:", error);
        markCleanupFailed("过期 nonce 记录");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Expired Token Blacklist Records",
    cronExpression: "0 * * * *", // 每小时执行一次（PostgreSQL 无 TTL，过期黑名单记录需定时物理删除）
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期 Token 黑名单记录...");
        // 覆盖 access_token / user / dpop_jti / internal_api_nonce 等全部 type 的过期记录；
        // nonce 另有按 createdAt 的高频清理任务，两者互补
        const result = await prisma.tokenBlacklist.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        apiConsole.info(`[Cron] 过期 Token 黑名单记录清理完成: ${result.count} 条`);
        markCleanupOk("过期 Token 黑名单记录");
      } catch (error) {
        apiConsole.error("[Cron] 过期 Token 黑名单记录清理失败:", error);
        markCleanupFailed("过期 Token 黑名单记录");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Revoked Sessions and Tokens",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理已撤销的会话和 Token...");
        const result = await cleanupRevokedSessionsAndTokens();
        apiConsole.info(
          `[Cron] 已撤销记录清理完成: ${result.sessions} 个会话, ${result.tokens} 个 Token`
        );
        markCleanupOk("已撤销会话和 Token");
      } catch (error) {
        apiConsole.error("[Cron] 已撤销会话和 Token 清理失败:", error);
        markCleanupFailed("已撤销会话和 Token");
        throw error;
      }
    },
  },
  {
    name: "Cleanup Revoked User Consents",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理已撤销的用户授权记录...");
        const count = await cleanupRevokedUserConsents();
        apiConsole.info(`[Cron] 已撤销用户授权记录清理完成: ${count} 条`);
        markCleanupOk("已撤销用户授权记录");
      } catch (error) {
        apiConsole.error("[Cron] 已撤销用户授权记录清理失败:", error);
        markCleanupFailed("已撤销用户授权记录");
        throw error;
      }
    },
  },
  {
    name: "Anchor Missing Audit Days",
    cronExpression: "15 1 * * *", // 每天 01:15（Asia/Shanghai）补锚；重复执行幂等
    handler: async () => {
      try {
        const result = await anchorMissingAuditDays({ maxDays: 400 });
        apiConsole.info(
          `[Cron] 审计锚点补齐完成: 新增 ${result.created.length} 个（截至 ${result.lastDay}）`
        );
      } catch (error) {
        apiConsole.error("[Cron] 审计锚点补齐失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Archive Audit Logs",
    cronExpression: "30 2 * * *", // 每天 02:30 归档前一日审计/SSO 日志
    isCleanup: true,
    handler: async () => {
      try {
        // 失败重试：每次最多补 30 个缺失归档，避免漏一天后永远不补。
        const missing = await prisma.auditLogAnchor.findMany({
          where: { signatureVersion: 2, archivedAt: null },
          orderBy: [{ day: "asc" }, { stream: "asc" }],
          take: 30,
        });
        let archived = 0;
        for (const anchor of missing) {
          const [year, month, date] = anchor.day.split("-").map(Number);
          const fromAt = new Date(Date.UTC(year, month - 1, date) - 8 * 60 * 60 * 1000);
          const result = await archiveAuditDay(anchor.stream as "audit" | "sso", {
            day: anchor.day,
            fromAt,
            toAt: new Date(fromAt.getTime() + 24 * 60 * 60 * 1000),
          });
          if (result.verified) archived += 1;
        }
        apiConsole.info(`[Cron] 审计归档完成: 补齐 ${archived}/${missing.length} 个`);
        markCleanupOk("审计归档");
      } catch (error) {
        apiConsole.error("[Cron] 审计归档失败:", error);
        markCleanupFailed("审计归档");
        throw error;
      }
    },
  },
  {
    name: "Reap Stale Pending Audit Logs",
    cronExpression: "*/15 * * * *",
    handler: async () => {
      try {
        await reapStalePendingAuditLogs(10);
      } catch (error) {
        apiConsole.error("[Cron] PENDING 审计回收失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Process Audit Export Jobs",
    cronExpression: "* * * * *", // 每分钟处理队列
    handler: async () => {
      try {
        await expireAuditExportJobs();
        const count = await processAuditExportJobs(3);
        if (count > 0) apiConsole.info(`[Cron] 审计导出任务处理: ${count} 个`);
      } catch (error) {
        apiConsole.error("[Cron] 审计导出任务处理失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Audit Anomaly Scan",
    cronExpression: "*/5 * * * *",
    handler: async () => {
      try {
        await scanAuditAlerts();
      } catch (error) {
        apiConsole.error("[Cron] 审计异常扫描失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Audit Daily Digest",
    cronExpression: "0 9 * * *",
    handler: async () => {
      try {
        await sendAuditDailyDigest();
      } catch (error) {
        apiConsole.error("[Cron] 审计日报发送失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Audit Retention Eligibility Alert",
    cronExpression: "30 9 * * *",
    handler: async () => {
      try {
        await sendRetentionEligibilityAlert();
      } catch (error) {
        apiConsole.error("[Cron] 审计到期提醒失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Retry Failed Backchannel Logout Notifications",
    cronExpression: "*/15 * * * *", // 每 15 分钟重投一次
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始重投失败的 Backchannel Logout 通知...");
        const result = await retryFailedBackchannelLogouts(200);
        apiConsole.info(
          `[Cron] Backchannel Logout 重投完成: 成功 ${result.delivered} 条, 待下次重试 ${result.failed} 条, 丢弃 ${result.dropped} 条`
        );
      } catch (error) {
        apiConsole.error("[Cron] Backchannel Logout 重投任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Retry Failed Webhook Deliveries",
    cronExpression: "*/15 * * * *", // 每 15 分钟重投一次（与 Backchannel Logout 重投同周期）
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始重投失败的资料变更 Webhook...");
        const result = await retryFailedWebhookDeliveries();
        apiConsole.info(
          `[Cron] 资料变更 Webhook 重投完成: 成功 ${result.delivered} 条, 待下次重试 ${result.failed} 条, 丢弃 ${result.dropped} 条`
        );
      } catch (error) {
        apiConsole.error("[Cron] 资料变更 Webhook 重投任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Grant Birthday Points",
    cronExpression: "0 8 * * *", // 每天 8 点发放当天生日用户的生日积分（每年一次幂等）
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始发放生日积分...");
        const result = await grantBirthdayRewards();
        apiConsole.info(
          `[Cron] 生日积分发放完成: 发放 ${result.rewarded} 人, 跳过 ${result.skipped} 人`
        );
      } catch (error) {
        apiConsole.error("[Cron] 生日积分发放任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Cancel Stale Point Redemptions",
    // 每天 03:00 取消超时未履约的兑换，退还积分并释放限量库存
    cronExpression: "0 3 * * *",
    handler: async () => {
      try {
        const result = await expirePendingRedemptions();
        if (result.cancelled > 0 || result.failed > 0) {
          apiConsole.warn(
            `[Cron] 超时兑换处理: 扫描 ${result.scanned}，取消 ${result.cancelled}，跳过 ${result.skipped}，失败 ${result.failed}`
          );
        }
        if (result.failed > 0) {
          throw new Error(`超时兑换取消失败 ${result.failed} 条`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 超时兑换取消失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Expire Points",
    cronExpression: "30 4 * * *", // 每天凌晨 4:30 处理 6 个月有效期到期积分
    handler: async () => {
      try {
        const count = await expirePointsCron();
        if (count > 0) {
          apiConsole.info(`[Cron] 积分过期处理完成: 共过期 ${count} 积分`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 积分过期任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Check Point Invariants",
    // 每周一 05:00 对账：可用余额大于未消耗发放流水、或缺失余额行时告警
    cronExpression: "0 5 * * 1",
    handler: async () => {
      try {
        const result = await checkPointInvariants();
        if (result.negativeBalances > 0) {
          apiConsole.warn(`[Cron] 存在 ${result.negativeBalances} 个负积分余额账户`);
        }
        if (result.issues.length > 0) {
          apiConsole.error(
            `[Cron] 积分账本对账发现 ${result.issues.length} 个异常，请运行 npm run points:check-invariants 查看详情`
          );
          throw new Error(`积分账本对账发现 ${result.issues.length} 个异常`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 积分账本对账失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Fail Stale Spent Import Batches",
    // 进程崩溃/请求超时会让导入批次长期停在 PROCESSING，阻塞同文件重导与撤销。
    // 每小时把超过 30 分钟的 PROCESSING 批次标记 FAILED，由管理端撤销成功行后重试。
    cronExpression: "10 * * * *",
    handler: async () => {
      try {
        const count = await failStaleImportBatches(30);
        if (count > 0) {
          apiConsole.warn(`[Cron] 已标记 ${count} 个超时消费导入批次为 FAILED`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 清理超时消费导入批次失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Detect Spent Order Conflicts",
    // 每天 09:20：扫描最近 90 天导入成功与已通过补录的重复订单号。
    // 发现冲突时抛错，让 CronTaskRun 失败，管理员在定时任务页可见并人工处理。
    cronExpression: "20 9 * * *",
    handler: async () => {
      try {
        const result = await findSpentOrderConflicts({ sinceDays: 90, limit: 20 });
        if (result.count > 0) {
          apiConsole.error(
            `[Cron] 发现 ${result.count} 个消费订单跨来源冲突: ${result.items
              .slice(0, 5)
              .map((item) => `${item.orderNo}(${item.sources.join("+")})`)
              .join(", ")}`
          );
          throw new Error(`发现 ${result.count} 个消费订单存在跨来源重复入账，请人工核对`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 消费订单冲突检查失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Execute Account Deletions",
    // 每小时执行一次（错峰避开整点清理任务）：扫描到期的注销申请逐个执行，
    // 并向到期前 24 小时的申请发送撤回提醒短信；单条失败置 FAILED 下次重试，
    // 达到重试上限转人工（详见 lib/account-deletion.ts）
    cronExpression: "17 * * * *",
    handler: async () => {
      try {
        const result = await executeDueAccountDeletions();
        if (result.due > 0 || result.reminded > 0) {
          apiConsole.info(
            `[Cron] 账号注销执行完成: 到期 ${result.due} 条（成功 ${result.completed} / 失败 ${result.failed} / 跳过 ${result.skipped}），到期提醒 ${result.reminded} 条`
          );
        }
      } catch (error) {
        apiConsole.error("[Cron] 账号注销执行任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Send Retest Reminders",
    // 每天 10 点：向「上次测肤完成满 30 天」的用户发送测肤小程序复测提醒
    // （子站内部接口出名单 + 微信订阅消息，全程 fail-soft，详见 lib/retest-reminder.ts）
    cronExpression: "0 10 * * *",
    handler: async () => {
      try {
        const result = await sendRetestReminders();
        if (result.due > 0) {
          apiConsole.info(
            `[Cron] 复测提醒完成: 到期 ${result.due} 人，已尝试发送 ${result.attempted} 人`
          );
        }
      } catch (error) {
        apiConsole.error("[Cron] 复测提醒任务失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Expire Pending Admin Approvals",
    cronExpression: "*/10 * * * *",
    handler: async () => {
      try {
        const count = await expirePendingApprovals();
        if (count > 0) {
          apiConsole.info(`[Cron] 过期/超时 Owner 审批: ${count} 条`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 过期 Owner 审批申请清理失败:", error);
        throw error;
      }
    },
  },
];

/** 任务元信息（供管理端展示，不暴露 handler） */
export function listCronTasks(): { name: string; cronExpression: string }[] {
  return tasks.map((t) => ({ name: t.name, cronExpression: t.cronExpression }));
}

let pruneCounter = 0;

/** 顺带清理运行记录（每 50 次运行清理一次，保留最近 CRON_RUN_RETENTION 条） */
async function pruneCronRuns(): Promise<void> {
  pruneCounter += 1;
  if (pruneCounter % 50 !== 0) return;
  try {
    const cutoff = await prisma.cronTaskRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: CRON_RUN_RETENTION,
      take: 1,
      select: { startedAt: true },
    });
    if (cutoff[0]) {
      await prisma.cronTaskRun.deleteMany({ where: { startedAt: { lt: cutoff[0].startedAt } } });
    }
  } catch (err) {
    apiConsole.warn("[Cron] 运行记录清理失败:", err);
  }
}

/**
 * 执行指定任务并落运行记录（cron 调度与人工触发共用）
 * handler 内部错误会 rethrow，由此统一记录失败原因。
 */
export async function runCronTask(
  taskName: string,
  trigger: "cron" | "manual" | "external",
  adminId?: string
): Promise<{ ok: boolean; error?: string }> {
  const task = tasks.find((t) => t.name === taskName);
  if (!task) return { ok: false, error: "任务不存在" };

  const lockOwner = await acquireCronLock(taskName);
  if (!lockOwner) return { ok: false, error: "任务正在执行中，请稍后重试" };

  const startedAt = new Date();
  try {
    await task.handler();
    await prisma.cronTaskRun
      .create({
        data: {
          taskName,
          trigger,
          success: true,
          adminId: adminId ?? null,
          startedAt,
          finishedAt: new Date(),
        },
      })
      .catch((err) => apiConsole.warn("[Cron] 运行记录写入失败:", err));
    await pruneCronRuns();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.cronTaskRun
      .create({
        data: {
          taskName,
          trigger,
          success: false,
          error: message.slice(0, 2000),
          adminId: adminId ?? null,
          startedAt,
          finishedAt: new Date(),
        },
      })
      .catch((err) => apiConsole.warn("[Cron] 运行记录写入失败:", err));
    return { ok: false, error: message };
  } finally {
    await releaseCronLock(taskName, lockOwner);
  }
}

/**
 * 依次执行全部清理类任务（供外部调度器端点 /api/cron/run 调用）
 * 与进程内 cron / 管理端手动触发共用 runCronTask，运行记录同样落库 CronTaskRun
 */
export async function runCleanupCronTasks(
  trigger: "cron" | "manual" | "external" = "external"
): Promise<{ name: string; ok: boolean; error?: string }[]> {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const task of tasks) {
    if (!task.isCleanup) continue;
    const result = await runCronTask(task.name, trigger);
    results.push({ name: task.name, ...result });
  }
  return results;
}

let scheduledTasks: ReturnType<typeof cron.schedule>[] = [];
let isInitialized = false;

/**
 * 初始化所有定时任务
 * 在应用启动时调用（通过 instrumentation.ts → server-init.ts）
 * 设置 ENABLE_LOCAL_CRON=true 启用 node-cron 进程内定时任务
 */
export function isLocalCronEnabled(): boolean {
  return process.env.ENABLE_LOCAL_CRON === "true";
}
export function initializeCronTasks(): void {
  if (isInitialized) {
    apiConsole.info("[Cron] 定时任务已初始化，跳过重复初始化");
    return;
  }

  if (!isLocalCronEnabled()) {
    apiConsole.info("[Cron] 本地定时任务已禁用（如需启用请设置 ENABLE_LOCAL_CRON=true）");
    return;
  }

  apiConsole.info("[Cron] 初始化定时任务...");

  for (const task of tasks) {
    try {
      // runOnInit: false 表示不在启动时立即执行，而是在下一个定时周期执行
      const job = cron.schedule(
        task.cronExpression,
        () => {
          // 失败不能静默：runCronTask 已落库 CronTaskRun，这里补一条错误日志便于告警采集
          void runCronTask(task.name, "cron").then((result) => {
            if (!result.ok) {
              apiConsole.error(`[Cron] 任务执行失败: ${task.name}`, result.error);
            }
          });
        },
        {
          runOnInit: false,
          // 业务时区固定为 Asia/Shanghai：避免 UTC 主机上“每天 8 点”实际在 16 点执行
          timezone: process.env.CRON_TIMEZONE || "Asia/Shanghai",
        }
      );

      scheduledTasks.push(job);
      apiConsole.info(`[Cron] ✓ 任务已注册: ${task.name} (${task.cronExpression})`);
    } catch (error) {
      apiConsole.error(`[Cron] ✗ 任务注册失败: ${task.name}`, error);
    }
  }

  isInitialized = true;
  apiConsole.info(`[Cron] 共注册 ${scheduledTasks.length} 个定时任务`);
}

/**
 * 停止所有定时任务
 * 在应用关闭时调用
 */
export function stopCronTasks(): void {
  apiConsole.info("[Cron] 停止所有定时任务...");

  for (const task of scheduledTasks) {
    task.stop();
  }

  scheduledTasks = [];
  isInitialized = false;
  apiConsole.info("[Cron] 所有定时任务已停止");
}
