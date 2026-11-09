/**
 * 管理端：关闭兑换售后
 * POST /api/admin/point-redemptions/[id]/after-sales/close
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { closeAfterSales } from "@/lib/redemption-state-machine";

export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(2, "请填写关闭原因").max(200),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "redemptions:after-sales")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：关闭售后" } },
        { status: 403 }
      );
    }
    const limit = await checkAdminRateLimit(request, "redemption-after-sales:close", admin.id);
    if (limit) return limit;
    const stepUp = await requireAdminStepUp(request, admin);
    if (stepUp) return stepUp;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const auditId = await beginAuditLog({
      action: "point_redemption_after_sales_close",
      targetType: "point_redemption",
      targetId: id,
      detail: { reason: parsed.data.reason },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        { success: false, error: { code: "AUDIT_UNAVAILABLE", message: "审计不可用，已拒绝操作" } },
        { status: 503 }
      );
    }

    const closed = await closeAfterSales({
      redemptionId: id,
      actorType: "ADMIN",
      actorId: admin.id,
      reason: parsed.data.reason,
    });
    await finishAuditLog(auditId, closed ? "SUCCESS" : "FAILURE", {
      reason: parsed.data.reason,
      closed,
    });
    if (!closed) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "当前状态不能关闭售后" } },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, data: { status: "AFTER_SALES_CLOSED" } });
  } catch (error) {
    apiConsole.error("[AdminRedemptionClose] 关闭失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
