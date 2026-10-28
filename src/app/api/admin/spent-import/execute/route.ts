/**
 * 消费记录导入执行 API（管理端）
 * POST /api/admin/spent-import/execute - 确认导入，逐行入账
 *
 * Body: { previewToken, rowIndexes?, reason, totpCode? }
 * 权限：需要 spent:import 权限；资金类操作需 TOTP 二次验证；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { isAdminApprovalEnforced } from "@/lib/admin-approval-guard";
import { maskPhone } from "@/lib/mask-phone";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import {
  executeImportBatch,
  verifyImportPreviewToken,
  IMPORT_MAX_ROWS,
  IMPORT_PREVIEW_TOKEN_MAX_LENGTH,
  type ExecuteRowInput,
} from "@/lib/spent-import";

const executeSchema = z.object({
  previewToken: z.string().min(1).max(IMPORT_PREVIEW_TOKEN_MAX_LENGTH),
  rowIndexes: z.array(z.number().int().positive()).max(IMPORT_MAX_ROWS).optional(),
  reason: z.string().trim().min(2, "请填写导入原因或工单号").max(200),
  totpCode: z.string().max(20).optional(),
});

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费记录导入" } },
        { status: 403 }
      );
    }

    // 资金类批量写操作：非 owner 必须先发起审批，避免 finance 角色绕过 owner 直接导入。
    if (isAdminApprovalEnforced() && admin.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "消费记录导入需要 owner 审批，请在导入预览页提交审批申请",
            details: { policyKey: "spent.import.execute" },
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

    const body = await request.json();
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { previewToken, rowIndexes, reason, totpCode } = parsed.data;

    // 预览令牌是服务端签发的加密快照：执行接口不再接受客户端回传的金额/订单号/手机号
    const verified = verifyImportPreviewToken(previewToken, admin.id);
    if (!verified.ok) {
      return NextResponse.json(
        { success: false, error: { code: verified.code, message: verified.message } },
        {
          status:
            verified.code === "TOKEN_EXPIRED"
              ? 410
              : verified.code === "TOKEN_FORBIDDEN"
                ? 403
                : 400,
        }
      );
    }

    const { fileName, fileHash, rows } = verified.payload;
    const selectedIndexes = rowIndexes ? new Set(rowIndexes) : null;
    const selectedRows = selectedIndexes
      ? rows.filter((row) => selectedIndexes.has(row.rowIndex))
      : rows;
    if (selectedIndexes && selectedRows.length !== selectedIndexes.size) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ROW_INDEX", message: "包含不存在的行号" } },
        { status: 400 }
      );
    }
    if (selectedRows.some((row) => row.error || !row.phone || row.amount === null)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ROWS", message: "包含未通过预览校验的行" } },
        { status: 400 }
      );
    }

    const resolvedRows: ExecuteRowInput[] = selectedRows.map((row) => ({
      phone: row.phone as string,
      amount: row.amount as number,
      channel: row.channel,
      orderNo: row.orderNo,
      purchasedAt: row.purchasedAt,
      note: row.note,
    }));
    if (resolvedRows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_ROWS", message: "没有可导入的行" } },
        { status: 400 }
      );
    }

    // 资金类操作：二次验证（TOTP / 备用码）
    const totpResponse = await requireMoneyOperationTotp(admin.id, totpCode, {
      request,
      admin,
    });
    if (totpResponse) return totpResponse;

    const auditId = await beginAuditLog({
      action: "import_spent_records",
      targetType: "spent_import",
      detail: {
        fileName,
        fileHash,
        rowCount: resolvedRows.length,
        reason,
      },
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
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝导入" },
        },
        { status: 503 }
      );
    }

    let result: Awaited<ReturnType<typeof executeImportBatch>>;
    try {
      result = await executeImportBatch({
        rows: resolvedRows,
        fileName,
        fileHash,
        reason,
        adminId: admin.id,
      });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", {
        fileName,
        code:
          error instanceof Error && error.message === "IMPORT_ALREADY_EXISTS"
            ? "ALREADY_EXISTS"
            : "EXCEPTION",
      });
      throw error;
    }

    await finishAuditLog(
      auditId,
      "SUCCESS",
      {
        batchId: result.batchId,
        fileName,
        totalRows: result.totalRows,
        successRows: result.successRows,
        duplicateRows: result.duplicateRows,
        errorRows: result.errorRows,
        totalAmount: result.totalAmount,
        reason,
      },
      result.batchId
    );

    // 逐行结果中的手机号脱敏后返回（前端展示/导出失败行用；明文只存在于服务端与原始 Excel）
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        rows: result.rows.map((row) => ({ ...row, phone: maskPhone(row.phone) })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "IMPORT_ALREADY_EXISTS") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ALREADY_IMPORTED",
            message: "该文件已有未撤销的导入批次，请先撤销原批次后再重新导入",
          },
        },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "IMPORT_COMPENSATION_FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "IMPORT_INTEGRITY_ERROR",
            message: "入账后行状态写入失败且自动冲正失败，已停止批次，请立即联系技术核对",
          },
        },
        { status: 500 }
      );
    }
    if (error instanceof Error && error.message === "IMPORT_ROW_COUNT_INVALID") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ROWS", message: "导入行数不合法" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminSpentImport] 执行导入失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "导入失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
