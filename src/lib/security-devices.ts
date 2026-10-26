/**
 * 安全中心 · 设备管理共享核心
 *
 * 网页会话路由（/api/user/devices）与 OAuth 资源端点（/api/oauth/security/devices）共用，
 * 避免列表口径、当前设备识别与强制下线流程漂移。
 *
 * 当前设备识别：
 * - 网页端：refresh token Cookie 哈希与记录中的 token 哈希比对；
 * - OAuth/Bearer 场景无 Cookie：沿用官网兜底口径——最近活跃（updatedAt 最新）的记录视为当前设备。
 *   强制下线目标等于当前设备时拒绝（避免操作端把自己踢下线）。
 */
import { prisma } from "@/lib/prisma";
import { maskIp } from "@/lib/mask-phone";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";

export interface SecurityDeviceView {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/**
 * 列出用户活跃设备/会话（基于未撤销且未过期的 RefreshToken 记录）。
 * @param currentRefreshTokenHash 当前会话 refresh token 的 SHA-256 哈希；无 Cookie 场景传 null
 * @param currentClientId OAuth 调用方的 client_id：无 Cookie 时优先把该 client 的最近活跃会话视为当前设备
 */
export async function listSecurityDevices(
  userId: string,
  currentRefreshTokenHash: string | null,
  currentClientId: string | null = null
): Promise<SecurityDeviceView[]> {
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      deviceName: true,
      ipAddress: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      token: true,
      clientId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // 无 Cookie（OAuth/Bearer 场景）时：
  // 优先取「当前 client」的最近活跃会话（小程序自身），否则回退全量最近活跃记录
  let fallbackCurrentId: string | null = null;
  if (currentRefreshTokenHash === null && tokens.length > 0) {
    const clientTokens = currentClientId
      ? tokens.filter((t) => t.clientId === currentClientId)
      : [];
    const pool = clientTokens.length > 0 ? clientTokens : tokens;
    fallbackCurrentId = pool.reduce((latest, t) =>
      t.updatedAt > latest.updatedAt ? t : latest
    ).id;
  }

  return tokens.map((t) => ({
    id: t.id,
    deviceName: t.deviceName || "未知设备",
    // 末段脱敏：用户端展示只需辨识大致网络，不暴露精确主机 IP
    ipAddress: t.ipAddress ? maskIp(t.ipAddress) : "未知 IP",
    createdAt: t.createdAt.toISOString(),
    // updatedAt 在每次 token 轮换（刷新）时更新，近似“最后活跃”时间
    lastActiveAt: t.updatedAt.toISOString(),
    expiresAt: t.expiresAt.toISOString(),
    isCurrent:
      (currentRefreshTokenHash !== null && t.token === currentRefreshTokenHash) ||
      t.id === fallbackCurrentId,
  }));
}

export type ForceLogoutDeviceResult =
  { ok: true } | { ok: false; status: number; code: string; message: string };

/**
 * 强制下线指定设备（撤销对应 RefreshToken 与关联 OAuthSession，并触发 Backchannel Logout）。
 * @param currentRefreshTokenHash 当前会话 refresh token 哈希；OAuth 场景传 null 走最近活跃兜底
 * @param blockClientId 禁止下线的 client（OAuth 小程序自身：撤销其会话会导致当前操作端立即登出）
 */
export async function forceLogoutDevice(params: {
  userId: string;
  deviceId: string;
  currentRefreshTokenHash: string | null;
  blockClientId?: string | null;
}): Promise<ForceLogoutDeviceResult> {
  const { userId, deviceId, currentRefreshTokenHash, blockClientId } = params;

  // 目标会话必须属于当前用户且未撤销（越权查询统一 404，不泄露存在性）
  const target = await prisma.refreshToken.findFirst({
    where: { id: deviceId, userId, revokedAt: null },
    select: { id: true, token: true, clientId: true, oauthSessionId: true },
  });
  if (!target) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "会话不存在或已下线" };
  }

  // 当前会话识别：有 Cookie 哈希按哈希比对；否则「当前 client 最近活跃 → 全量最近活跃」兜底
  let isCurrent = currentRefreshTokenHash !== null && currentRefreshTokenHash === target.token;
  if (currentRefreshTokenHash === null) {
    const candidates = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, clientId: true, updatedAt: true },
    });
    const clientPool = blockClientId ? candidates.filter((t) => t.clientId === blockClientId) : [];
    const pool = clientPool.length > 0 ? clientPool : candidates;
    const latest = pool.reduce<(typeof candidates)[number] | null>(
      (l, t) => (l && l.updatedAt >= t.updatedAt ? l : t),
      null
    );
    isCurrent = latest?.id === target.id;
  }
  if (isCurrent) {
    return {
      ok: false,
      status: 400,
      code: "CURRENT_SESSION",
      message: "不能强制下线当前设备，请使用退出登录",
    };
  }

  // 历史 token 没有 sid 关联时只能保守撤销整个 client，禁止从同 client 操作端触发。
  if (blockClientId && target.clientId === blockClientId && !target.oauthSessionId) {
    return {
      ok: false,
      status: 400,
      code: "CURRENT_CLIENT_DEVICE",
      message: "该历史设备暂不支持单独下线，请使用退出登录",
    };
  }

  const sidByClient =
    target.clientId && target.oauthSessionId
      ? { [target.clientId]: target.oauthSessionId }
      : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: target.id },
      data: { revokedAt: new Date(), revokedReason: "force_logout" },
    });
    if (target.clientId) {
      await tx.oAuthSession.updateMany({
        where: target.oauthSessionId
          ? { sessionId: target.oauthSessionId, revokedAt: null }
          : { userId, clientId: target.clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  // Backchannel Logout（best-effort）：让 RP 即时清除本地会话；失败不阻断主流程
  if (target.clientId) {
    try {
      await sendBackchannelLogout(userId, [target.clientId], { sids: sidByClient });
    } catch (err) {
      apiConsole.warn("[ForceLogoutDevice] Backchannel logout 通知失败:", err);
    }
  }

  // 审计日志（identifier 按 id 查库获取，不落明文手机号）
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  logAuthEvent("device_force_logout", {
    userId,
    identifier: userRecord?.phone,
    success: true,
    targetTokenId: target.id,
  });

  return { ok: true };
}
