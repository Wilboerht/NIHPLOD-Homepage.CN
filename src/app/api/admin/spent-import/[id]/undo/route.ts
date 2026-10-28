/**
 * 撤销导入批次 API（管理端）
 * POST /api/admin/spent-import/[id]/undo - 整批反向冲正
 *
 * 权限：需要 spent:import 权限；资金类操作需 TOTP 二次验证；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAdminApprovalEnforced } from "@/lib/admin-approval-guard";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import { undoImportBatch } from "@/lib/spent-import";

const undoBodySchema = z.object({
  totpCode: z.string().max(20).optional(),
  reason: z.string().trim().min(2, "请填写撤销原因或工单号").max(200),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:import")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：撤销导入" } },
        { status: 403 }
      );
    }

    if (isAdminApprovalEnforced() && admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "撤销消费导入需要 owner 审批，请提交审批申请",
            details: { policyKey: "spent.import.undo" },
          },
        },
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

    const parsedBody = undoBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    // 资金类操作：二次验证（TOTP / 备用码）
    const totpResponse = await requireMoneyOperationTotp(admin.id, parsedBody.data.totpCode, {
      request,
      admin,
    });
    if (totpResponse) return totpResponse;

    const auditId = await beginAuditLog({
      action: "undo_spent_import",
      targetType: "spent_import",
      targetId: id,
      detail: { reason: parsedBody.data.reason },
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
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝撤销" },
        },
        { status: 503 }
      );
    }

    let result: Awaited<ReturnType<typeof undoImportBatch>>;
    try {
      result = await undoImportBatch(id);
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
      throw error;
    }

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", { code: result.code });
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_UNDONE: 409,
        NOTHING_TO_UNDO: 400,
        NOT_COMPLETED: 409,
        REVERSAL_EXCEEDS_BALANCE: 409,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", {
      revertedRows: result.revertedRows,
      totalAmount: result.totalAmount,
      reason: parsedBody.data.reason,
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
