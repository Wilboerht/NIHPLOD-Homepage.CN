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

function isSafeBackchannelUrl(uri: string): boolean {
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
 */
export async function sendBackchannelLogout(
  userId: string,
  clientIds: string[],
  options?: { includeInactive?: boolean }
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

  // 查询各 client 下该用户的最新活跃 session（用于 sid 声明）
  const sessions = await prisma.oAuthSession.findMany({
    where: { userId, clientId: { in: uniqueClientIds }, revokedAt: null },
    select: { clientId: true, sessionId: true },
    orderBy: { createdAt: "desc" },
  });
  const sidByClient = new Map<string, string>();
  for (const s of sessions) {
    if (!sidByClient.has(s.clientId)) sidByClient.set(s.clientId, s.sessionId);
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
          recordSsoEvent({
            event: "backchannel_logout",
            userId,
            clientId: client.clientId,
            success: false,
            detail: { reason: failureReason },
          });
        } else {
          // 成功投递也记录一条审计事件，便于核对通知过哪些 RP
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
