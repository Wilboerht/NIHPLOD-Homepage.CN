/**
 * 用户自助解绑第三方身份
 * DELETE /api/user/identities/:id
 *
 * 安全约束：
 * - 仅允许解绑属于当前登录用户本人的身份（越权统一 404，不泄露存在性）
 * - 占位手机号账号（从未绑定真实手机号）拒绝解绑，避免账号被永久锁死
 * - 事务内删除身份并清理失去身份支撑的微信旧列，防止旧列让回调绕过解绑直接重建身份
 * - 写认证审计（user_oauth_revoke / self=true）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const identity = await prisma.externalIdentity.findFirst({
      where: { id, userId: user.id },
      select: { id: true, provider: true, subjectId: true, unionId: true },
    });
    if (!identity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "绑定不存在或已解绑" } },
        { status: 404 }
      );
    }

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    if (!account?.phone || account.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNBIND_NOT_ALLOWED",
            message: "请先绑定真实手机号后再解除绑定，否则账号将无法登录",
          },
        },
        { status: 400 }
      );
    }

    // 事务：删除身份 + 清理失去身份支撑的微信旧列（与 admin 解绑同一口径）
    // deleteMany + count 判定：与并发删除竞争时返回 404 而不是抛 P2025 500
    const IDENTITY_GONE = "IDENTITY_GONE";
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.externalIdentity.deleteMany({
        where: { id, userId: user.id },
      });
      if (deleted.count === 0) {
        throw new Error(IDENTITY_GONE);
      }

      if (identity.provider.startsWith("wechat")) {
        const owner = await tx.user.findUnique({
          where: { id: user.id },
          select: { wechatOpenId: true, wechatUnionId: true },
        });
        if (owner && (owner.wechatOpenId || owner.wechatUnionId)) {
          const remaining = await tx.externalIdentity.findMany({
            where: { userId: user.id, provider: { startsWith: "wechat" } },
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
            await tx.user.update({ where: { id: user.id }, data });
          }
        }
      }
    });

    logAuthEvent("user_oauth_revoke", {
      userId: user.id,
      identifier: account.phone,
      success: true,
      detail: { provider: identity.provider, self: true },
    });

    return NextResponse.json({ success: true, data: { message: "已解除绑定" } });
  } catch (error) {
    if (error instanceof Error && error.message === "IDENTITY_GONE") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "绑定不存在或已解绑" } },
        { status: 404 }
      );
    }
    apiConsole.error("[UserIdentityUnbind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
