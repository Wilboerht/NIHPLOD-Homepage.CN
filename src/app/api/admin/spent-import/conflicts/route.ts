/**
 * 消费订单跨来源冲突检查（管理端只读）
 * GET /api/admin/spent-import/conflicts
 *
 * 权限：spent:import
 * 不返回手机号，只返回用户/订单/金额/批次/补录申请标识。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { findSpentOrderConflicts } from "@/lib/spent-order-conflicts";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：订单冲突检查" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:read");
    if (rateLimitResponse) return rateLimitResponse;

    const data = await findSpentOrderConflicts({ sinceDays: 90, limit: 100 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[AdminSpentImportConflicts] 检查失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
