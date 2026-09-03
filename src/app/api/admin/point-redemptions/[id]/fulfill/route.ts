/**
 * 积分兑换履约 API（管理端）
 * POST /api/admin/point-redemptions/[id]/fulfill - 标记已履约（发货/核销）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { fulfillRedemption } from "@/lib/point-gifts";

export const dynamic = "force-dynamic";

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

    const rateLimitResponse = await checkAdminRateLimit(request, "point-redemptions:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const result = await fulfillRedemption({ redemptionId: id, adminId: admin.id });

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
      detail: {},
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
