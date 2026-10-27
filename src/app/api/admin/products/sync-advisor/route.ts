import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { pushAdvisorProductSnapshot } from "@/lib/advisor-product-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/admin/products/sync-advisor - 手动全量同步产品基础信息到测肤子站 */
export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "products:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：产品编辑" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const result = await pushAdvisorProductSnapshot({ trigger: "manual" });

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        data: { skipped: true, reason: result.reason },
      });
    }

    if (!result.ok) {
      const status =
        result.code === "NOT_CONFIGURED"
          ? 503
          : result.status && result.status >= 400
            ? result.status
            : 502;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code || "UPSTREAM_ERROR",
            message: result.message || "测肤子站同步失败",
          },
        },
        { status }
      );
    }

    await createAuditLog({
      action: "sync_products_to_advisor",
      targetType: "product",
      targetId: "all",
      detail: {
        productCount: result.productCount,
        result: result.data,
      },
      adminId: admin.id,
      request,
    }).catch((error) => apiConsole.error("[AuditLog] 审计写入失败:", error));

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    apiConsole.error("手动同步产品到测肤子站失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "手动同步失败" } },
      { status: 500 }
    );
  }
}
