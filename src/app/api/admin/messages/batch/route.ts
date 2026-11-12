import { NextRequest, NextResponse } from "next/server";
import { invalidateAdminStats } from "@/lib/admin-stats-invalidate";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { cuidSchema } from "@/lib/validation";

// 批量操作 Schema
const BatchSchema = z.object({
  ids: z.array(cuidSchema).min(1, "请选择至少一条留言").max(100, "一次最多操作 100 条留言"),
  action: z.enum(["read", "unread", "delete"]),
});

// POST /api/admin/messages/batch - 批量操作留言
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { ids, action } = BatchSchema.parse(body);

    // 批量删除需 messages:delete，标记读/未读需 messages:write
    if (action === "delete" && !hasAdminPermission(admin, "messages:delete")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言删除" } },
        { status: 403 }
      );
    }
    if (action !== "delete" && !hasAdminPermission(admin, "messages:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言操作" } },
        { status: 403 }
      );
    }
    if (action === "delete") {
      const stepUp = await requireAdminStepUp(request, admin);
      if (stepUp) return stepUp;
    }

    let count = 0;
    let deleteAuditId: string | null = null;

    if (action === "delete") {
      deleteAuditId = await beginAuditLog({
        action: "batch_message",
        targetType: "message",
        targetId: ids[0],
        detail: { ids, action, status: "PENDING" },
        adminId: admin.id,
        request,
      });
      if (!deleteAuditId) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
          },
          { status: 503 }
        );
      }
    }

    if (action === "read") {
      const result = await prisma.contactMessage.updateMany({
        where: { id: { in: ids } },
        data: { read: true },
      });
      count = result.count;
    } else if (action === "unread") {
      const result = await prisma.contactMessage.updateMany({
        where: { id: { in: ids } },
        data: { read: false },
      });
      count = result.count;
    } else if (action === "delete") {
      const auditId = deleteAuditId;
      if (!auditId) throw new Error("AUDIT_UNAVAILABLE");
      try {
        const result = await prisma.contactMessage.deleteMany({
          where: { id: { in: ids } },
        });
        count = result.count;
        await finishAuditLog(auditId, "SUCCESS", { ids, action, count });
      } catch (error) {
        await finishAuditLog(auditId, "FAILURE", {
          ids,
          action,
          error: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN",
        });
        throw error;
      }
    }

    const actionText = {
      read: "标记为已读",
      unread: "标记为未读",
      delete: "删除",
    }[action];

    if (action !== "delete") {
      createAuditLog({
        action: "batch_message",
        targetType: "message",
        targetId: ids[0],
        detail: { ids, action, count },
        adminId: admin.id,
        request,
      }).catch((error) => apiConsole.error("[AuditLog] 审计写入失败:", error));
    }

    invalidateAdminStats();

    return NextResponse.json({
      success: true,
      data: {
        message: `已${actionText} ${count} 条留言`,
        count,
      },
    });
  } catch (error) {
    apiConsole.error("批量操作失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "批量操作失败" } },
      { status: 500 }
    );
  }
}
