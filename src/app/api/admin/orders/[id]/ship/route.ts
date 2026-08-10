/**
 * 发货 API
 * POST /api/admin/orders/:id/ship
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { shipOrder } from "@/lib/logistics";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const shipSchema = z.object({
  logisticsCompany: z.string().min(1, "请选择物流公司"),
  trackingNo: z.string().min(1, "请填写快递单号"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  // CSRF 保护：非安全方法须校验 CSRF Token（先于认证，正确区分 403/401）
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    const result = shipSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { logisticsCompany, trackingNo } = result.data;

    const shipResult = await shipOrder(id, logisticsCompany, trackingNo);

    if (!shipResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "SHIP_FAILED", message: shipResult.error } },
        { status: 400 }
      );
    }

    // 记录审计日志
    const auditSuccess = await createAuditLog({
      action: "ship_order",
      targetType: "order",
      targetId: id,
      detail: { logisticsCompany, trackingNo },
      adminId: admin.id,
      request,
    });

    if (!auditSuccess) {
      apiConsole.error("[AdminShip] 审计日志写入失败，业务操作已执行");
    }

    revalidateTag("admin-stats", "max");

    return NextResponse.json({
      success: true,
      data: { message: "发货成功" },
    });
  } catch (error) {
    apiConsole.error("[AdminShip] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
