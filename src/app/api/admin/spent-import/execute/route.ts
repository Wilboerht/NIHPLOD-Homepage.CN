/**
 * 消费记录导入执行 API（管理端）
 * POST /api/admin/spent-import/execute - 确认导入，逐行入账
 *
 * Body: { fileName, fileHash?, rows: [{ phone, amount, channel?, orderNo?, purchasedAt?, note? }] }
 * 权限：仅超级管理员（owner）；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import {
  executeImportBatch,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_AMOUNT,
} from "@/lib/spent-import";

const rowSchema = z.object({
  phone: z.string().max(32),
  amount: z.number().int().min(-IMPORT_MAX_AMOUNT).max(IMPORT_MAX_AMOUNT),
  channel: z.string().max(32).nullish(),
  orderNo: z.string().max(64).nullish(),
  purchasedAt: z.string().max(10).nullish(),
  note: z.string().max(500).nullish(),
});

const executeSchema = z.object({
  fileName: z.string().trim().min(1, "缺少文件名").max(200),
  fileHash: z.string().max(64).optional(),
  rows: z.array(rowSchema).min(1, "没有可导入的行").max(IMPORT_MAX_ROWS),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "只有超级管理员可执行导入" } },
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

    const { fileName, fileHash, rows } = parsed.data;

    const result = await executeImportBatch({
      rows,
      fileName,
      fileHash,
      adminId: admin.id,
    });

    await createAuditLog({
      action: "import_spent_records",
      targetType: "spent_import",
      targetId: result.batchId,
      detail: {
        fileName,
        totalRows: result.totalRows,
        successRows: result.successRows,
        duplicateRows: result.duplicateRows,
        errorRows: result.errorRows,
        totalAmount: result.totalAmount,
      },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    apiConsole.error("[AdminSpentImport] 执行导入失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "导入失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
