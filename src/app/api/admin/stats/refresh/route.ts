import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { invalidateAdminStats } from "@/lib/admin-stats-invalidate";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/admin/stats/refresh - 手动失效仪表盘统计缓存 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "dashboard:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：仪表盘查看" } },
        { status: 403 }
      );
    }
    if (!validateCSRFToken(request)) return csrfForbiddenResponse();
    const limited = await checkAdminRateLimit(request, "admin-write", admin.id);
    if (limited) return limited;

    invalidateAdminStats();
    revalidateTag("admin-sso-stats", "max");

    return NextResponse.json({ success: true, data: { refreshedAt: new Date().toISOString() } });
  } catch (error) {
    apiConsole.error("[AdminStatsRefresh] 刷新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "刷新失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
