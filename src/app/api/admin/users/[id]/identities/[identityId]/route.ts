/**
 * 管理端解绑用户外部身份 API（仅超级管理员）
 * DELETE /api/admin/users/[id]/identities/[identityId] - 解绑指定第三方平台身份
 *
 * 用于错误绑定（如微信绑错账号）的客服纠正；写审计 user_identity_unbind。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; identityId: string }> }
) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：解绑外部身份" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "user:identity-unbind");
    if (rateLimitResponse) return rateLimitResponse;

    const { id, identityId } = await params;
    if (!validateCUID(id) || !validateCUID(identityId)) {
      return invalidIdResponse();
    }

    const identity = await prisma.externalIdentity.findUnique({
      where: { id: identityId },
      select: { id: true, userId: true, provider: true, subjectId: true, unionId: true },
    });
    if (!identity || identity.userId !== id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "外部身份不存在" } },
        { status: 404 }
      );
    }

    // 事务：删除身份 + 清理失去身份支撑的微信旧列（双写一致性）。
    // 若不清旧列，微信开放平台/服务号回调仅按旧列查找用户，会绕过解绑直接登录并重建身份。
    const clearedLegacy = await prisma.$transaction(async (tx) => {
      await tx.externalIdentity.delete({ where: { id: identityId } });

      const cleared: { wechatOpenId?: true; wechatUnionId?: true } = {};
      if (identity.provider.startsWith("wechat")) {
        const user = await tx.user.findUnique({
          where: { id },
          select: { wechatOpenId: true, wechatUnionId: true },
        });
        if (user && (user.wechatOpenId || user.wechatUnionId)) {
          const remaining = await tx.externalIdentity.findMany({
            where: { userId: id, provider: { startsWith: "wechat" } },
            select: { subjectId: true, unionId: true },
          });
          const openIdReferenced = remaining.some((r) => r.subjectId === user.wechatOpenId);
          const unionIdReferenced = remaining.some(
            (r) => !!r.unionId && r.unionId === user.wechatUnionId
          );

          const data: { wechatOpenId?: null; wechatUnionId?: null } = {};
          if (user.wechatOpenId && !openIdReferenced) {
            data.wechatOpenId = null;
            cleared.wechatOpenId = true;
          }
          if (user.wechatUnionId && !unionIdReferenced) {
            data.wechatUnionId = null;
            cleared.wechatUnionId = true;
          }
          if (Object.keys(data).length > 0) {
            await tx.user.update({ where: { id }, data });
          }
        }
      }

      return cleared;
    });

    await createAuditLog({
      action: "user_identity_unbind",
      targetType: "user",
      targetId: id,
      detail: {
        provider: identity.provider,
        subjectId: identity.subjectId,
        clearedLegacy,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "已解绑该外部身份" } });
  } catch (error) {
    apiConsole.error("[AdminIdentityUnbind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
