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
import { apiConsole } from "@/lib/logger";
import {
  enqueueBackchannelLogoutNotifications,
  scheduleBackchannelRedelivery,
} from "@/lib/backchannel-logout";

export async function revokeOAuthClientSessions(
  userId: string,
  clientId: string,
  options?: {
    reason?: RefreshTokenRevokedReason;
    /**
     * 仅撤销指定 sid 的会话（RP-Initiated Logout 的当前设备语义）。
     * 不传时撤销该 user+client 的全部会话（撤销授权/全设备登出）。
     */
    sid?: string;
  }
): Promise<{ sessionCount: number; latestSid: string | null }> {
  // 撤销前查出活跃会话：sid 供 backchannel logout_token 携带
  // （撤销后按 revokedAt: null 恒查不到）
  const activeSessions = await prisma.oAuthSession.findMany({
    where: {
      userId,
      clientId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(options?.sid ? { sessionId: options.sid } : {}),
    },
    select: { sessionId: true },
    orderBy: { createdAt: "desc" },
  });

  if (options?.sid) {
    // 精确退出单个会话：只撤销该 OAuthSession 与其 refresh token。
    await prisma.oAuthSession.updateMany({
      where: { userId, clientId, sessionId: options.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        clientId,
        oauthSessionId: options.sid,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        ...(options.reason ? { revokedReason: options.reason } : {}),
      },
    });
    if (activeSessions.length > 0) {
      // 携带 sid：RP 只应结束对应会话，不应清掉该用户在其他设备上的会话。
      // 异步入队投递，避免 RP 不可达时阻塞登出响应。
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId },
        select: { backchannelLogoutUri: true },
      });
      if (client?.backchannelLogoutUri) {
        await enqueueBackchannelLogoutNotifications(
          [
            {
              userId,
              clientId,
              sid: options.sid,
              logoutUri: client.backchannelLogoutUri,
            },
          ],
          { perSession: true }
        ).catch((err) => apiConsole.warn("[OAuthSessionRevoke] backchannel 入队失败:", err));
        scheduleBackchannelRedelivery();
      }
    }
    return {
      sessionCount: activeSessions.length,
      latestSid: activeSessions[0]?.sessionId ?? null,
    };
  }

  // 撤销该 client 下的全部 OAuthSession
  await prisma.oAuthSession.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // 同步撤销该 client 的全部 Refresh Token，防止旧 refresh_token 继续换发 access_token
  await revokeRefreshToken(userId, undefined, clientId, options?.reason);

  if (activeSessions.length > 0) {
    // 全量撤销：sub-only token，要求 RP 清除该用户在该 client 的全部会话。
    // 异步入队投递，避免 RP 不可达时阻塞登出响应。
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId },
      select: { backchannelLogoutUri: true },
    });
    if (client?.backchannelLogoutUri) {
      await enqueueBackchannelLogoutNotifications([
        {
          userId,
          clientId,
          sid: null,
          logoutUri: client.backchannelLogoutUri,
        },
      ]).catch((err) => apiConsole.warn("[OAuthSessionRevoke] backchannel 入队失败:", err));
      scheduleBackchannelRedelivery();
    }
  }

  return { sessionCount: activeSessions.length, latestSid: activeSessions[0]?.sessionId ?? null };
}
