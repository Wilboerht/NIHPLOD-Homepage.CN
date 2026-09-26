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
import { after } from "next/server";
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
              // 禁止跟随重定向：防止注册的 https 地址 302 到内网（SSRF 绕过主机黑名单）
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
// 批量入队（异步投递，供级联撤销场景）
// ============================================

/**
 * 将一批 Backchannel Logout 通知写入补偿队列（不同步投递），由 cron 重投任务处理。
 *
 * 用于批量级联场景（client 停用/删除、批量终止会话）：避免在单次请求内对无界
 * 用户集合逐个发起同步 HTTP（每个 2 次 × 5s 超时）导致请求超时与进程占用。
 *
 * @returns 实际入队的通知条数（按 user+client 去重后）
 */
export async function enqueueBackchannelLogoutNotifications(
  entries: {
    userId: string;
    clientId: string;
    sid?: string | null;
    /** 入队时 client 的 backchannelLogoutUri 快照：client 被删除后仍可投递 */
    logoutUri?: string | null;
  }[]
): Promise<number> {
  if (entries.length === 0) return 0;

  // 同一 user+client 只保留一条（sid 用于 RP 定位会话；重复投递幂等，无需逐 session 通知）
  const unique = new Map<
    string,
    { userId: string; clientId: string; sid?: string | null; logoutUri?: string | null }
  >();
  for (const e of entries) {
    const key = `${e.userId}:${e.clientId}`;
    if (!unique.has(key)) unique.set(key, e);
  }
  const rows = [...unique.values()];

  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await prisma.backchannelLogoutFailure.createMany({
      data: rows.slice(i, i + CHUNK_SIZE).map((e) => ({
        userId: e.userId,
        clientId: e.clientId,
        payload: { sid: e.sid ?? null, logoutUri: e.logoutUri ?? null },
        // 立即到期；实际投递由 cron 在下次运行时批量处理（带指数退避与上限）
        nextRetryAt: new Date(),
      })),
    });
  }
  return rows.length;
}

/**
 * 分页扫描活跃 OAuthSession 并写入 Backchannel Logout 补偿队列。
 *
 * 必须在撤销会话之前调用（查询条件含 revokedAt: null）。分页 + 批量 createMany，
 * 避免一次性把全部会话/用户读入内存，也避免逐用户同步等待 HTTP。
 * 仅对配置了 backchannelLogoutUri 的 client 入队（并把 URI 快照写入 payload，
 * 保证 client 删除后仍能投递到目标 RP）。
 *
 * ⚠️ sessionCount 只统计"匹配到已配置 URI 的 client"的会话，仅供观测；
 * 撤销会话/refresh token 必须由调用方无条件执行，不得以本返回值为门槛。
 *
 * @returns sessionCount 匹配会话数；userClientCount 入队通知数（user+client 去重）
 */
export async function enqueueBackchannelLogoutForActiveSessions(params: {
  clientId?: string;
  userId?: string;
  pageSize?: number;
}): Promise<{ sessionCount: number; userClientCount: number }> {
  // 先取目标 client 的 backchannelLogoutUri（含已停用 client；删除场景下调用方仍在删除前）
  const clients = await prisma.oAuthClient.findMany({
    where: {
      ...(params.clientId ? { clientId: params.clientId } : {}),
      backchannelLogoutUri: { not: null },
    },
    select: { clientId: true, backchannelLogoutUri: true },
  });
  const uriByClient = new Map(
    clients.map((c) => [c.clientId, c.backchannelLogoutUri as string])
  );
  if (uriByClient.size === 0) {
    return { sessionCount: 0, userClientCount: 0 };
  }

  const pageSize = Math.min(Math.max(params.pageSize ?? 1000, 1), 5000);
  let cursor: string | undefined;
  let sessionCount = 0;
  let userClientCount = 0;

  for (;;) {
    const page = await prisma.oAuthSession.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        clientId: params.clientId
          ? params.clientId
          : { in: [...uriByClient.keys()] },
        ...(params.userId ? { userId: params.userId } : {}),
      },
      select: { id: true, userId: true, clientId: true, sessionId: true },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: pageSize,
    });

    if (page.length === 0) break;

    sessionCount += page.length;
    userClientCount += await enqueueBackchannelLogoutNotifications(
      page.map((s) => ({
        userId: s.userId,
        clientId: s.clientId,
        sid: s.sessionId,
        logoutUri: uriByClient.get(s.clientId),
      }))
    );

    cursor = page[page.length - 1].id;
    if (page.length < pageSize) break;
  }

  return { sessionCount, userClientCount };
}

/**
 * 在响应返回后立即触发一次有界补偿投递（Next `after()`）。
 *
 * 批量级联场景把通知写入队列后调用：小规模级联（≤ limit 条）几乎即时送达，
 * 大规模积压则继续由 cron 周期排空。非请求上下文自动降级为 fire-and-forget。
 */
export function scheduleBackchannelRedelivery(limit: number = 20): void {
  const run = () =>
    retryFailedBackchannelLogouts(limit)
      .then(() => undefined)
      .catch((err) => {
        apiConsole.warn("[SLO] 入队后即时补投失败（将由 cron 重试）:", err);
      });
  try {
    after(run);
  } catch {
    void run();
  }
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
  limit: number = 200
): Promise<{ delivered: number; failed: number; dropped: number }> {
  const failures = await prisma.backchannelLogoutFailure.findMany({
    where: { nextRetryAt: { lte: new Date() }, attempts: { lt: REDELIVERY_MAX_ATTEMPTS } },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let dropped = 0;

  const processFailure = async (failure: (typeof failures)[number]) => {
    try {
      // 多实例部署时的乐观锁认领：先把 nextRetryAt 后移，
      // 认领失败（count=0）说明其他实例已接管该记录，直接跳过。
      // 认领后即使本实例崩溃，记录也会在被后移的时间点重新到期，不会丢失。
      const claim = await prisma.backchannelLogoutFailure.updateMany({
        where: { id: failure.id, nextRetryAt: failure.nextRetryAt },
        data: { nextRetryAt: new Date(Date.now() + REDELIVERY_BASE_DELAY_MS) },
      });
      if (claim.count === 0) return;

      const payload = (failure.payload ?? {}) as {
        sid?: string | null;
        logoutUri?: string | null;
      };

      // 优先使用当前 client 配置的 URI；client 已删除时回退到入队时的 URI 快照
      // （否则删除 client 的批量登出通知会永远无法投递）。
      // 注意：client 仍存在但 URI 被清空 = 管理员主动停止投递，此时直接丢弃（不再回退快照）。
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: failure.clientId },
        select: { clientId: true, backchannelLogoutUri: true },
      });
      const uri = client ? client.backchannelLogoutUri : payload.logoutUri ?? null;

      // client 已删除且无 URI 快照 / 未配置 / 不安全：补偿无意义，直接丢弃
      if (!uri || !isSafeBackchannelUrl(uri)) {
        await prisma.backchannelLogoutFailure.delete({ where: { id: failure.id } });
        dropped++;
        return;
      }

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
        // 禁止跟随重定向（SSRF 防护）
        redirect: "manual",
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
  };

  // 批量级联场景队列可能积压较多：有界并发（每批 10 个）提升吞吐，
  // 同时避免对 RP 造成瞬时压力；计数与认领均在单线程事件循环内安全累加。
  const CONCURRENCY = 10;
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, failures.length) },
    async () => {
      for (;;) {
        const index = nextIndex++;
        if (index >= failures.length) return;
        await processFailure(failures[index]);
      }
    }
  );
  await Promise.all(workers);

  return { delivered, failed, dropped };
}

/**
 * 管理端手动重投单条 Backchannel Logout（忽略 nextRetryAt，立即尝试一次）
 * - 目标 client 已删除/未配置/不安全：丢弃记录
 * - 成功：删除记录并写审计
 * - 失败：attempts+1 指数退避；达到上限则丢弃并写审计
 */
export async function retryBackchannelFailureById(id: string): Promise<{
  ok: boolean;
  status: "delivered" | "failed" | "dropped" | "not_found";
  error?: string;
  attempts?: number;
}> {
  const failure = await prisma.backchannelLogoutFailure.findUnique({ where: { id } });
  if (!failure) return { ok: false, status: "not_found" };

  // 原子认领：删除成功（count=1）才继续，防止手动重投与 cron 重投并发导致重复投递
  const claimed = await prisma.backchannelLogoutFailure.deleteMany({ where: { id } });
  if (claimed.count === 0) return { ok: false, status: "not_found" };

  const payload = (failure.payload ?? {}) as { sid?: string | null; logoutUri?: string | null };

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: failure.clientId },
    select: { clientId: true, backchannelLogoutUri: true },
  });
  // 与自动重投一致：client 存在时以当前配置为准，URI 为空禁止投递
  // （client 已被删除时，用创建时的 URI 兜底）
  const uri = client ? client.backchannelLogoutUri : payload.logoutUri ?? null;
  if (!uri || !isSafeBackchannelUrl(uri)) {
    recordSsoEvent({
      event: "backchannel_logout",
      userId: failure.userId,
      clientId: failure.clientId,
      success: false,
      detail: { reason: "target_unavailable", manual: true },
    });
    return { ok: true, status: "dropped" };
  }

  try {
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
      // 禁止跟随重定向（SSRF 防护）
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);

    recordSsoEvent({
      event: "backchannel_logout",
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
        event: "backchannel_logout",
        userId: failure.userId,
        clientId: failure.clientId,
        success: false,
        detail: { reason: "max_retries_exceeded", attempts, manual: true },
      });
      return { ok: false, status: "dropped", error: "已达到最大重试次数，记录已丢弃" };
    }
    const backoff = Math.min(REDELIVERY_BASE_DELAY_MS * 2 ** attempts, REDELIVERY_MAX_DELAY_MS);
    // 已认领（记录已删除）：失败时重建记录并递增 attempts / 退避
    await prisma.backchannelLogoutFailure
      .create({
        data: {
          userId: failure.userId,
          clientId: failure.clientId,
          payload: failure.payload ?? {},
          attempts,
          nextRetryAt: new Date(Date.now() + backoff),
        },
      })
      .catch((e) => apiConsole.warn("[SLO] 重建失败记录出错:", e));
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message : "投递失败",
      attempts,
    };
  }
}
