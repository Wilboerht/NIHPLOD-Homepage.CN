/**
 * 定时任务管理器
 * 自托管服务器上使用 node-cron 运行周期性任务
 * 通过 ENABLE_LOCAL_CRON=true 环境变量启用
 */
import cron from "node-cron";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "./order";
import { queryAndFulfillExpiredPendingOrders } from "./payment-query";
import { downloadWechatPlatformCerts } from "./wechat-pay";
import { autoExpireUserCoupons } from "./coupon";
import {
  cleanupExpiredRefreshTokens,
  cleanupOldLoginAttempts,
  cleanupExpiredSmsCodes,
  cleanupRevokedSessionsAndTokens,
} from "./auth-security";
import { cleanupExpiredCodes } from "./oauth-code";
import { cleanupOldSsoAuditEvents } from "./sso-audit";
import { cleanupRateLimitRecords } from "./ratelimit";
import { cleanupOldTransactionRawData } from "./transaction";
import { apiConsole } from "@/lib/logger";

interface ScheduledTask {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
}

// 定义所有定时任务
const tasks: ScheduledTask[] = [
  {
    name: "Refresh WechatPay Platform Certificates",
    cronExpression: "0 1 * * *", // 每天凌晨 1 点刷新
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始刷新微信支付平台证书...");
        const result = await downloadWechatPlatformCerts();
        if (result.success) {
          apiConsole.info(`[Cron] 微信支付平台证书刷新完成: ${result.count} 个证书`);
        } else {
          apiConsole.error("[Cron] 微信支付平台证书刷新失败:", result.error);
        }
      } catch (error) {
        apiConsole.error("[Cron] 微信支付平台证书刷新任务失败:", error);
      }
    },
  },
  {
    name: "Query Expired Pending Orders",
    cronExpression: "*/30 * * * *", // 每30分钟执行一次，在自动取消前兜底查询
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始执行待支付订单主动查询任务...");
        const result = await queryAndFulfillExpiredPendingOrders(25);
        apiConsole.info(`[Cron] 主动查询完成: ${result.fulfilledCount} 个订单已支付`);
      } catch (error) {
        apiConsole.error("[Cron] 待支付订单主动查询任务失败:", error);
      }
    },
  },
  {
    name: "Auto Cancel Expired Orders",
    cronExpression: "*/30 * * * *", // 每30分钟执行一次
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始执行订单取消任务...");
        const result = await autoCancelExpiredOrders(30);
        apiConsole.info(`[Cron] 订单取消完成: ${result.canceledCount} 个订单被取消`);
      } catch (error) {
        apiConsole.error("[Cron] 订单取消任务失败:", error);
      }
    },
  },
  {
    name: "Auto Complete Shipped Orders",
    cronExpression: "0 0 * * *", // 每天午夜执行一次
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始执行订单完成任务...");
        const result = await autoCompleteShippedOrders(15);
        apiConsole.info(`[Cron] 订单完成处理: ${result.completedCount} 个订单自动完成`);
      } catch (error) {
        apiConsole.error("[Cron] 订单完成任务失败:", error);
      }
    },
  },
  {
    name: "Auto Expire User Coupons",
    cronExpression: "0 2 * * *", // 每天凌晨 2 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始执行优惠券过期清理任务...");
        const result = await autoExpireUserCoupons();
        apiConsole.info(`[Cron] 优惠券过期清理完成: ${result.expiredCount} 张优惠券被标记为过期`);
      } catch (error) {
        apiConsole.error("[Cron] 优惠券过期清理任务失败:", error);
      }
    },
  },
  {
    name: "Cleanup Expired Refresh Tokens",
    cronExpression: "0 3 * * *", // 每天凌晨 3 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期 Refresh Token...");
        const count = await cleanupExpiredRefreshTokens();
        apiConsole.info(`[Cron] 过期 Refresh Token 清理完成: ${count} 个`);
      } catch (error) {
        apiConsole.error("[Cron] 过期 Refresh Token 清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Expired Rate Limit Records",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期限流记录...");
        const count = await cleanupRateLimitRecords();
        apiConsole.info(`[Cron] 过期限流记录清理完成: ${count} 条`);
      } catch (error) {
        apiConsole.error("[Cron] 过期限流记录清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Old Login Attempts + SSO Audit Events",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理陈旧登录尝试记录...");
        const loginCount = await cleanupOldLoginAttempts();
        apiConsole.info(`[Cron] 登录尝试记录清理完成: ${loginCount} 条`);
      } catch (error) {
        apiConsole.error("[Cron] 登录尝试记录清理失败:", error);
      }

      try {
        apiConsole.info("[Cron] 开始清理 90 天前的 SSO 审计日志...");
        const auditCount = await cleanupOldSsoAuditEvents();
        apiConsole.info(`[Cron] SSO 审计日志清理完成: ${auditCount} 条`);
      } catch (error) {
        apiConsole.error("[Cron] SSO 审计日志清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Expired Sms Codes",
    cronExpression: "0 4 * * *", // 每天凌晨 4 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期验证码记录...");
        const count = await cleanupExpiredSmsCodes();
        apiConsole.info(`[Cron] 过期验证码记录清理完成: ${count} 条`);
      } catch (error) {
        apiConsole.error("[Cron] 验证码记录清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Expired OAuth Authorization Codes",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期授权码...");
        const count = await cleanupExpiredCodes();
        apiConsole.info(`[Cron] 过期授权码清理完成: ${count} 条`);
      } catch (error) {
        apiConsole.error("[Cron] 过期授权码清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Revoked Sessions and Tokens",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理已撤销的会话和 Token...");
        const result = await cleanupRevokedSessionsAndTokens();
        apiConsole.info(
          `[Cron] 已撤销记录清理完成: ${result.sessions} 个会话, ${result.tokens} 个 Token`
        );
      } catch (error) {
        apiConsole.error("[Cron] 已撤销记录清理失败:", error);
      }
    },
  },
  {
    name: "Cleanup Old Transaction RawData",
    cronExpression: "0 5 * * *", // 每天凌晨 5 点执行
    handler: async () => {
      try {
        apiConsole.info("[Cron] 开始清理过期交易原始数据...");
        const count = await cleanupOldTransactionRawData();
        apiConsole.info(`[Cron] 过期交易原始数据清理完成: ${count} 条`);
      } catch (error) {
        apiConsole.error("[Cron] 交易原始数据清理失败:", error);
      }
    },
  },
];

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

  // 启动时立即刷新一次微信证书，避免重启后证书缓存为空导致回调验签失败
  downloadWechatPlatformCerts().catch((error) => {
    apiConsole.error("[Cron] 启动时刷新微信支付平台证书失败:", error);
  });

  for (const task of tasks) {
    try {
      // runOnInit: false 表示不在启动时立即执行，而是在下一个定时周期执行
      const job = cron.schedule(task.cronExpression, task.handler, {
        runOnInit: false,
      });

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
