/**
 * Webhook 分发工具
 *
 * 用于向子项目推送账户状态变更通知。
 * 带重试机制（3 次，指数退避 1s/4s/16s），失败记录到审计日志。
 */
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";
import { isSafeBackchannelUrl } from "@/lib/backchannel-logout";
import { postPublicHttps } from "@/lib/outbound-http";
import type { UserStatus } from "@/generated/prisma/client";
import { notifyWebhookFailureDrop } from "@/lib/admin-alert";

// 状态值约定（与商城侧 zod 校验对齐）：发送 User.status 原始大写枚举 ACTIVE/SUSPENDED/BANNED；
// 删除事件 newStatus 固定为小写 "deleted"（商城侧按此约定映射为禁用账户）
export type WebhookUserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

/**
 * User.status → webhook 状态值：DELETED 归入既有的小写 "deleted" 约定，
 * 其余原始大写枚举透传（商城侧 zod 不接受 "DELETED" 大写值）
 */
export function toWebhookStatus(status: UserStatus): WebhookUserStatus | "deleted" {
  return status === "DELETED" ? "deleted" : status;
}

export interface StatusChangeWebhook {
  userId: string;
  oldStatus: WebhookUserStatus | "deleted"; // 注销场景：删除前状态为 DELETED 时归入 "deleted"
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
 *
 * SSRF 防护：env 配置的 URL 与 backchannel logout 回调同口径校验
 * （https + 非公网主机名拒绝），不合规的条目直接丢弃并记录告警
 */
export function getStatusChangeWebhookTargets(): WebhookTarget[] {
  const raw = process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url) => {
      if (!isSafeBackchannelUrl(url)) {
        apiConsole.warn(`[Webhook] 忽略不安全的 Webhook URL（要求 https 公网地址）: ${url}`);
        return false;
      }
      return true;
    })
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
    headers["X-Webhook-Signature"] =
      `t=${timestamp},v1=${signWebhookPayload(secret, timestamp, body)}`;
  } else if (process.env.NODE_ENV === "production") {
    // 生产环境拒绝无签名发送：接收方无法校验来源，明文通知可能被伪造利用
    apiConsole.error(
      `[Webhook] 生产环境未配置签名密钥（SSO_WEBHOOK_SECRET），拒绝发送 (${target.clientId})`
    );
    return false;
  } else {
    apiConsole.warn(
      `[Webhook] 未配置签名密钥（SSO_WEBHOOK_SECRET），通知将不带签名 (${target.clientId})`
    );
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 复用统一出站防护：HTTPS + DNS pin + 禁止重定向 + 响应体上限
      const response = await postPublicHttps(target.url, {
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

      await prisma.webhookDeliveryFailure
        .create({
          data: {
            userId: change.userId,
            clientId: target.clientId,
            targetUrl: target.url,
            payload,
            nextRetryAt: new Date(Date.now() + 60_000),
          },
        })
        .catch((error: unknown) => apiConsole.error("[Webhook] 状态通知补偿记录写入失败:", error));

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

export interface ManualStatusWebhookRetryResult {
  ok: boolean;
  status: "delivered" | "failed" | "dropped" | "not_found";
  error?: string;
  attempts?: number;
}

async function resolveStatusWebhookRetryTarget(
  failure: { clientId: string; targetUrl?: string | null },
  options?: { requireActiveClient?: boolean }
): Promise<WebhookTarget | null> {
  if (failure.targetUrl && isSafeBackchannelUrl(failure.targetUrl)) {
    return {
      clientId: failure.clientId,
      clientName: failure.clientId,
      url: failure.targetUrl,
    };
  }
  if (failure.targetUrl) return null;

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: failure.clientId },
    select: { clientId: true, name: true, webhookUri: true, isActive: true },
  });
  if (!client?.webhookUri || !isSafeBackchannelUrl(client.webhookUri)) return null;
  if (options?.requireActiveClient && !client.isActive) return null;
  return { clientId: client.clientId, clientName: client.name, url: client.webhookUri };
}

/**
 * 管理端手动重投单条“账户状态变更”Webhook。
 *
 * 与资料 Webhook 的 payload 结构不同（没有 profile/membership），不能复用
 * profile-webhook 的 retryWebhookFailureById，否则会被误判为“无可投递字段”而丢弃。
 */
export async function retryStatusWebhookFailureById(
  id: string
): Promise<ManualStatusWebhookRetryResult> {
  const failure = await prisma.webhookDeliveryFailure.findUnique({ where: { id } });
  if (!failure) return { ok: false, status: "not_found" };

  const payload = failure.payload as Record<string, unknown> | null;
  if (!payload || payload.event !== "account_status_change") {
    return { ok: false, status: "not_found" };
  }

  // 用 nextRetryAt CAS 认领，避免与 cron 自动重投并发；手动重投忽略退避时间。
  const claimed = await prisma.webhookDeliveryFailure.updateMany({
    where: { id, nextRetryAt: failure.nextRetryAt },
    data: { nextRetryAt: new Date(Date.now() + 5 * 60_000) },
  });
  if (claimed.count === 0) return { ok: false, status: "not_found" };

  const target = await resolveStatusWebhookRetryTarget(failure, {
    requireActiveClient: true,
  });
  if (!target) {
    await prisma.webhookDeliveryFailure.delete({ where: { id } }).catch(() => undefined);
    recordSsoEvent({
      event: "status_change",
      userId: failure.userId,
      clientId: failure.clientId,
      clientName: failure.clientId,
      success: false,
      detail: { reason: "target_unavailable", manual: true },
    });
    return { ok: true, status: "dropped", attempts: failure.attempts };
  }

  const success = await sendWebhook(target, payload, 0);
  if (success) {
    await prisma.webhookDeliveryFailure.delete({ where: { id } });
    recordSsoEvent({
      event: "status_change",
      userId: failure.userId,
      clientId: failure.clientId,
      clientName: target.clientName,
      success: true,
      detail: { manual: true, attempts: failure.attempts },
    });
    return { ok: true, status: "delivered", attempts: failure.attempts };
  }

  const attempts = failure.attempts + 1;
  if (attempts >= 8) {
    await prisma.webhookDeliveryFailure.delete({ where: { id } });
    recordSsoEvent({
      event: "status_change",
      userId: failure.userId,
      clientId: failure.clientId,
      clientName: target.clientName,
      success: false,
      detail: { reason: "max_attempts_reached", manual: true, attempts },
    });
    return { ok: false, status: "dropped", error: "达到重试上限", attempts };
  }

  await prisma.webhookDeliveryFailure.update({
    where: { id },
    data: {
      attempts,
      nextRetryAt: new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 60 * 60 * 1000)),
    },
  });
  return { ok: false, status: "failed", error: "重投失败，已安排下一次重试", attempts };
}

export async function retryFailedStatusWebhooks(limit = 50): Promise<number> {
  const failures = await prisma.webhookDeliveryFailure.findMany({
    where: {
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 8 },
      payload: { path: ["event"], equals: "account_status_change" },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
  let delivered = 0;
  for (const failure of failures) {
    const claimed = await prisma.webhookDeliveryFailure.updateMany({
      where: { id: failure.id, nextRetryAt: failure.nextRetryAt },
      data: { nextRetryAt: new Date(Date.now() + 60_000) },
    });
    if (claimed.count === 0) continue;

    const target = await resolveStatusWebhookRetryTarget(failure);
    if (!target) {
      await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
      continue;
    }
    const payload = failure.payload as Record<string, unknown>;
    const success = await sendWebhook(target, payload, 0);
    if (success) {
      delivered += 1;
      await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
      continue;
    }

    const attempts = failure.attempts + 1;
    if (attempts >= 8) {
      await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
      notifyWebhookFailureDrop({
        kind: "account_status_change",
        clientId: failure.clientId,
        userId: failure.userId,
        attempts,
        error: "达到最大重试次数",
      });
    } else {
      await prisma.webhookDeliveryFailure.update({
        where: { id: failure.id },
        data: {
          attempts,
          nextRetryAt: new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 60 * 60 * 1000)),
        },
      });
    }
  }
  return delivered;
}
