/**
 * SSO 概览统计 API
 * GET /api/admin/oauth/stats
 *
 * 返回：活跃客户端数、活跃授权数、今日/本周/本月事件数、授权成功率
 * 权限：需 sso:read
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiConsole } from "@/lib/logger";
import { getSsoOverview } from "@/lib/sso-overview";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 先鉴权后限流：未认证请求不消耗已登录管理员共用的限流桶
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;
    if (!hasAdminPermission(admin, "sso:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：SSO 统计查看" } },
        { status: 403 }
      );
    }

    // 与仪表盘共用同一统计函数：UTC+8 日界、周一为周首、成功率仅统计 authorize
    const overview = await getSsoOverview();

    return NextResponse.json({
      success: true,
      data: {
        activeClients: overview.activeClients,
        activeSessions: overview.activeSessions,
        activeRefreshTokens: overview.activeRefreshTokens,
        events: overview.events,
        // 无数据时返回 null，由前端展示"暂无数据"，避免误导性的 100%
        successRate: overview.successRate,
        eventsByType: overview.eventsByType,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthStats] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
