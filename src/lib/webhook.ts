/**
 * Webhook 分发工具
 *
 * 用于向子项目推送账户状态变更通知。
 * 带重试机制（3 次，指数退避 1s/4s/16s），失败记录到审计日志。
 */
import { apiConsole } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";

export interface StatusChangeWebhook {
  userId: string;
  oldStatus: string;
  newStatus: string;
  source?: string;
}

export interface WebhookTarget {
  url: string;
  clientId: string;
  clientName: string;
}

/**
 * 向单个 Webhook 端点发送 POST 通知（带重试）
 */
async function sendWebhook(
  target: WebhookTarget,
  payload: Record<string, unknown>,
  retries: number = 3
): Promise<boolean> {
  const delays = [1000, 4000, 16000]; // 指数退避

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return true;
      }

      apiConsole.warn(
        `[Webhook] 第 ${attempt + 1} 次尝试失败 (${target.clientId}): HTTP ${response.status}`
      );
    } catch (error) {
      apiConsole.warn(`[Webhook] 第 ${attempt + 1} 次尝试异常 (${target.clientId}):`, error);
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt] || 16000));
    }
  }

  return false;
}

/**
 * 分发账户状态变更 Webhook 通知
 *
 * 管理员封禁/解冻用户时调用，向所有已注册 Webhook URL 的子项目推送通知。
 *
 * @param change - 状态变更详情
 * @param targets - Webhook 目标列表
 */
export async function dispatchStatusChangeWebhook(
  change: StatusChangeWebhook,
  targets: WebhookTarget[]
): Promise<void> {
  if (targets.length === 0) return;

  const payload = {
    event: "account_status_change",
    sub: change.userId,
    old_status: change.oldStatus,
    new_status: change.newStatus,
    source: change.source || "admin",
    timestamp: new Date().toISOString(),
  };

  apiConsole.info(
    `[Webhook] 分发状态变更通知 (userId=${change.userId}, ${change.oldStatus} -> ${change.newStatus}) 到 ${targets.length} 个目标`
  );

  const results = await Promise.allSettled(targets.map((target) => sendWebhook(target, payload)));

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const target = targets[i];
    const success = result.status === "fulfilled" && result.value;

    if (!success) {
      // 记录失败到 SSO 审计日志
      recordSsoEvent({
        event: "status_change",
        userId: change.userId,
        clientId: target.clientId,
        clientName: target.clientName,
        success: false,
        detail: {
          oldStatus: change.oldStatus,
          newStatus: change.newStatus,
          webhookUrl: target.url,
          error: result.status === "rejected" ? String(result.reason) : "max_retries_exceeded",
        },
      });

      apiConsole.error(`[Webhook] 通知失败 (${target.clientId}, userId=${change.userId})`);
    } else {
      recordSsoEvent({
        event: "status_change",
        userId: change.userId,
        clientId: target.clientId,
        clientName: target.clientName,
        success: true,
        detail: {
          oldStatus: change.oldStatus,
          newStatus: change.newStatus,
        },
      });
    }
  }
}
