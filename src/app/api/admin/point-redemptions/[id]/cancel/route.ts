/**
 * 积分兑换取消 API（管理端，仅超级管理员）
 * POST /api/admin/point-redemptions/[id]/cancel - 取消待履约兑换并退还积分
 *
 * Body: { note?: string } - 取消原因（写入退还流水备注）
 * 退款走正向 ADJUST 流水（6 个月有效期），可重复触发时幂等防重。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { cancelRedemption } from "@/lib/point-gifts";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  note: z.string().trim().max(200, "取消原因过长").optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可取消兑换并退分" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:cancel");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const parsed = cancelSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const result = await cancelRedemption({ redemptionId: id, note: parsed.data.note });

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
            message: result.code === "ALREADY_PROCESSED" ? "该兑换已处理，无法取消" : "兑换记录不存在",
          },
        },
        { status: statusMap[result.code ?? ""] ?? 500 }
      );
    }

    await createAuditLog({
      action: "point_redemption_cancel",
      targetType: "point_redemption",
      targetId: id,
      detail: { refundedPoints: result.points, note: parsed.data.note ?? null },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { message: `已取消兑换并退还 ${result.points} 积分`, refundedPoints: result.points },
    });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 取消失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
