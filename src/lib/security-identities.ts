/**
 * 安全中心 · 账号绑定共享核心
 *
 * 网页会话路由（/api/user/identities）与 OAuth 资源端点（/api/oauth/security/identities）共用。
 *
 * 安全约束（服务端强制）：
 * - 仅能解绑本人身份（越权统一 404，不泄露存在性）
 * - 占位手机号账号（未绑定真实手机号）拒绝解绑，避免账号失去唯一登录方式
 * - 解绑后清理失去身份支撑的微信旧列，防止旧列让回调绕过解绑直接重建身份
 * - 不返回 subjectId（openid），避免第三方平台标识泄漏
 */
import { prisma } from "@/lib/prisma";
import { logAuthEvent } from "@/lib/auth-logger";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";

export interface SecurityIdentityView {
  id: string;
  provider: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
  lastSyncAt: string;
  canUnbind: boolean;
}

export async function listSecurityIdentities(userId: string): Promise<SecurityIdentityView[]> {
  const [identities, account] = await Promise.all([
    prisma.externalIdentity.findMany({
      where: { userId },
      select: { id: true, provider: true, metadata: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    }),
  ]);

  // 占位手机号（微信自动建号未绑定真实号码）解绑后将无可用登录方式，禁止解绑
  const hasRealPhone =
    !!account?.phone && !account.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX);

  return identities.map((i) => {
    const meta = (i.metadata ?? null) as {
      nickname?: string | null;
      avatar?: string | null;
    } | null;
    return {
      id: i.id,
      provider: i.provider,
      nickname: meta?.nickname ?? null,
      avatar: meta?.avatar ?? null,
      createdAt: i.createdAt.toISOString(),
      lastSyncAt: i.updatedAt.toISOString(),
      canUnbind: hasRealPhone,
    };
  });
}

export type UnbindIdentityResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function unbindSecurityIdentity(params: {
  userId: string;
  identityId: string;
}): Promise<UnbindIdentityResult> {
  const { userId, identityId } = params;

  const identity = await prisma.externalIdentity.findFirst({
    where: { id: identityId, userId },
    select: { id: true, provider: true, subjectId: true, unionId: true },
  });
  if (!identity) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "绑定不存在或已解绑" };
  }

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!account?.phone || account.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
    return {
      ok: false,
      status: 400,
      code: "UNBIND_NOT_ALLOWED",
      message: "请先绑定真实手机号后再解除绑定，否则账号将无法登录",
    };
  }

  // 事务：删除身份 + 清理失去身份支撑的微信旧列（与 admin 解绑同一口径）
  const IDENTITY_GONE = "IDENTITY_GONE";
  try {
    await prisma.$transaction(async (tx) => {
      // deleteMany + count 判定：与并发删除竞争时返回 404 而不是抛 P2025 500
      const deleted = await tx.externalIdentity.deleteMany({
        where: { id: identityId, userId },
      });
      if (deleted.count === 0) {
        throw new Error(IDENTITY_GONE);
      }

      if (identity.provider.startsWith("wechat")) {
        const owner = await tx.user.findUnique({
          where: { id: userId },
          select: { wechatOpenId: true, wechatUnionId: true },
        });
        if (owner && (owner.wechatOpenId || owner.wechatUnionId)) {
          const remaining = await tx.externalIdentity.findMany({
            where: { userId, provider: { startsWith: "wechat" } },
            select: { subjectId: true, unionId: true },
          });
          const openIdReferenced = remaining.some((r) => r.subjectId === owner.wechatOpenId);
          const unionIdReferenced = remaining.some(
            (r) => !!r.unionId && r.unionId === owner.wechatUnionId
          );

          const data: { wechatOpenId?: null; wechatUnionId?: null } = {};
          if (owner.wechatOpenId && !openIdReferenced) data.wechatOpenId = null;
          if (owner.wechatUnionId && !unionIdReferenced) data.wechatUnionId = null;
          if (Object.keys(data).length > 0) {
            await tx.user.update({ where: { id: userId }, data });
          }
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === IDENTITY_GONE) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "绑定不存在或已解绑" };
    }
    throw error;
  }

  logAuthEvent("user_oauth_revoke", {
    userId,
    identifier: account.phone,
    success: true,
    detail: { provider: identity.provider, self: true },
  });

  return { ok: true };
}
