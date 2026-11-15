import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { baInternalRequest } from "@/lib/ba-internal";
import { advisorRequest } from "@/lib/advisor-internal";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

/** GET /api/admin/integrations/status - BA/测肤子站集成健康检查 */
export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  const allowed =
    hasAdminPermission(admin, "ba:access") ||
    hasAdminPermission(admin, "ba:admin") ||
    hasAdminPermission(admin, "advisor:stats:read") ||
    hasAdminPermission(admin, "cron:read");
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限查看子站集成状态" } },
      { status: 403 }
    );
  }
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;

  const [ba, advisor] = await Promise.all([
    hasAdminPermission(admin, "ba:access") || hasAdminPermission(admin, "ba:admin")
      ? baInternalRequest<unknown>("/api/internal/admin/dashboard", {
          query: { includeComplaints: "false", includeEmergency: "false" },
          timeoutMs: TIMEOUT_MS,
        })
      : Promise.resolve(null),
    hasAdminPermission(admin, "advisor:stats:read")
      ? advisorRequest<unknown>("/api/internal/admin/dashboard", { timeoutMs: TIMEOUT_MS })
      : Promise.resolve(null),
  ]);

  const result = {
    ba: ba
      ? ba.ok
        ? { ok: true }
        : { ok: false, code: ba.code, message: ba.message }
      : { ok: null, reason: "no_permission" },
    advisor: advisor
      ? advisor.ok
        ? { ok: true }
        : { ok: false, code: advisor.code, message: advisor.message }
      : { ok: null, reason: "no_permission" },
    generatedAt: new Date().toISOString(),
  };
  apiConsole.info("[AdminIntegrations] status", {
    ba: result.ba.ok,
    advisor: result.advisor.ok,
  });
  return NextResponse.json(
    { success: true, data: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}
