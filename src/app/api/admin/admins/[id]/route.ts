/**
 * 管理员删除 API
 * DELETE /api/admin/admins/:id
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { blacklistAdminTokens } from "@/lib/token-blacklist";
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

      // 不能删除自己
      if (id === admin.id) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "不能删除当前登录账号" } },
          { status: 403 }
        );
      }

      // 不能删除最后一个 owner（事务内检查）
      const [target, ownerCount] = await prisma.$transaction([
        prisma.admin.findUnique({ where: { id, deletedAt: null }, select: { role: true } }),
        prisma.admin.count({ where: { role: "owner", deletedAt: null } }),
      ]);
      // owner 账号保护：仅 owner 可删除 owner；且不得删除最后一个 owner
      if (target?.role === "owner") {
        if (admin.role !== "owner") {
          return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可删除 owner 账号" } },
            { status: 403 }
          );
        }
        if (ownerCount <= 1) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "LAST_OWNER", message: "不能删除最后一个 owner 账号" },
            },
            { status: 403 }
          );
        }
      }

      const deletedAdmin = await prisma.admin.update({
        where: { id },
        data: { deletedAt: new Date(), status: "DISABLED" },
        select: { id: true, email: true, name: true, role: true },
      });

      // 立即吊销该管理员的 token
      blacklistAdminTokens(deletedAdmin.id, "admin_deleted");

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
