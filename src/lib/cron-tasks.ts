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
import { retryFailedStatusWebhooks } from "./webhook";
import { processMediaDeletionTasks } from "./media-deletion";
import { cleanupRateLimitRecords } from "./ratelimit";
import { grantBirthdayRewards } from "./points-ledger";
import { expirePendingRedemptions } from "./point-gifts";
import { autoCompleteRedemptions, closeStaleAfterSales } from "./redemption-state-machine";
import { checkPointInvariants } from "./points-invariants";
import { expirePointsCron } from "./points-ledger";
import { failStaleImportBatches } from "./spent-import";
import { findSpentOrderConflicts } from "./spent-order-conflicts";
import { purgeOrphanSpentProofs } from "./spent-proof-orphans";
import { purgeOrphanAvatarUploads } from "./avatar-assets";
import { sendRetestReminders } from "./retest-reminder";
import { executeDueAccountDeletions } from "./account-deletion";
import { anonymizeDeletedAdmins } from "./admin-retention";
import { cleanupExpiredAdminStepUpGrants } from "./admin-step-up";
import { cleanupExpiredAdminTotpRecoveries } from "./admin-totp-recovery";
import { anchorMissingAuditDays, verifyRecentAuditDays } from "./audit-integrity";
import { archiveAuditDay } from "./audit-archive";
import { expireAuditExportJobs, processAuditExportJobs } from "./audit-export";
import { expirePendingApprovals, reconcileStaleApprovedApprovals } from "./admin-approval";
import { cleanupNotificationOutbox, processNotificationOutbox } from "./notification-outbox";
import { reapStalePendingAuditLogs } from "./audit";
import {
  scanAuditAlerts,
  sendAuditDailyDigest,
  sendRetentionEligibilityAlert,
} from "./audit-alert";
import { apiConsole } from "@/lib/logger";
import { prisma } from "./prisma";
import { acquireCronLock, releaseCronLock, startCronLockHeartbeat } from "./cron-lock";
import {
  notifyAuditIntegrityFailure,
  notifyCronFailure,
  notifyNotificationOutboxDead,
  notifyPointInvariantIssues,
  scanWebhookFailureQueues,
} from "./admin-alert";
import {
  notifyRedemptionAutoCancelled,
  notifySpentOrderConflicts,
  notifyStaleSpentImportBatches,
  sendAfterSalesAgingAlert,
  sendGiftLowStockAlert,
  sendOpsDailyDigest,
  sendRedemptionExpiryReminders,
} from "./ops-alert";

export type CronTaskTrigger = "cron" | "manual" | "external";
export type CronTaskRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "SKIPPED";

interface ScheduledTask {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  /** 清理类任务（供外部调度器 /api/cron/run 批量执行） */
  isCleanup?: boolean;
  /** 任务内部已发送专用告警，跳过通用「定时任务失败」通知 */
  suppressFailureAlert?: boolean;
  /** 软超时（毫秒）：用于展示与 stale reaper 判定，不强制 kill handler */
  timeoutMs?: number;
}

/**
 * 稳定 taskKey：展示名可改，历史与外部调度仍按 key 关联。
 * 新增任务时必须同步补充。
 */
const TASK_KEYS: Record<string, string> = {
  "Cleanup Expired Refresh Tokens": "cleanup-expired-refresh-tokens",
  "Cleanup Expired Rate Limit Records": "cleanup-expired-rate-limit-records",
  "Cleanup Old Login Attempts": "cleanup-old-login-attempts",
  "Cleanup Expired Sms Codes": "cleanup-expired-sms-codes",
  "Purge Orphan Spent Proofs": "purge-orphan-spent-proofs",
  "Purge Orphan Avatar Uploads": "purge-orphan-avatar-uploads",
  "Cleanup Expired OAuth Authorization Codes": "cleanup-expired-oauth-authorization-codes",
  "Cleanup Expired Admin Step-Up Grants": "cleanup-expired-admin-step-up-grants",
  "Cleanup Internal API Nonces": "cleanup-internal-api-nonces",
  "Cleanup Expired Token Blacklist Records": "cleanup-expired-token-blacklist-records",
  "Cleanup Revoked Sessions and Tokens": "cleanup-revoked-sessions-and-tokens",
  "Cleanup Revoked User Consents": "cleanup-revoked-user-consents",
  "Anchor Missing Audit Days": "anchor-missing-audit-days",
  "Archive Audit Logs": "archive-audit-logs",
  "Verify Audit Integrity": "verify-audit-integrity",
  "Reap Stale Pending Audit Logs": "reap-stale-pending-audit-logs",
  "Process Audit Export Jobs": "process-audit-export-jobs",
  "Process Audit Retention Jobs": "process-audit-retention-jobs",
  "Audit Anomaly Scan": "audit-anomaly-scan",
  "Audit Daily Digest": "audit-daily-digest",
  "Audit Retention Eligibility Alert": "audit-retention-eligibility-alert",
  "Retry Failed Backchannel Logout Notifications": "retry-failed-backchannel-logout-notifications",
  "Retry Failed Webhook Deliveries": "retry-failed-webhook-deliveries",
  "Grant Birthday Points": "grant-birthday-points",
  "Cancel Stale Point Redemptions": "cancel-stale-point-redemptions",
  "Expire Points": "expire-points",
  "Check Point Invariants": "check-point-invariants",
  "Fail Stale Spent Import Batches": "fail-stale-spent-import-batches",
  "Detect Spent Order Conflicts": "detect-spent-order-conflicts",
  "Execute Account Deletions": "execute-account-deletions",
  "Anonymize Deleted Admins": "anonymize-deleted-admins",
  "Ops Daily Digest": "ops-daily-digest",
  "Gift Low Stock Alert": "gift-low-stock-alert",
  "Send Redemption Expiry Reminders": "send-redemption-expiry-reminders",
  "Send Retest Reminders": "send-retest-reminders",
  "Process Media Deletion Tasks": "process-media-deletion-tasks",
  "Reconcile Stale Approved Admin Approvals": "reconcile-stale-approved-admin-approvals",
  "Expire Pending Admin Approvals": "expire-pending-admin-approvals",
  "Process Notification Outbox": "process-notification-outbox",
  "Cleanup Notification Outbox": "cleanup-notification-outbox",
  "Auto Complete Redemptions": "auto-complete-redemptions",
  "Close Stale After-Sales": "close-stale-after-sales",
  "After-Sales Aging Alert": "after-sales-aging-alert",
  "Reap Stale Cron Runs": "reap-stale-cron-runs",
};

function envPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DEFAULT_TASK_TIMEOUT_MS = envPositiveNumber("CRON_TASK_DEFAULT_TIMEOUT_MS", 10 * 60 * 1000);
const CRON_RUN_STALE_MS = envPositiveNumber("CRON_RUN_STALE_MS", 15 * 60 * 1000);

function slugifyTaskName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCronTaskKey(name: string): string {
  return TASK_KEYS[name] ?? slugifyTaskName(name);
}

/** 定时任务运行记录的保留上限（超出后由 runTask 顺带清理） */
const CRON_RUN_RETENTION = 5000;

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
    name: "Purge Orphan Spent Proofs",
    cronExpression: "30 4 * * *", // 每天凌晨 4:30 执行
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理孤儿消费凭证...");
        const result = await purgeOrphanSpentProofs({ apply: true });
        apiConsole.info(
          `[Cron] 孤儿消费凭证清理完成: 删除 ${result.deleted} / 扫描 ${result.scanned}（候选 ${result.candidates}）`
        );
        markCleanupOk("孤儿消费凭证");
      } catch (error) {
        apiConsole.error("[Cron] 孤儿消费凭证清理失败:", error);
        markCleanupFailed("孤儿消费凭证");
        throw error;
      }
    },
  },
  {
    name: "Purge Orphan Avatar Uploads",
    cronExpression: "40 4 * * *", // 每天清理超过 24 小时仍未写入资料的头像
    isCleanup: true,
    handler: async () => {
      try {
        const result = await purgeOrphanAvatarUploads();
        if (result.scanned > 0) {
          apiConsole.info(
            `[Cron] 孤儿头像清理完成: 入队 ${result.purged} / 扫描 ${result.scanned}，失败 ${result.failed}`
          );
        }
        if (result.failed > 0) throw new Error(`孤儿头像清理失败 ${result.failed} 条`);
        markCleanupOk("孤儿头像");
      } catch (error) {
        apiConsole.error("[Cron] 孤儿头像清理失败:", error);
        markCleanupFailed("孤儿头像");
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
    isCleanup: true,
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
    name: "Verify Audit Integrity",
    cronExpression: "10 3 * * *", // 归档完成后校验前一日审计链
    suppressFailureAlert: true,
    handler: async () => {
      let notified = false;
      try {
        const result = await verifyRecentAuditDays();
        if (result.failed.length > 0) {
          notified = true;
          notifyAuditIntegrityFailure(
            result.failed.map((row) => ({
              stream: row.stream,
              day: row.day,
              error: row.error,
            }))
          );
          throw new Error(
            `审计链完整性校验失败: ${result.failed
              .map((row) => `${row.stream}/${row.day}(${row.error ?? "UNKNOWN"})`)
              .join(", ")}`
          );
        }
        apiConsole.info(`[Cron] 审计链完整性校验通过: ${result.day}`);
      } catch (error) {
        if (!notified) {
          notifyAuditIntegrityFailure([
            {
              stream: "audit+sso",
              day: "-",
              error: error instanceof Error ? error.message : String(error),
            },
          ]);
        }
        apiConsole.error("[Cron] 审计链完整性校验失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Reap Stale Pending Audit Logs",
    cronExpression: "*/15 * * * *",
    isCleanup: true,
    handler: async () => {
      try {
        // 长导出/长导入等操作可能持续超过 10 分钟；只有超过 24 小时仍 PENDING
        // 才视为进程崩溃，避免把成功操作提前改成 FAILURE 且无法回写。
        await reapStalePendingAuditLogs(24 * 60);
      } catch (error) {
        apiConsole.error("[Cron] PENDING 审计回收失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Process Audit Export Jobs",
    cronExpression: "* * * * *", // 每分钟处理队列
    isCleanup: true,
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
    name: "Process Audit Retention Jobs",
    cronExpression: "* * * * *",
    isCleanup: true,
    handler: async () => {
      // 审计保留使用独立高权限数据库角色；未配置时跳过，不影响其他 cron。
      if (!process.env.AUDIT_RETENTION_DATABASE_URL) return;
      try {
        const { processAuditRetentionJobs } = await import("./audit-retention-worker");
        const count = await processAuditRetentionJobs();
        if (count > 0) {
          apiConsole.info(`[Cron] 审计保留任务处理: ${count} 个`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 审计保留任务处理失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Audit Anomaly Scan",
    cronExpression: "*/5 * * * *",
    isCleanup: true,
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
    isCleanup: true,
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
    isCleanup: true,
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始重投失败的资料变更 Webhook...");
        const result = await retryFailedWebhookDeliveries();
        apiConsole.info(
          `[Cron] 资料变更 Webhook 重投完成: 成功 ${result.delivered} 条, 待下次重试 ${result.failed} 条, 丢弃 ${result.dropped} 条`
        );
        const statusDelivered = await retryFailedStatusWebhooks();
        if (statusDelivered > 0) {
          apiConsole.info(`[Cron] 账户状态 Webhook 补偿成功 ${statusDelivered} 条`);
        }
        try {
          await scanWebhookFailureQueues();
        } catch (alertError) {
          apiConsole.warn("[Cron] Webhook 失败队列告警检查异常:", alertError);
        }
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
    isCleanup: true,
    handler: async () => {
      try {
        const result = await expirePendingRedemptions();
        if (result.scanned > 0) {
          notifyRedemptionAutoCancelled(result);
        }
        if (result.cancelled > 0 || result.failed > 0) {
          apiConsole.warn(
            `[Cron] 超时兑换处理: 扫描 ${result.scanned}，取消 ${result.cancelled}，退还 ${result.refundedPoints} 积分，跳过 ${result.skipped}，失败 ${result.failed}`
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
        if (result.issues.length > 0 || result.deletedUsersWithRemaining > 0) {
          notifyPointInvariantIssues(result);
        }
        if (result.issues.length > 0 || result.deletedUsersWithRemaining > 0) {
          throw new Error(
            `积分账本对账发现 ${result.issues.length} 个异常、${result.deletedUsersWithRemaining} 个注销后仍有积分的账户`
          );
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
    isCleanup: true,
    handler: async () => {
      try {
        const count = await failStaleImportBatches(30);
        if (count > 0) {
          apiConsole.warn(`[Cron] 已标记 ${count} 个超时消费导入批次为 FAILED`);
          notifyStaleSpentImportBatches(count);
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
          notifySpentOrderConflicts(result);
          apiConsole.error(
            `[Cron] 发现 ${result.count} 个消费订单跨来源冲突: ${result.items
              .slice(0, 5)
              .map((item) => `${item.orderNo}(${item.sources.join("+")})`)
              .join(", ")}`
          );
          throw new Error(`发现 ${result.count} 个消费订单存在跨来源重复入账，请人工核对`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 消费订单冲突检测失败:", error);
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
    isCleanup: true,
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
    name: "Anonymize Deleted Admins",
    // 每天 03:45：离职管理员软删除满 ADMIN_RETENTION_DAYS（默认 365 天）后匿名化
    cronExpression: "45 3 * * *",
    isCleanup: true,
    handler: async () => {
      try {
        const result = await anonymizeDeletedAdmins(50);
        if (result.anonymized > 0) {
          apiConsole.info(
            `[Cron] 离职管理员匿名化完成: 扫描 ${result.scanned}，匿名化 ${result.anonymized}`
          );
        }
      } catch (error) {
        apiConsole.error("[Cron] 离职管理员匿名化失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Ops Daily Digest",
    // 每天 23:55：运营当日新增、待办、积压摘要（综合管理群 + 运营群）。
    // 不放在 23:59:59：cron/DB 稍有延迟就会跨天，dayKey 变成次日并发出错误日报。
    cronExpression: "55 23 * * *",
    handler: async () => {
      try {
        await sendOpsDailyDigest();
      } catch (error) {
        apiConsole.error("[Cron] 运营日报发送失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Gift Low Stock Alert",
    // 每 6 小时检查一次；同一库存状态 12 小时内只提醒一次（运营群 + 综合管理群）
    cronExpression: "0 */6 * * *",
    isCleanup: true,
    handler: async () => {
      try {
        await sendGiftLowStockAlert();
      } catch (error) {
        apiConsole.error("[Cron] 礼品库存预警发送失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Send Redemption Expiry Reminders",
    // 每天 09:10：兑换待履约临期 T-7 / T-1 提醒（运营群）
    cronExpression: "10 9 * * *",
    handler: async () => {
      try {
        await sendRedemptionExpiryReminders();
      } catch (error) {
        apiConsole.error("[Cron] 兑换临期提醒失败:", error);
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
    name: "Process Media Deletion Tasks",
    cronExpression: "*/5 * * * *",
    isCleanup: true,
    handler: async () => {
      await processMediaDeletionTasks();
    },
  },
  {
    name: "Reconcile Stale Approved Admin Approvals",
    // 补偿“已批准但执行前进程崩溃”的 AUTO 审批（尤其 Excel 导入）
    cronExpression: "*/5 * * * *",
    isCleanup: true,
    handler: async () => {
      try {
        const count = await reconcileStaleApprovedApprovals();
        if (count > 0) {
          apiConsole.info(`[Cron] 补偿执行停留 APPROVED 的审批: ${count} 条`);
        }
      } catch (error) {
        apiConsole.error("[Cron] 补偿执行审批失败:", error);
        throw error;
      }
    },
  },
  {
    name: "Expire Pending Admin Approvals",
    cronExpression: "*/10 * * * *",
    isCleanup: true,
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
  {
    name: "Process Notification Outbox",
    cronExpression: "* * * * *",
    isCleanup: true,
    handler: async () => {
      const stats = await processNotificationOutbox({ limit: 10 });
      if (stats.claimed > 0) {
        apiConsole.info(
          `[Cron] 通知 Outbox：claimed=${stats.claimed} sent=${stats.sent} retried=${stats.retried} dead=${stats.dead} skipped=${stats.skipped} failed=${stats.failed}`
        );
      }
      if (stats.dead > 0) {
        apiConsole.error(`[Cron] 通知 Outbox 新增死信 ${stats.dead} 条，请到管理端处理`);
        notifyNotificationOutboxDead(stats.dead);
      }
    },
  },
  {
    name: "Cleanup Notification Outbox",
    cronExpression: "20 4 * * *",
    isCleanup: true,
    handler: async () => {
      const count = await cleanupNotificationOutbox();
      if (count > 0) {
        apiConsole.info(`[Cron] 清理历史通知 Outbox: ${count} 条`);
      }
    },
  },
  {
    name: "Auto Complete Redemptions",
    cronExpression: "20 3 * * *",
    isCleanup: true,
    handler: async () => {
      const count = await autoCompleteRedemptions();
      if (count > 0) {
        apiConsole.info(`[Cron] 自动完成兑换收货: ${count} 条`);
      }
    },
  },
  {
    name: "Close Stale After-Sales",
    cronExpression: "40 3 * * *",
    isCleanup: true,
    handler: async () => {
      const count = await closeStaleAfterSales();
      if (count > 0) {
        apiConsole.info(`[Cron] 关闭超时未寄回售后: ${count} 条`);
      }
    },
  },
  {
    name: "After-Sales Aging Alert",
    cronExpression: "30 9 * * *",
    isCleanup: true,
    handler: async () => {
      await sendAfterSalesAgingAlert();
    },
  },
  {
    name: "Reap Stale Cron Runs",
    cronExpression: "*/5 * * * *",
    isCleanup: true,
    suppressFailureAlert: true,
    handler: async () => {
      const count = await reapStaleCronRuns();
      if (count > 0) {
        apiConsole.warn(`[Cron] 回收超时/崩溃残留运行记录: ${count} 条`);
      }
    },
  },
];

export interface CronTaskInfo {
  key: string;
  name: string;
  cronExpression: string;
  isCleanup: boolean;
  timeoutMs: number;
}

export interface CronRunResult {
  ok: boolean;
  status: CronTaskRunStatus;
  runId?: string;
  error?: string;
  durationMs?: number;
}

/** 任务元信息（供管理端展示，不暴露 handler） */
export function listCronTasks(): CronTaskInfo[] {
  return tasks.map((t) => ({
    key: getCronTaskKey(t.name),
    name: t.name,
    cronExpression: t.cronExpression,
    isCleanup: Boolean(t.isCleanup),
    timeoutMs: t.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
  }));
}

function findTask(identifier: string): ScheduledTask | undefined {
  return tasks.find((t) => t.name === identifier || getCronTaskKey(t.name) === identifier);
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
      await prisma.cronTaskRun.deleteMany({
        where: {
          startedAt: { lt: cutoff[0].startedAt },
          // 不删除仍在运行的记录，避免 reaper 丢失活动线索
          OR: [{ status: null }, { status: { not: "RUNNING" } }],
        },
      });
    }
  } catch (err) {
    apiConsole.warn("[Cron] 运行记录清理失败:", err);
  }
}

async function createSkippedRun(
  task: ScheduledTask,
  trigger: CronTaskTrigger,
  adminId: string | undefined,
  error: string,
  options?: RunCronTaskOptions
): Promise<string | undefined> {
  try {
    const run = await prisma.cronTaskRun.create({
      data: {
        taskKey: getCronTaskKey(task.name),
        taskName: task.name,
        trigger,
        status: "SKIPPED",
        success: false,
        error,
        adminId: adminId ?? null,
        adminEmail: options?.adminEmail ?? null,
        adminName: options?.adminName ?? null,
        startedAt: new Date(),
        finishedAt: new Date(),
        timeoutMs: task.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
        sourceRunId: options?.sourceRunId ?? null,
        batchId: options?.batchId ?? null,
      },
      select: { id: true },
    });
    return run.id;
  } catch (recordError) {
    apiConsole.warn("[Cron] 跳过记录写入失败:", recordError);
    return undefined;
  }
}

export interface RunCronTaskOptions {
  sourceRunId?: string;
  batchId?: string;
  adminEmail?: string;
  adminName?: string;
}

/**
 * 执行指定任务并落运行记录（cron 调度、管理端与外部调度器共用）。
 *
 * RUNNING 记录在 handler 执行前创建，心跳同时续租 CronTaskLock 与 CronTaskRun；
 * 进程崩溃后由 reapStaleCronRuns 依据心跳与锁状态回收为 TIMEOUT。
 */
export async function runCronTask(
  taskNameOrKey: string,
  trigger: CronTaskTrigger,
  adminId?: string,
  options?: RunCronTaskOptions
): Promise<CronRunResult> {
  const task = findTask(taskNameOrKey);
  if (!task) return { ok: false, status: "FAILED", error: "任务不存在" };

  const lockOwner = await acquireCronLock(task.name);
  if (!lockOwner) {
    const runId = await createSkippedRun(task, trigger, adminId, "任务正在执行中，已跳过", options);
    return {
      ok: false,
      status: "SKIPPED",
      runId,
      error: "任务正在执行中，请稍后重试",
    };
  }

  const startedAt = new Date();
  const timeoutMs = task.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  let runId: string;
  try {
    const run = await prisma.cronTaskRun.create({
      data: {
        taskKey: getCronTaskKey(task.name),
        taskName: task.name,
        trigger,
        status: "RUNNING",
        success: null,
        adminId: adminId ?? null,
        adminEmail: options?.adminEmail ?? null,
        adminName: options?.adminName ?? null,
        startedAt,
        heartbeatAt: startedAt,
        lockOwner,
        timeoutMs,
        sourceRunId: options?.sourceRunId ?? null,
        batchId: options?.batchId ?? null,
      },
      select: { id: true },
    });
    runId = run.id;
  } catch (error) {
    await releaseCronLock(task.name, lockOwner);
    const message = error instanceof Error ? error.message : String(error);
    apiConsole.error("[Cron] RUNNING 记录写入失败，拒绝无记录执行:", error);
    return { ok: false, status: "FAILED", error: `运行记录写入失败：${message}` };
  }

  const lockHeartbeat = startCronLockHeartbeat(task.name, lockOwner);
  const runHeartbeat = setInterval(() => {
    void prisma.cronTaskRun
      .updateMany({
        where: { id: runId, status: "RUNNING", lockOwner },
        data: { heartbeatAt: new Date() },
      })
      .catch((error) => apiConsole.warn("[Cron] 运行心跳更新失败:", error));
  }, 60 * 1000);
  runHeartbeat.unref();

  const finish = async (status: "SUCCESS" | "FAILED", error?: string): Promise<boolean> => {
    const finishedAt = new Date();
    const updated = await prisma.cronTaskRun
      .updateMany({
        where: { id: runId, status: "RUNNING", lockOwner },
        data: {
          status,
          success: status === "SUCCESS",
          error: error ? error.slice(0, 2000) : null,
          finishedAt,
          heartbeatAt: finishedAt,
        },
      })
      .catch((recordError) => {
        apiConsole.warn("[Cron] 终态记录更新失败:", recordError);
        return { count: 0 } as { count: number };
      });
    return updated.count > 0;
  };

  try {
    await task.handler();
    if (lockHeartbeat.hasLostLock()) throw new Error("任务执行期间锁已丢失，请核查执行结果");
    const finalized = await finish("SUCCESS");
    if (!finalized) {
      return {
        ok: false,
        status: "TIMEOUT",
        runId,
        error: "运行已被回收，结果未覆盖",
        durationMs: Date.now() - startedAt.getTime(),
      };
    }
    return {
      ok: true,
      status: "SUCCESS",
      runId,
      durationMs: Date.now() - startedAt.getTime(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finalized = await finish("FAILED", message);
    if (finalized && !task.suppressFailureAlert) {
      notifyCronFailure(task.name, trigger, message, "FAILED");
    }
    return {
      ok: false,
      status: finalized ? "FAILED" : "TIMEOUT",
      runId,
      error: message,
      durationMs: Date.now() - startedAt.getTime(),
    };
  } finally {
    clearInterval(runHeartbeat);
    await lockHeartbeat.stop();
    await releaseCronLock(task.name, lockOwner);
    await pruneCronRuns();
  }
}

/**
 * 回收心跳超时且锁已失效的 RUNNING 记录。
 * 不强制 kill 仍在执行的 handler；仅处理崩溃/卡死后的残留状态。
 */
export async function reapStaleCronRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CRON_RUN_STALE_MS);
  const stale = await prisma.cronTaskRun.findMany({
    where: {
      status: "RUNNING",
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, startedAt: { lt: cutoff } }],
    },
    orderBy: { startedAt: "asc" },
    take: 200,
    select: {
      id: true,
      taskKey: true,
      taskName: true,
      trigger: true,
      lockOwner: true,
    },
  });

  let reaped = 0;
  for (const run of stale) {
    const lock = await prisma.cronTaskLock.findUnique({
      where: { taskName: run.taskName },
      select: { lockedUntil: true, lockedBy: true },
    });
    // 锁仍有效且属于同一次运行：说明 handler 可能仍在工作，不回收
    if (lock && lock.lockedUntil > now && (!run.lockOwner || lock.lockedBy === run.lockOwner)) {
      continue;
    }

    const message = "执行超时或进程中断，任务已回收";
    const updated = await prisma.cronTaskRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: "TIMEOUT",
        success: false,
        error: message,
        finishedAt: now,
        heartbeatAt: now,
      },
    });
    if (updated.count > 0) {
      reaped += 1;
      const task = findTask(run.taskKey ?? run.taskName);
      if (!task?.suppressFailureAlert) {
        notifyCronFailure(
          run.taskName,
          (run.trigger as CronTaskTrigger) || "cron",
          message,
          "TIMEOUT"
        );
      }
    }
  }
  return reaped;
}

/**
 * 依次执行全部清理类任务（供外部调度器端点 /api/cron/run 调用）
 * 与进程内 cron / 管理端手动触发共用 runCronTask，运行记录同样落库 CronTaskRun
 */
export async function runCleanupCronTasks(trigger: CronTaskTrigger = "external"): Promise<
  {
    name: string;
    key: string;
    ok: boolean;
    status: CronTaskRunStatus;
    runId?: string;
    error?: string;
  }[]
> {
  const results: {
    name: string;
    key: string;
    ok: boolean;
    status: CronTaskRunStatus;
    runId?: string;
    error?: string;
  }[] = [];
  for (const task of tasks) {
    if (!task.isCleanup) continue;
    const result = await runCronTask(task.name, trigger);
    results.push({ name: task.name, key: getCronTaskKey(task.name), ...result });
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
