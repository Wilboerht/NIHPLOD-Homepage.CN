/**
 * 用户资料变更 Webhook 推送
 *
 * 用户资料（昵称/头像/生日）变更后，向所有【该用户已授权（UserConsent 未撤销）
 * 且配置了 webhookUri 且 isActive】的 OAuthClient 投递签名事件 token，
 * 解决子项目只能轮询拉取资料、变更后缓存滞后的问题。
 *
 * 模式与 backchannel-logout.ts 一致：
 * - 载荷为签名 JWT（与 logout token 相同的 RS256 密钥，type="profile_event"）
 * - 同步投递失败重试 1 次，仍失败则落库 WebhookDeliveryFailure 补偿队列，
 *   由 cron 任务按指数退避周期重投
 * - 全程 fire-and-forget，不阻塞 profile API 响应
 */
import { signProfileEventToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";
import { isSafeBackchannelUrl } from "@/lib/backchannel-logout";

/** profile_update 事件标识（events claim 的 key） */
export const PROFILE_UPDATE_EVENT_URI = "https://nihplod.cn/event/profile_update";

/** 变更后的公开资料快照（与 userinfo profile scope 输出一致，不含手机号） */
export interface ProfileSnapshot {
  nickname: string | null;
  avatar: string | null;
  birthday: string | null; // ISO 字符串
}

/**
 * 向已授权且配置了 webhookUri 的 OAuth Client 投递 profile_update 事件
 *
 * @param userId - 资料变更的用户 ID
 * @param profile - 变更后的公开资料快照
 */
export async function sendProfileUpdateWebhook(
  userId: string,
  profile: ProfileSnapshot
): Promise<void> {
  // 该用户已授权（未撤销）的 client
  const consents = await prisma.userConsent.findMany({
    where: { userId, revokedAt: null },
    select: { clientId: true },
  });
  const clientIds = [...new Set(consents.map((c) => c.clientId))];
  if (clientIds.length === 0) return;

  // 仅通知配置了 webhookUri 的活跃 client
  const clients = await prisma.oAuthClient.findMany({
    where: {
      clientId: { in: clientIds },
      isActive: true,
      webhookUri: { not: null },
    },
    select: { clientId: true, webhookUri: true },
  });

  // 并行投递：每个 client 独立处理，失败不影响其他 client
  const deliveryTasks = clients
    .filter((c) => c.webhookUri && isSafeBackchannelUrl(c.webhookUri))
    .map(async (client) => {
      if (!client.webhookUri) return;

      try {
        const eventToken = await signProfileEventToken({
          sub: userId,
          aud: client.clientId,
          events: { [PROFILE_UPDATE_EVENT_URI]: {} },
          jti: crypto.randomUUID(),
          profile,
        });

        let delivered = false;
        let failureReason = "http_request_failed_after_retry";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(client.webhookUri, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_token: eventToken }),
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              delivered = true;
              break;
            }
            // RP 返回非 2xx：视为投递失败，进入重试
            failureReason = `http_${res.status}_after_retry`;
            if (attempt < 1) await new Promise((r) => setTimeout(r, 2000));
          } catch {
            if (attempt < 1) await new Promise((r) => setTimeout(r, 2000));
          }
        }

        if (!delivered) {
          apiConsole.warn(`[ProfileWebhook] 资料变更推送失败（已重试）(${client.clientId})`);
          // lib 内部不保证有 request scope，无法使用 scheduleSsoEvent(after)，
          // 保持 fire-and-forget；投递本身已重试，审计丢失风险可接受
          recordSsoEvent({
            event: "profile_webhook",
            userId,
            clientId: client.clientId,
            success: false,
            detail: { reason: failureReason },
          });
          // 落库补偿队列，由 cron 任务周期重投（fire-and-forget，不阻断资料更新流程）
          prisma.webhookDeliveryFailure
            .create({
              data: {
                userId,
                clientId: client.clientId,
                payload: {
                  event: "profile_update",
                  profile: {
                    nickname: profile.nickname,
                    avatar: profile.avatar,
                    birthday: profile.birthday,
                  },
                },
                nextRetryAt: new Date(Date.now() + REDELIVERY_BASE_DELAY_MS),
              },
            })
            .catch((err) => {
              apiConsole.warn(`[ProfileWebhook] 失败记录落库失败 (${client.clientId}):`, err);
            });
        } else {
          // 成功投递也记录一条审计事件，便于核对通知过哪些 RP
          // （lib 内部无 request scope，保持 fire-and-forget，见上方失败分支注释）
          recordSsoEvent({
            event: "profile_webhook",
            userId,
            clientId: client.clientId,
            success: true,
          });
        }
      } catch (err) {
        apiConsole.warn(`[ProfileWebhook] 事件 token 签发失败 (${client.clientId}):`, err);
      }
    });

  await Promise.allSettled(deliveryTasks);
}

// ============================================
// 投递失败补偿（cron 周期重投）
// ============================================

const REDELIVERY_MAX_ATTEMPTS = 10;
const REDELIVERY_BASE_DELAY_MS = 60 * 1000; // 退避基数 1 分钟
const REDELIVERY_MAX_DELAY_MS = 60 * 60 * 1000; // 退避上限 1 小时

/**
 * 重投失败的资料变更 Webhook（由 cron 任务周期调用）
 *
 * 取 nextRetryAt 已到期的失败记录，按落库保存的资料快照重新签发事件 token
 * 投递（单次尝试，不再同步重试；快照可能已非最新，子项目应以 userinfo 为准）：
 * - 成功 / client 已删除或未配置 URI：删除记录
 * - 失败：attempts + 1 并按指数退避更新 nextRetryAt
 * - 超过重投上限：删除记录并写审计
 */
export async function retryFailedWebhookDeliveries(
  limit: number = 50
): Promise<{ delivered: number; failed: number; dropped: number }> {
  const failures = await prisma.webhookDeliveryFailure.findMany({
    where: { nextRetryAt: { lte: new Date() }, attempts: { lt: REDELIVERY_MAX_ATTEMPTS } },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let dropped = 0;

  for (const failure of failures) {
    try {
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: failure.clientId },
        select: { clientId: true, webhookUri: true },
      });
      const uri = client?.webhookUri;

      // client 已删除或未配置 webhookUri：补偿无意义，直接丢弃
      if (!uri || !isSafeBackchannelUrl(uri)) {
        await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
        dropped++;
        continue;
      }

      const payload = (failure.payload ?? {}) as { profile?: ProfileSnapshot };
      // 重新签发事件 token（原 token 已过期），jti 重新生成
      const eventToken = await signProfileEventToken({
        sub: failure.userId,
        aud: failure.clientId,
        events: { [PROFILE_UPDATE_EVENT_URI]: {} },
        jti: crypto.randomUUID(),
        profile: payload.profile ?? { nickname: null, avatar: null, birthday: null },
      });

      const res = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_token: eventToken }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);

      await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
      delivered++;
      recordSsoEvent({
        event: "profile_webhook",
        userId: failure.userId,
        clientId: failure.clientId,
        success: true,
        detail: { redelivered: true, attempts: failure.attempts + 1 },
      });
    } catch (err) {
      const attempts = failure.attempts + 1;
      if (attempts >= REDELIVERY_MAX_ATTEMPTS) {
        // 超上限：删除记录并写审计，不再重投
        await prisma.webhookDeliveryFailure
          .delete({ where: { id: failure.id } })
          .catch((e) => apiConsole.warn("[ProfileWebhook] 删除超限失败记录出错:", e));
        dropped++;
        recordSsoEvent({
          event: "profile_webhook",
          userId: failure.userId,
          clientId: failure.clientId,
          success: false,
          detail: { reason: "max_retries_exceeded", attempts },
        });
      } else {
        const backoff = Math.min(
          REDELIVERY_BASE_DELAY_MS * 2 ** attempts,
          REDELIVERY_MAX_DELAY_MS
        );
        await prisma.webhookDeliveryFailure.update({
          where: { id: failure.id },
          data: { attempts, nextRetryAt: new Date(Date.now() + backoff) },
        });
        failed++;
        apiConsole.warn(
          `[ProfileWebhook] 重投失败 (${failure.clientId})，第 ${attempts} 次:`,
          err
        );
      }
    }
  }

  return { delivered, failed, dropped };
}
