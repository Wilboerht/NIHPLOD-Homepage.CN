/**
 * 消费记录导入模板下载（管理端）
 * GET /api/admin/spent-import/template - 下载 xlsx 模板（表头 + 示例行）
 */
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { IMPORT_HEADERS } from "@/lib/spent-import";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:read");
  if (rateLimitResponse) return rateLimitResponse;

  const rows = [
    [...IMPORT_HEADERS],
    // 示例行手机号故意为非法格式：即使管理员忘记删除该行，预览也会标记错误并被跳过，不会误入账
    ["12345678901", 1280, "2026-01-15", "天猫", "TM20260115001", "示例行，填写前请删除"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 30 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "消费记录");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="spent-import-template.xlsx"',
    },
  });
}
