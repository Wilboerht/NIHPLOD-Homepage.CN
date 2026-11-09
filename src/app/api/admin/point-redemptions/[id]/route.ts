/**
 * 管理端兑换详情/时间线
 * GET /api/admin/point-redemptions/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { getRedemptionTimeline } from "@/lib/redemption-state-machine";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "***";
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "redemptions:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：兑换记录查看" } },
        { status: 403 }
      );
    }
    const limit = await checkAdminRateLimit(request, "point-redemptions:detail", admin.id);
    if (limit) return limit;
    const canReadAfterSales = hasAdminPermission(admin, "redemptions:after-sales");

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();
    const detail = await getRedemptionTimeline(id);
    if (!detail) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        ...detail,
        phone: maskPhone(detail.phone),
        address: detail.address ? "***" : null,
        afterSalesReason: canReadAfterSales ? detail.afterSalesReason : null,
        afterSalesReviewNote: canReadAfterSales ? detail.afterSalesReviewNote : null,
        afterSalesImages: canReadAfterSales ? detail.afterSalesImages : [],
        returnWaybillNo: canReadAfterSales ? detail.returnWaybillNo : null,
        returnCarrier: canReadAfterSales ? detail.returnCarrier : null,
        inspectionNote: canReadAfterSales ? detail.inspectionNote : null,
        events: detail.events.map((event) => ({
          ...event,
          reasonText: canReadAfterSales ? event.reasonText : null,
          metadata: canReadAfterSales ? event.metadata : null,
          createdAt: event.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminRedemptionDetail] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
