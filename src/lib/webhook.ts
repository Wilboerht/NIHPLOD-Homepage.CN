/**
 * Webhook 分发工具
 *
 * 用于向子项目推送账户状态变更通知。
 * 带重试机制（3 次，指数退避 1s/4s/16s），失败记录到审计日志。
 */
import { createHmac } from "crypto";
import { apiConsole } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";

// 状态值约定（与商城侧 zod 校验对齐）：发送 User.status 原始大写枚举 ACTIVE/SUSPENDED/BANNED；
// 删除事件 newStatus 固定为小写 "deleted"（商城侧按此约定映射为禁用账户）
export type WebhookUserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export interface StatusChangeWebhook {
  userId: string;
  oldStatus: WebhookUserStatus;
  newStatus: WebhookUserStatus | "deleted";
  source?: string;
}

export interface WebhookTarget {
  url: string;
  clientId: string;
  clientName: string;
  secret?: string; // 可选：目标级签名密钥，缺省回退到 SSO_WEBHOOK_SECRET 环境变量
}

/**
 * 计算 Webhook 签名：HMAC-SHA256("<ts>.<payload>", secret)，hex 编码
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function resolveWebhookSecret(target: WebhookTarget): string | undefined {
  return target.secret || process.env.SSO_WEBHOOK_SECRET || undefined;
}

/**
 * 从环境变量读取状态变更 Webhook 目标列表
 * SSO_STATUS_CHANGE_WEBHOOK_URLS：逗号分隔的 Webhook URL 列表
 */
export function getStatusChangeWebhookTargets(): WebhookTarget[] {
  const raw = process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      let name = url;
      try {
        name = new URL(url).hostname;
      } catch {
        // URL 解析失败时保留原始串，sendWebhook 阶段会以网络错误记录失败
      }
      return { url, clientId: name, clientName: name };
    });
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
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = resolveWebhookSecret(target);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    headers["X-Webhook-Signature"] = `t=${timestamp},v1=${signWebhookPayload(secret, timestamp, body)}`;
  } else {
    apiConsole.warn(`[Webhook] 未配置签名密钥（SSO_WEBHOOK_SECRET），通知将不带签名 (${target.clientId})`);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers,
        body,
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
      // （lib 内部不保证有 request scope，无法使用 scheduleSsoEvent(after)，保持 fire-and-forget）
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
