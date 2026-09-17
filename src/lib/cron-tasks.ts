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
import { cleanupInternalApiNonces } from "./internal-api";
import { cleanupOldSsoAuditEvents } from "./sso-audit";
import { retryFailedBackchannelLogouts } from "./backchannel-logout";
import { retryFailedWebhookDeliveries } from "./profile-webhook";
import { cleanupRateLimitRecords } from "./ratelimit";
import { grantBirthdayRewards } from "./points-ledger";
import { expirePointsCron } from "./points-ledger";
import { apiConsole } from "@/lib/logger";
import { prisma } from "./prisma";

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
    name: "Cleanup Old Login Attempts + SSO Audit Events",
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

      try {
        apiConsole.info("[Cron] 开始清理 90 天前的 SSO 审计日志...");
        const auditCount = await cleanupOldSsoAuditEvents();
        apiConsole.info(`[Cron] SSO 审计日志清理完成: ${auditCount} 条`);
        markCleanupOk("SSO 审计日志");
      } catch (error) {
        apiConsole.error("[Cron] SSO 审计日志清理失败:", error);
        markCleanupFailed("SSO 审计日志");
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
        apiConsole.info(`[Cron] 过期授权码清理完成: ${count} 条`);
        markCleanupOk("过期授权码");
      } catch (error) {
        apiConsole.error("[Cron] 过期授权码清理失败:", error);
        markCleanupFailed("过期授权码");
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
    name: "Retry Failed Backchannel Logout Notifications",
    cronExpression: "*/15 * * * *", // 每 15 分钟重投一次
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始重投失败的 Backchannel Logout 通知...");
        const result = await retryFailedBackchannelLogouts();
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
          void runCronTask(task.name, "cron");
        },
        {
          runOnInit: false,
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
