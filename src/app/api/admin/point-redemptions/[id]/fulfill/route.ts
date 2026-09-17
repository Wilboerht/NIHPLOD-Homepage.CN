/**
 * 积分兑换履约 API（管理端）
 * POST /api/admin/point-redemptions/[id]/fulfill - 标记已履约（可选录入运单号）
 *
 * Body: { waybillNo?: string } - 运单号（顺丰 SF 开头，选填；填写后用户端可查物流轨迹）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { fulfillRedemption } from "@/lib/point-gifts";

export const dynamic = "force-dynamic";

const fulfillSchema = z.object({
  waybillNo: z
    .string()
    .trim()
    .max(32, "运单号过长")
    .regex(/^[A-Za-z0-9-]{8,32}$/, "运单号格式不正确")
    .optional()
    .or(z.literal("")),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!hasAdminPermission(admin, "redemptions:fulfill")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：兑换履约" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const parsed = fulfillSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const waybillNo = parsed.data.waybillNo?.trim() || undefined;

    const result = await fulfillRedemption({ redemptionId: id, adminId: admin.id, waybillNo });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_PROCESSED: 409,
      };
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code,
            message: result.code === "ALREADY_PROCESSED" ? "该兑换已处理" : "兑换记录不存在",
          },
        },
        { status: statusMap[result.code ?? ""] ?? 500 }
      );
    }

    await createAuditLog({
      action: "point_redemption_fulfill",
      targetType: "point_redemption",
      targetId: id,
      detail: { waybillNo: waybillNo ?? null },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "已标记履约" } });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 履约失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
