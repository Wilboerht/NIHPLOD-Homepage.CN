/**
 * Backchannel Logout 公共函数
 *
 * OIDC Backchannel Logout 1.0 规范实现：
 * 当用户登出或撤销授权时，通过 logout_token 非阻塞通知已注册的 RP（Relying Party）。
 *
 * 使用场景：
 * - 用户登出（POST /api/auth/logout）：通知所有活跃 OAuthSession 对应的 client
 * - 用户撤销授权（POST /api/user/oauth/revoke）：通知被撤销的单个 client
 */
import { signLogoutToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  // CGNAT 保留段 100.64.0.0/10（运营商级 NAT，非公网可路由）
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * 判断主机名是否为保留/私网地址（仅字面匹配，不做 DNS 解析）。
 *
 * 权衡：对"域名解析到私网 IP"的 DNS rebinding 场景不在此防护范围——
 * 完整防护需在连接建立时校验实际解析结果，代价是每次回调都引入 DNS 查询。
 * 当前实现覆盖字面 IP、IPv6 ULA/link-local、IPv4 映射地址与已知保留名。
 */
export function isBlockedHostname(rawHostname: string): boolean {
  // WHATWG URL 的 IPv6 hostname 带方括号（如 "[::1]"），先归一化再匹配
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return true;
  if (hostname.startsWith("::ffff:")) return true; // IPv4 映射地址（绕过 IPv4 段检查）
  if (/^f[cd]/.test(hostname)) return true; // IPv6 ULA fc00::/7
  if (hostname.startsWith("fe80:")) return true; // IPv6 link-local
  return false;
}

export function isSafeBackchannelUrl(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== "https:") return false;
    if (isBlockedHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 向已注册的 OAuth Client 发送 Backchannel Logout 通知
 *
 * @param userId - 登出/撤销授权的用户 ID
 * @param clientIds - 需要通知的 clientId 列表（去重后查询，仅通知已配置 backchannelLogoutUri 的活跃 client）
 * @param options.includeInactive - 为 true 时也通知已停用的 client（停用/删除 client 场景）
 * @param options.sids - 调用方在撤销会话前查出的 clientId -> sid 映射；
 *   提供后不再回库查询（撤销后再查 revokedAt:null 恒为空），未提供时回库查询兜底
 */
export async function sendBackchannelLogout(
  userId: string,
  clientIds: string[],
  options?: { includeInactive?: boolean; sids?: Record<string, string> }
): Promise<void> {
  if (clientIds.length === 0) return;

  const uniqueClientIds = [...new Set(clientIds)];

  // 查询已注册且配置了 backchannelLogoutUri 的 client
  // 默认只通知活跃 client；停用 client 时传入 includeInactive=true 确保通知
  const isActiveFilter = options?.includeInactive ? undefined : true;
  const clients = await prisma.oAuthClient.findMany({
    where: {
      clientId: { in: uniqueClientIds },
      ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
      backchannelLogoutUri: { not: null },
    },
    select: { clientId: true, backchannelLogoutUri: true },
  });

  // 各 client 下该用户的最新活跃 session（用于 sid 声明）
  let sidByClient = new Map<string, string>();
  if (options?.sids) {
    sidByClient = new Map(Object.entries(options.sids));
  } else {
    const sessions = await prisma.oAuthSession.findMany({
      where: {
        userId,
        clientId: { in: uniqueClientIds },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { clientId: true, sessionId: true },
      orderBy: { createdAt: "desc" },
    });
    for (const s of sessions) {
      if (!sidByClient.has(s.clientId)) sidByClient.set(s.clientId, s.sessionId);
    }
  }

  // 并行通知：每个 client 独立处理，失败不影响其他 client
  const deliveryTasks = clients
    .filter((c) => c.backchannelLogoutUri && isSafeBackchannelUrl(c.backchannelLogoutUri))
    .map(async (client) => {
      if (!client.backchannelLogoutUri) return;

      try {
        const jti = crypto.randomUUID();
        const sid = sidByClient.get(client.clientId);
        const logoutToken = await signLogoutToken({
          sub: userId,
          aud: client.clientId,
          events: { "http://schemas.openid.net/event/backchannel-logout": {} },
          jti,
          sid,
        });

        let delivered = false;
        let failureReason = "http_request_failed_after_retry";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(client.backchannelLogoutUri, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ logout_token: logoutToken }),
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
          apiConsole.warn(`[SLO] Backchannel logout 通知失败（已重试）(${client.clientId})`);
          // lib 内部不保证有 request scope，无法使用 scheduleSsoEvent(after)，
          // 保持 fire-and-forget；投递本身已重试，审计丢失风险可接受
          recordSsoEvent({
            event: "backchannel_logout",
            userId,
            clientId: client.clientId,
            success: false,
            detail: { reason: failureReason },
          });
          // 落库补偿队列，由 cron 任务周期重投（fire-and-forget，不阻断撤销流程）
          prisma.backchannelLogoutFailure
            .create({
              data: {
                userId,
                clientId: client.clientId,
                payload: { sid: sid ?? null },
                nextRetryAt: new Date(Date.now() + REDELIVERY_BASE_DELAY_MS),
              },
            })
            .catch((err) => {
              apiConsole.warn(`[SLO] Backchannel logout 失败记录落库失败 (${client.clientId}):`, err);
            });
        } else {
          // 成功投递也记录一条审计事件，便于核对通知过哪些 RP
          // （lib 内部无 request scope，保持 fire-and-forget，见上方失败分支注释）
          recordSsoEvent({
            event: "backchannel_logout",
            userId,
            clientId: client.clientId,
            success: true,
          });
        }
      } catch (err) {
        apiConsole.warn(`[SLO] Backchannel logout token 签发失败 (${client.clientId}):`, err);
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
 * 重投失败的 Backchannel Logout 通知（由 cron 任务周期调用）
 *
 * 取 nextRetryAt 已到期的失败记录重新签发 logout_token 投递（单次尝试，不再同步重试）：
 * - 成功 / client 已删除或未配置 URI：删除记录
 * - 失败：attempts + 1 并按指数退避更新 nextRetryAt
 * - 超过重投上限：删除记录并写审计
 */
export async function retryFailedBackchannelLogouts(
  limit: number = 50
): Promise<{ delivered: number; failed: number; dropped: number }> {
  const failures = await prisma.backchannelLogoutFailure.findMany({
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
        select: { clientId: true, backchannelLogoutUri: true },
      });
      const uri = client?.backchannelLogoutUri;

      // client 已删除或未配置 backchannelLogoutUri：补偿无意义，直接丢弃
      if (!uri || !isSafeBackchannelUrl(uri)) {
        await prisma.backchannelLogoutFailure.delete({ where: { id: failure.id } });
        dropped++;
        continue;
      }

      const payload = (failure.payload ?? {}) as { sid?: string | null };
      // 重新签发 logout_token（原 token 已过期），jti 重新生成
      const logoutToken = await signLogoutToken({
        sub: failure.userId,
        aud: failure.clientId,
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
        jti: crypto.randomUUID(),
        sid: payload.sid ?? undefined,
      });

      const res = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: logoutToken }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);

      await prisma.backchannelLogoutFailure.delete({ where: { id: failure.id } });
      delivered++;
      recordSsoEvent({
        event: "backchannel_logout",
        userId: failure.userId,
        clientId: failure.clientId,
        success: true,
        detail: { redelivered: true, attempts: failure.attempts + 1 },
      });
    } catch (err) {
      const attempts = failure.attempts + 1;
      if (attempts >= REDELIVERY_MAX_ATTEMPTS) {
        // 超上限：删除记录并写审计，不再重投
        await prisma.backchannelLogoutFailure
          .delete({ where: { id: failure.id } })
          .catch((e) => apiConsole.warn("[SLO] 删除超限失败记录出错:", e));
        dropped++;
        recordSsoEvent({
          event: "backchannel_logout",
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
        await prisma.backchannelLogoutFailure.update({
          where: { id: failure.id },
          data: { attempts, nextRetryAt: new Date(Date.now() + backoff) },
        });
        failed++;
        apiConsole.warn(
          `[SLO] Backchannel logout 重投失败 (${failure.clientId})，第 ${attempts} 次:`,
          err
        );
      }
    }
  }

  return { delivered, failed, dropped };
}
