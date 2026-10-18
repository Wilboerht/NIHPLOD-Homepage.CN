/**
 * 管理员删除 API
 * DELETE /api/admin/admins/:id
 */
import { NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { deleteAdminsSafely } from "@/lib/admin-safety";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

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

      // 委派边界 + owner 保护 + 最后 owner 原子保护统一在 deleteAdminsSafely 内完成
      const result = await deleteAdminsSafely({
        actorId: admin.id,
        actorRole: admin.role,
        actorOverrides: admin.permissionOverrides ?? [],
        targetIds: [id],
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: { code: result.code, message: result.message } },
          { status: result.status }
        );
      }

      const deletedAdmin = result.deleted[0];

      // deleteAdminsSafely 已在事务内递增 tokenVersion 并置 DISABLED/deletedAt，
      // 旧 token 立即永久失效；不再写用户级黑名单（避免新登录被误拦）。

      // 记录审计日志
      await createAuditLog({
        action: "delete_admin",
        targetType: "admin",
        targetId: deletedAdmin.id,
        detail: { email: deletedAdmin.email, name: deletedAdmin.name, role: deletedAdmin.role },
        adminId: admin.id,
        request,
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
