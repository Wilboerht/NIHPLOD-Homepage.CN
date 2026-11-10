/**
 * 管理端解绑用户外部身份 API
 * DELETE /api/admin/users/[id]/identities/[identityId] - 解绑指定第三方平台身份
 *
 * 权限：users:write（用户状态/生日/解绑）。
 * 用于错误绑定（如微信绑错账号）的客服纠正；写审计 user_identity_unbind。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { enqueueSecurityActionNotification } from "@/lib/security-notify";

export const dynamic = "force-dynamic";

const unbindSchema = z.object({
  reason: z.string().trim().min(2, "请填写解绑原因或工单号").max(200),
});

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

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

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

    // 与用户侧 unbindSecurityIdentity 保持同一安全边界：
    // 占位手机号账号没有真实手机号，解绑第三方身份后可能永久无法登录。
    const account = await prisma.user?.findUnique({
      where: { id },
      select: { phone: true, status: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }
    if (account.status === "DELETED") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "USER_DELETED", message: "该用户已注销，不能解绑外部身份" },
        },
        { status: 409 }
      );
    }
    if (!account.phone || account.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNBIND_NOT_ALLOWED",
            message: "该账号尚未绑定真实手机号，解绑后将无法登录；请先让用户绑定手机号",
          },
        },
        { status: 400 }
      );
    }

    const parsed = unbindSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "请填写解绑原因或工单号" } },
        { status: 400 }
      );
    }

    const auditId = await beginAuditLog({
      action: "user_identity_unbind",
      targetType: "user",
      targetId: id,
      detail: {
        provider: identity.provider,
        subjectId: identity.subjectId,
        reason: parsed.data.reason,
      },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    // 事务：删除身份 + 清理失去身份支撑的微信旧列（双写一致性）。
    // 若不清旧列，微信开放平台/服务号回调仅按旧列查找用户，会绕过解绑直接登录并重建身份。
    const clearedLegacy = await prisma.$transaction(async (tx) => {
      try {
        await tx.externalIdentity.delete({ where: { id: identityId } });
      } catch (error) {
        if ((error as { code?: string }).code === "P2025") {
          throw new Error("IDENTITY_GONE");
        }
        throw error;
      }

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

    await finishAuditLog(auditId, "SUCCESS", {
      provider: identity.provider,
      subjectId: identity.subjectId,
      clearedLegacy,
    });

    await enqueueSecurityActionNotification({
      userId: id,
      phone: account.phone,
      action: "第三方身份已解绑",
      reference: `identity-unbind:${identityId}`,
    }).catch((error) => apiConsole.warn("[AdminIdentityUnbind] 用户通知入队失败:", error));

    return NextResponse.json({ success: true, data: { message: "已解绑该外部身份" } });
  } catch (error) {
    if (error instanceof Error && error.message === "IDENTITY_GONE") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "外部身份不存在或已解绑" } },
        { status: 404 }
      );
    }
    apiConsole.error("[AdminIdentityUnbind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
