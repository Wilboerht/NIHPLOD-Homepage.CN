/**
 * 撤销导入批次 API（管理端）
 * POST /api/admin/spent-import/[id]/undo - 整批反向冲正
 *
 * 权限：仅超级管理员（owner）；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { undoImportBatch } from "@/lib/spent-import";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "只有超级管理员可撤销导入" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const result = await undoImportBatch(id);

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_UNDONE: 409,
        NOTHING_TO_UNDO: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    await createAuditLog({
      action: "undo_spent_import",
      targetType: "spent_import",
      targetId: id,
      detail: { revertedRows: result.revertedRows, totalAmount: result.totalAmount },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { revertedRows: result.revertedRows, totalAmount: result.totalAmount },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentImport] 撤销导入失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "撤销失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
