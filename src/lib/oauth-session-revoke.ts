/**
 * OAuth 会话级联撤销（登出闭环）
 *
 * 用户从主站/子站登出时，除撤销主站会话外，还需闭环撤销其在目标 client 下的
 * OAuth 授权状态，口径与 POST /api/user/oauth/revoke 一致：
 * - 撤销 OAuthSession（携带 sid 的 access token 按会话校验即时失效）
 * - 撤销该 client 的全部 Refresh Token（防止旧 refresh_token 继续换发 access_token）
 * - 向该 client 广播 Backchannel Logout
 *
 * 幂等：目标会话/token 不存在时不报错（updateMany count=0，不发送通知）。
 */
import { prisma } from "@/lib/prisma";
import { revokeRefreshToken, type RefreshTokenRevokedReason } from "@/lib/auth-security";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";

export async function revokeOAuthClientSessions(
  userId: string,
  clientId: string,
  options?: { reason?: RefreshTokenRevokedReason }
): Promise<{ sessionCount: number; latestSid: string | null }> {
  // 撤销前查出活跃会话：sid 供 backchannel logout_token 携带
  // （撤销后按 revokedAt: null 恒查不到）
  const activeSessions = await prisma.oAuthSession.findMany({
    where: { userId, clientId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { sessionId: true },
    orderBy: { createdAt: "desc" },
  });

  // 撤销该 client 下的全部 OAuthSession
  await prisma.oAuthSession.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // 同步撤销该 client 的全部 Refresh Token，防止旧 refresh_token 继续换发 access_token
  await revokeRefreshToken(userId, undefined, clientId, options?.reason);

  // Backchannel Logout 广播（sid 取撤销前查出的最新活跃会话）
  if (activeSessions.length > 0) {
    await sendBackchannelLogout(userId, [clientId], {
      sids: { [clientId]: activeSessions[0].sessionId },
    });
  }

  return { sessionCount: activeSessions.length, latestSid: activeSessions[0]?.sessionId ?? null };
}
