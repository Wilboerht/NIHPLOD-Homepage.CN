/**
 * 管理端对账中心（只读）
 * GET /api/admin/reconciliation?limit=100&sinceDays=90
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { runAdminReconciliation } from "@/lib/admin-reconciliation";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).default(100),
  sinceDays: z.coerce.number().int().min(1).max(365).default(90),
});

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
    if (!hasAdminPermission(admin, "reconciliation:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：对账中心查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "reconciliation:read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      sinceDays: searchParams.get("sinceDays") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const report = await runAdminReconciliation(parsed.data);
    return NextResponse.json({ success: true, data: report }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    apiConsole.error("[AdminReconciliation] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "对账检查失败" } },
      { status: 500 }
    );
  }
}
