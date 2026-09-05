/**
 * 兑换运单号维护 API（管理端）
 * PATCH /api/admin/point-redemptions/[id]/waybill - 补录/更新/清除运单号
 *
 * Body: { waybillNo?: string } - 空字符串表示清除
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { updateRedemptionWaybill } from "@/lib/point-gifts";

export const dynamic = "force-dynamic";

const waybillSchema = z.object({
  waybillNo: z
    .string()
    .trim()
    .max(32, "运单号过长")
    .regex(/^[A-Za-z0-9-]{8,32}$/, "运单号格式不正确")
    .optional()
    .or(z.literal("")),
});

export async function PATCH(
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

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const parsed = waybillSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const waybillNo = parsed.data.waybillNo?.trim() || null;

    const result = await updateRedemptionWaybill({ redemptionId: id, waybillNo });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
        { status: 404 }
      );
    }

    await createAuditLog({
      action: "point_redemption_waybill_update",
      targetType: "point_redemption",
      targetId: id,
      detail: { waybillNo },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "运单号已更新" } });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 运单号更新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
