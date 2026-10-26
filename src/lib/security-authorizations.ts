/**
 * 安全中心 · 授权管理共享核心
 *
 * 网页会话路由（/api/user/oauth/sessions、/api/user/oauth/revoke）与
 * OAuth 资源端点（/api/oauth/security/authorizations）共用，
 * 避免列表去重口径与撤销级联流程漂移。
 */
import { prisma } from "@/lib/prisma";
import { recordSsoEvent } from "@/lib/sso-audit";
import { logAuthEvent } from "@/lib/auth-logger";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { revokeRefreshToken } from "@/lib/auth-security";

export interface SecurityAuthorizationView {
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
}

/**
 * 列出用户活跃 OAuth 授权（未撤销且未过期），按 clientId 去重取最近一条。
 */
export async function listSecurityAuthorizations(
  userId: string
): Promise<SecurityAuthorizationView[]> {
  // 过滤口径与撤销逻辑对齐：仅展示「未撤销且未过期」的会话
  const sessions = await prisma.oAuthSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { clientId: true, scopes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const clientIds = [...new Set(sessions.map((s) => s.clientId))];
  const clients =
    clientIds.length > 0
      ? await prisma.oAuthClient.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, name: true },
        })
      : [];
  const clientNameMap = new Map(clients.map((c) => [c.clientId, c.name]));

  // sessions 已按 createdAt 倒序，首个出现的即该 client 最近的 session
  const seen = new Set<string>();
  const data: SecurityAuthorizationView[] = [];
  for (const s of sessions) {
    if (seen.has(s.clientId)) continue;
    seen.add(s.clientId);
    data.push({
      clientId: s.clientId,
      clientName: clientNameMap.get(s.clientId) || s.clientId,
      scopes: s.scopes,
      createdAt: s.createdAt.toISOString(),
    });
  }
  return data;
}

export type RevokeAuthorizationResult =
  { ok: true } | { ok: false; status: number; code: string; message: string };

/**
 * 撤销用户对指定 client 的授权：
 * 撤销 OAuthSession + 用户同意记录 + 对应 refresh token，并触发 Backchannel Logout。
 */
export async function revokeSecurityAuthorization(params: {
  userId: string;
  clientId: string;
  ip?: string;
}): Promise<RevokeAuthorizationResult> {
  const { userId, clientId, ip } = params;

  // 查找该 client 的活跃 session（撤销前查询，sid 供 backchannel logout_token 携带）
  const activeSessions = await prisma.oAuthSession.findMany({
    where: { userId, clientId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, sessionId: true },
    orderBy: { createdAt: "desc" },
  });
  if (activeSessions.length === 0) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "未找到该授权记录" };
  }

  // 撤销该 client 的所有 OAuthSession
  await prisma.oAuthSession.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // 撤销用户同意记录，防止下次授权时 auto-consent 跳过同意页
  await prisma.userConsent.updateMany({
    where: { userId, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // 同步撤销该 client 的所有 refresh token，防止旧 refresh_token 继续换发 access_token
  await revokeRefreshToken(userId, undefined, clientId, "user_revoke");

  // 记录审计日志（合规敏感，同步等待写入）
  await recordSsoEvent({
    event: "consent",
    userId,
    clientId,
    ip,
    success: true,
    detail: { action: "revoke", sessionCount: activeSessions.length },
  });

  // 审计日志 identifier 按 id 查库获取，不落明文手机号
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  logAuthEvent("user_oauth_revoke", {
    userId,
    identifier: userRecord?.phone,
    success: true,
    clientId,
    ip,
  });

  // user+client 全量撤销只带 sub，通知 RP 清除该用户的全部本地会话。
  await sendBackchannelLogout(userId, [clientId]);

  return { ok: true };
}
