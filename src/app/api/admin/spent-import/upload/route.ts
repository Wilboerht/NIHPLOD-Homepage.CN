/**
 * 消费记录导入预览 API（管理端）
 * POST /api/admin/spent-import/upload - 上传 Excel，解析并逐行校验（不落库不入账）
 *
 * multipart/form-data：file 字段（.xlsx / .xls / .csv，≤ 5MB，≤ 500 行）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { createAuditLogStrict } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  parseImportWorkbookIsolated,
  previewImportRows,
  signImportPreviewToken,
  IMPORT_MAX_FILE_SIZE,
} from "@/lib/spent-import";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readFormDataBody,
} from "@/lib/request-body";

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

    if (!hasAdminPermission(admin, "spent:import")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费记录导入" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:preview");
    if (rateLimitResponse) return rateLimitResponse;

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > IMPORT_MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_FILE",
            message: `文件大小不能超过 ${IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
        },
        { status: 413 }
      );
    }

    let formData: FormData;
    try {
      formData = await readFormDataBody(request, BODY_LIMITS.spentImportUpload);
    } catch (error) {
      if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FORM", message: "请求格式错误" } },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要导入的 Excel 文件" } },
        { status: 400 }
      );
    }

    if (file.size > IMPORT_MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_FILE",
            message: `文件大小不能超过 ${IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
        },
        { status: 400 }
      );
    }

    const fileName = (file.name || "import.xlsx").replace(/\\/g, "/").replace(/^.*[\\/]/, "");

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseImportWorkbookIsolated(buffer, fileName);
    if (!parsed.ok) {
      const statusMap: Record<string, number> = {
        INVALID_FILE: 400,
        TOO_MANY_ROWS: 400,
        INVALID_HEADER: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: parsed.code, message: parsed.message } },
        { status: statusMap[parsed.code] ?? 400 }
      );
    }

    const activeBatch = await prisma.spentImportBatch.findFirst({
      where: {
        fileHash: parsed.fileHash,
        undoneAt: null,
        status: { in: ["PROCESSING", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (activeBatch) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ALREADY_IMPORTED",
            message: "该文件已有未撤销的导入批次，请先在导入历史中撤销原批次",
          },
        },
        { status: 409 }
      );
    }

    const preview = await previewImportRows(parsed.rows);
    const previewToken = signImportPreviewToken({
      adminId: admin.id,
      fileName,
      fileHash: parsed.fileHash,
      rows: parsed.rows,
    });

    await createAuditLogStrict({
      action: "spent_import_preview",
      targetType: "spent_import",
      targetLabel: fileName,
      detail: {
        fileName,
        fileHash: parsed.fileHash,
        totalRows: parsed.rows.length,
        okCount: preview.okCount,
        errorCount: preview.errorCount,
      },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        fileHash: parsed.fileHash,
        previewToken,
        rows: preview.rows.map((r) => ({
          rowIndex: r.rowIndex,
          maskedPhone: r.maskedPhone,
          amount: r.amount,
          channel: r.channel,
          channelLabel: r.channelLabel,
          orderNo: r.orderNo,
          purchasedAt: r.purchasedAt,
          note: r.note,
          status: r.error ? "error" : "ok",
          error: r.error,
        })),
        okCount: preview.okCount,
        errorCount: preview.errorCount,
        totalAmount: preview.totalAmount,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentImport] 上传解析失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "上传失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
