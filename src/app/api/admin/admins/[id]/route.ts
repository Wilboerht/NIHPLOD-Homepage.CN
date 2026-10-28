/**
 * 管理员删除 API
 * DELETE /api/admin/admins/:id
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { deleteAdminsSafely } from "@/lib/admin-safety";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { isAdminApprovalEnforced } from "@/lib/admin-approval-guard";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/admin/admins/:id/email-history
 * 管理员历史邮箱（含软删除归档、改邮箱归档、匿名化归档）
 */
export const GET = withAuth(
  async (request, admin, { params }: { params: Promise<{ id: string }> }) => {
    try {
      if (!hasAdminPermission(admin, "admins:read")) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员查看" } },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
      if (rateLimitResponse) return rateLimitResponse;

      const { id } = await params;
      if (!validateCUID(id)) return invalidIdResponse();

      const history = await prisma.adminEmailHistory.findMany({
        where: { adminId: id },
        orderBy: { changedAt: "desc" },
        take: 50,
        select: { id: true, email: true, changedAt: true, changedBy: true, reason: true },
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            history: history.map((item) => ({
              ...item,
              changedAt: item.changedAt.toISOString(),
            })),
          },
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      apiConsole.error("[AdminAdmins] email-history GET 异常:", error);
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  }
);

export const DELETE = withAuth(
  async (request, admin, { params }: { params: Promise<{ id: string }> }) => {
    try {
      if (!hasAdminPermission(admin, "admins:write")) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "权限不足：管理员管理" } },
          { status: 403 }
        );
      }

      if (!validateCSRFToken(request)) {
        return csrfForbiddenResponse();
      }

      const rateLimitResponse = await checkAdminRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;

      const { id } = await params;
      if (!validateCUID(id)) {
        return invalidIdResponse();
      }

      if (isAdminApprovalEnforced() && admin.role !== "owner") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "APPROVAL_REQUIRED",
              message: "该操作需要 owner 审批，请前往审批中心提交申请",
              details: { policyKey: "admin.delete" },
            },
          },
          { status: 403 }
        );
      }

      const stepUpResponse = await requireAdminStepUp(request, admin);
      if (stepUpResponse) return stepUpResponse;

      // 删除原因：可选 body（DELETE 允许空 body），用于离职/审计留痕
      const body = await request.json().catch(() => ({}));
      const reason =
        typeof (body as { reason?: unknown }).reason === "string"
          ? (body as { reason: string }).reason.trim().slice(0, 500)
          : undefined;

      const auditId = await beginAuditLog({
        action: "delete_admin",
        targetType: "admin",
        targetId: id,
        detail: { reason: reason || null },
        actorType: "ADMIN",
        actorEmail: admin.email,
        actorName: admin.name,
        actorRole: admin.role,
        authMethod: "session",
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

      // 委派边界 + owner 保护 + 最后 owner 原子保护统一在 deleteAdminsSafely 内完成
      let result: Awaited<ReturnType<typeof deleteAdminsSafely>>;
      try {
        result = await deleteAdminsSafely({
          actorId: admin.id,
          actorRole: admin.role,
          actorOverrides: admin.permissionOverrides ?? [],
          targetIds: [id],
          reason,
        });
      } catch (error) {
        await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
        throw error;
      }
      if (!result.ok) {
        await finishAuditLog(auditId, "FAILURE", { code: result.code });
        return NextResponse.json(
          { success: false, error: { code: result.code, message: result.message } },
          { status: result.status }
        );
      }

      const deletedAdmin = result.deleted[0];

      // deleteAdminsSafely 已在事务内递增 tokenVersion 并置 DISABLED/deletedAt，
      // 旧 token 立即永久失效；不再写用户级黑名单（避免新登录被误拦）。

      await finishAuditLog(auditId, "SUCCESS", {
        email: deletedAdmin.email,
        name: deletedAdmin.name,
        role: deletedAdmin.role,
        reason: reason || null,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      apiConsole.error("[AdminAdmins] DELETE 异常:", error);
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
        { status: 500 }
      );
    }
  }
);
