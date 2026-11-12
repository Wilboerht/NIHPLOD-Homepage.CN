import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { canReadBaComplaints, hasAdminPermission } from "@/lib/admin-permissions";
import { baInternalRequest } from "@/lib/ba-internal";
import { apiConsole } from "@/lib/logger";
import type {
  BaDashboardData,
  BaDashboardDegradedReason,
  BaDashboardPayload,
} from "@/types/ba-dashboard";

export const dynamic = "force-dynamic";

const DASHBOARD_PATH = "/api/internal/admin/dashboard";
const DASHBOARD_TIMEOUT_MS = 4000;

function mapDegradedReason(code: string, status: number): BaDashboardDegradedReason {
  if (code === "NOT_CONFIGURED") return "not_configured";
  if (code === "UNAUTHORIZED") return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}

/**
 * 主站管理端 BA 证书平台看板（只读）
 * GET /api/admin/subsites/ba/overview
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }

  const canAccessBa =
    hasAdminPermission(admin, "ba:access") || hasAdminPermission(admin, "ba:admin");
  if (!canAccessBa) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "权限不足：BA 证书平台看板" } },
      { status: 403 }
    );
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "ba-dashboard:read");
  if (rateLimitResponse) return rateLimitResponse;

  const canReadComplaints = canReadBaComplaints(admin);
  const result = await baInternalRequest<BaDashboardData>(DASHBOARD_PATH, {
    query: { includeComplaints: canReadComplaints ? "true" : "false" },
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });

  if (!result.ok) {
    apiConsole.warn("[AdminBaDashboard] BA 看板不可用", {
      code: result.code,
      status: result.status,
    });
    const payload: BaDashboardPayload = {
      dashboard: null,
      degraded: true,
      reason: mapDegradedReason(result.code, result.status),
      canReadComplaints,
    };
    return NextResponse.json({ success: true, data: payload });
  }

  const payload: BaDashboardPayload = {
    dashboard: result.data,
    degraded: false,
    canReadComplaints,
  };
  return NextResponse.json({ success: true, data: payload });
}
