/**
 * 凭证变更后的会话撤销（改密 / 首次设密 / 重置共用口径）
 *
 * 语义：
 * - 内部（非 OAuth）refresh token：保留当前设备（Cookie 哈希比对；Bearer 无 Cookie 时全撤）
 * - OAuth 作用域 refresh token：全部撤销（第三方授权需重新授权）
 * - OAuthSession：全部撤销，并向子站发送 backchannel logout（携带 sid 即时踢人）
 *
 * 调用时机：密码已成功更新之后。撤销失败不抛出（密码已生效，风险窗口由
 * token 自然过期兜底），由调用方决定是否记录错误。
 */
import { prisma } from "@/lib/prisma";
import { hashRefreshToken } from "@/lib/auth-security";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";

export async function revokeOtherSessionsAfterCredentialChange(params: {
  userId: string;
  /** 当前请求携带的 refresh token Cookie（保留该设备）；为空表示撤销全部内部 token */
  currentRefreshToken?: string | null;
}): Promise<void> {
  const { userId } = params;
  const currentHash = params.currentRefreshToken
    ? hashRefreshToken(params.currentRefreshToken)
    : null;

  // 内部（非 OAuth）refresh token：保留当前设备，撤销其余
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      clientId: null,
      revokedAt: null,
      ...(currentHash ? { token: { not: currentHash } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: "credential_change" },
  });

  // OAuth 作用域的 refresh token 全部撤销（属于第三方应用授权，改密后应重新授权）
  await prisma.refreshToken.updateMany({
    where: { userId, clientId: { not: null }, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "credential_change" },
  });

  // 同步撤销 OAuth 会话，使携带 sid 的 access token 即时失效；
  // 撤销前查出活跃会话的 clientId/sid，撤销后通过 backchannel logout 通知子站即时踢人
  const activeSessions = await prisma.oAuthSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { clientId: true, sessionId: true },
  });
  await prisma.oAuthSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (activeSessions.length > 0) {
    const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
    const sids: Record<string, string> = {};
    for (const s of activeSessions) {
      if (!sids[s.clientId]) sids[s.clientId] = s.sessionId;
    }
    await sendBackchannelLogout(userId, clientIds, { sids });
  }
}
