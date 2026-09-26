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
  /** OIDC 标准 gender claim；null = 未设置/保密 */
  gender: "male" | "female" | null;
}

/** 归一化 DB 中的 gender 字段（String?）为快照三态：非法/未设置一律为 null */
export function normalizeGender(gender: string | null | undefined): "male" | "female" | null {
  return gender === "male" || gender === "female" ? gender : null;
}

/** consent.scopes 解析为集合（空串/空白项忽略） */
function toScopeSet(scopes: string[] | null | undefined): Set<string> {
  return new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
}

/**
 * 按 consent scope 裁剪资料快照（口径与 /api/oauth/userinfo 一致）：
 * - `profile`：nickname / avatar / gender
 * - `birthday`：birthday
 * 两个 scope 都没有时返回 null（任何资料字段都不得投递）。
 */
export function trimProfileSnapshotByScopes(
  profile: ProfileSnapshot,
  scopes: Set<string>
): ProfileSnapshot | null {
  const hasProfile = scopes.has("profile");
  const hasBirthday = scopes.has("birthday");
  if (!hasProfile && !hasBirthday) return null;
  return {
    nickname: hasProfile ? profile.nickname : null,
    avatar: hasProfile ? profile.avatar : null,
    gender: hasProfile ? profile.gender : null,
    birthday: hasBirthday ? profile.birthday : null,
  };
}

/**
 * 向已授权且配置了 webhookUri 的 OAuth Client 投递 profile_update 事件
 *
 * @param userId - 资料变更的用户 ID
 * @param profile - 变更后的公开资料快照
 * @param membership - 可选会员信息快照（消费额/等级变化时携带，子站据此实时更新配额）
 */
export async function sendProfileUpdateWebhook(
  userId: string,
  profile: ProfileSnapshot,
  membership?: { level: string; totalSpent: number } | null
): Promise<void> {
  // 该用户已授权（未撤销）的 client 及其 scope（按 scope 裁剪快照，防越权外泄）
  const consents = await prisma.userConsent.findMany({
    where: { userId, revokedAt: null },
    select: { clientId: true, scopes: true },
  });
  if (consents.length === 0) return;
  const scopeByClient = new Map(consents.map((c) => [c.clientId, toScopeSet(c.scopes)]));
  const clientIds = [...scopeByClient.keys()];

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

      // PII 最小化：只投递该 client consent scope 覆盖的字段；
      // profile/birthday 都未授权且无 membership 时整条跳过
      const scopeSet = scopeByClient.get(client.clientId) ?? new Set<string>();
      const trimmedProfile = trimProfileSnapshotByScopes(profile, scopeSet);
      const includeMembership = membership !== undefined && scopeSet.has("membership");
      if (!trimmedProfile && !includeMembership) return;
      // profile claim 为事件结构必需字段；无 profile/birthday scope 时传全 null 占位（不含任何资料）
      const profileForEvent: ProfileSnapshot = trimmedProfile ?? {
        nickname: null,
        avatar: null,
        birthday: null,
        gender: null,
      };

      try {
        const eventToken = await signProfileEventToken({
          sub: userId,
          aud: client.clientId,
          events: { [PROFILE_UPDATE_EVENT_URI]: {} },
          jti: crypto.randomUUID(),
          profile: profileForEvent,
          ...(includeMembership && { membership }),
        });

        let delivered = false;
        let failureReason = "http_request_failed_after_retry";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(client.webhookUri, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_token: eventToken }),
              // 禁止跟随重定向：防注册的 https 地址 302 到内网（SSRF 绕过主机校验）
              redirect: "manual",
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
                  // 仅落库该 client scope 覆盖后的快照（重投时按原裁剪快照重新签发）
                  profile: {
                    nickname: profileForEvent.nickname,
                    avatar: profileForEvent.avatar,
                    birthday: profileForEvent.birthday,
                    gender: profileForEvent.gender,
                  },
                  ...(includeMembership && { membership }),
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
 * 重投前复核投递资格：用户仍存在且 ACTIVE，且对目标 client 的 consent 未撤销。
 * 覆盖"用户撤销授权/被注销后，失败队列仍继续投递资料快照"的合规缺口。
 */
async function isProfileDeliveryStillAllowed(
  userId: string,
  clientId: string
): Promise<boolean> {
  const [user, consent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    prisma.userConsent.findUnique({
      where: { userId_clientId: { userId, clientId } },
      select: { revokedAt: true },
    }),
  ]);
  return !!user && user.status === "ACTIVE" && !!consent && !consent.revokedAt;
}

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
      // 多实例部署时的乐观锁认领：先把 nextRetryAt 后移，
      // 认领失败（count=0）说明其他实例已接管该记录，直接跳过。
      // 认领后即使本实例崩溃，记录也会在被后移的时间点重新到期，不会丢失。
      const claim = await prisma.webhookDeliveryFailure.updateMany({
        where: { id: failure.id, nextRetryAt: failure.nextRetryAt },
        data: { nextRetryAt: new Date(Date.now() + REDELIVERY_BASE_DELAY_MS) },
      });
      if (claim.count === 0) continue;

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

      // consent 已撤销 / 用户已注销：不得继续投递资料快照，直接丢弃并审计
      if (!(await isProfileDeliveryStillAllowed(failure.userId, failure.clientId))) {
        await prisma.webhookDeliveryFailure.delete({ where: { id: failure.id } });
        dropped++;
        recordSsoEvent({
          event: "profile_webhook",
          userId: failure.userId,
          clientId: failure.clientId,
          success: false,
          detail: { reason: "consent_revoked_or_user_inactive" },
        });
        continue;
      }

      const payload = (failure.payload ?? {}) as {
        profile?: ProfileSnapshot;
        membership?: { level: string; totalSpent: number } | null;
      };
      // 重新签发事件 token（原 token 已过期），jti 重新生成；
      // 会员信息快照随落库 payload 一并读回（旧记录无此字段则不携带）
      const eventToken = await signProfileEventToken({
        sub: failure.userId,
        aud: failure.clientId,
        events: { [PROFILE_UPDATE_EVENT_URI]: {} },
        jti: crypto.randomUUID(),
        profile: payload.profile ?? { nickname: null, avatar: null, birthday: null, gender: null },
        ...(payload.membership !== undefined && { membership: payload.membership }),
      });

      const res = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_token: eventToken }),
        redirect: "manual",
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

export type ManualRetryResult = {
  ok: boolean;
  status: "delivered" | "failed" | "dropped" | "not_found";
  error?: string;
  attempts?: number;
};

/**
 * 管理端手动重投单条资料变更 Webhook（忽略 nextRetryAt，立即尝试一次）
 * - 目标 client 已删除/未配置/不安全：丢弃记录
 * - 成功：删除记录并写审计
 * - 失败：attempts+1 指数退避；达到上限则丢弃并写审计
 */
export async function retryWebhookFailureById(id: string): Promise<ManualRetryResult> {
  const failure = await prisma.webhookDeliveryFailure.findUnique({ where: { id } });
  if (!failure) return { ok: false, status: "not_found" };

  // 原子认领：删除成功（count=1）才继续，防止手动重投与 cron 重投并发导致重复投递
  const claimed = await prisma.webhookDeliveryFailure.deleteMany({ where: { id } });
  if (claimed.count === 0) return { ok: false, status: "not_found" };

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: failure.clientId },
    select: { clientId: true, webhookUri: true },
  });
  const uri = client?.webhookUri;
  if (!uri || !isSafeBackchannelUrl(uri)) {
    recordSsoEvent({
      event: "profile_webhook",
      userId: failure.userId,
      clientId: failure.clientId,
      success: false,
      detail: { reason: "target_unavailable", manual: true },
    });
    return { ok: true, status: "dropped" };
  }

  // consent 已撤销 / 用户已注销：不得继续投递资料快照
  if (!(await isProfileDeliveryStillAllowed(failure.userId, failure.clientId))) {
    recordSsoEvent({
      event: "profile_webhook",
      userId: failure.userId,
      clientId: failure.clientId,
      success: false,
      detail: { reason: "consent_revoked_or_user_inactive", manual: true },
    });
    return { ok: true, status: "dropped" };
  }

  try {
    const payload = (failure.payload ?? {}) as {
      profile?: ProfileSnapshot;
      membership?: { level: string; totalSpent: number } | null;
    };
    const eventToken = await signProfileEventToken({
      sub: failure.userId,
      aud: failure.clientId,
      events: { [PROFILE_UPDATE_EVENT_URI]: {} },
      jti: crypto.randomUUID(),
      profile: payload.profile ?? { nickname: null, avatar: null, birthday: null, gender: null },
      ...(payload.membership !== undefined && { membership: payload.membership }),
    });

    const res = await fetch(uri, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_token: eventToken }),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);

    recordSsoEvent({
      event: "profile_webhook",
      userId: failure.userId,
      clientId: failure.clientId,
      success: true,
      detail: { redelivered: true, manual: true, attempts: failure.attempts + 1 },
    });
    return { ok: true, status: "delivered" };
  } catch (err) {
    const attempts = failure.attempts + 1;
    if (attempts >= REDELIVERY_MAX_ATTEMPTS) {
      recordSsoEvent({
        event: "profile_webhook",
        userId: failure.userId,
        clientId: failure.clientId,
        success: false,
        detail: { reason: "max_retries_exceeded", attempts, manual: true },
      });
      return { ok: false, status: "dropped", error: "已达到最大重试次数，记录已丢弃" };
    }
    const backoff = Math.min(REDELIVERY_BASE_DELAY_MS * 2 ** attempts, REDELIVERY_MAX_DELAY_MS);
    // 已认领（记录已删除）：失败时重建记录并递增 attempts / 退避
    await prisma.webhookDeliveryFailure
      .create({
        data: {
          userId: failure.userId,
          clientId: failure.clientId,
          payload: failure.payload ?? {},
          attempts,
          nextRetryAt: new Date(Date.now() + backoff),
        },
      })
      .catch((e) => apiConsole.warn("[ProfileWebhook] 重建失败记录出错:", e));
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message : "投递失败",
      attempts,
    };
  }
}
