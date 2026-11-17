import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { advisorRequest } from "@/lib/advisor-internal";
import { apiConsole } from "@/lib/logger";
import type {
  AdvisorAnalytics,
  AdvisorAnalyticsPayload,
} from "@/types/advisor-analytics";
import type { AdvisorDashboardDegradedReason } from "@/types/advisor-dashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ANALYTICS_PATH = "/api/internal/admin/analytics";
const ANALYTICS_TIMEOUT_MS = 8000;

function mapDegradedReason(
  code: string,
  status: number
): AdvisorDashboardDegradedReason {
  if (code === "NOT_CONFIGURED") return "not_configured";
  if (code === "UNAUTHORIZED") return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}

/**
 * 主站控制中台：测肤子站分析摘要（只读）
 * GET /api/admin/subsites/advisor/analytics
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "advisor:stats:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：测肤子站概览" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(
      request,
      "advisor-analytics:read"
    );
    if (rateLimitResponse) return rateLimitResponse;

    const result = await advisorRequest<{
      success?: boolean;
      data?: AdvisorAnalytics;
    }>(ANALYTICS_PATH, { timeoutMs: ANALYTICS_TIMEOUT_MS });

    if (!result.ok) {
      apiConsole.warn("[AdminAdvisorAnalytics] 测肤子站不可用", {
        code: result.code,
        status: result.status,
      });
      const payload: AdvisorAnalyticsPayload = {
        analytics: null,
        degraded: true,
        reason: mapDegradedReason(result.code, result.status),
      };
      return NextResponse.json(
        { success: true, data: payload },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const analytics = result.data?.data ?? null;
    if (!analytics) {
      apiConsole.warn("[AdminAdvisorAnalytics] 子站返回结构异常");
      const payload: AdvisorAnalyticsPayload = {
        analytics: null,
        degraded: true,
        reason: "upstream_error",
      };
      return NextResponse.json(
        { success: true, data: payload },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload: AdvisorAnalyticsPayload = { analytics, degraded: false };
    return NextResponse.json(
      { success: true, data: payload },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    apiConsole.error("[AdminAdvisorAnalytics] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
