/**
 * 管理端：确认收到退货
 * POST /api/admin/point-redemptions/[id]/after-sales/receive
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
import { receiveReturn } from "@/lib/redemption-state-machine";

export const dynamic = "force-dynamic";

const schema = z.object({
  restockApproved: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：确认退货" } },
        { status: 403 }
      );
    }
    const limit = await checkAdminRateLimit(request, "redemption-after-sales:receive", admin.id);
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
      action: "point_redemption_return_receive",
      targetType: "point_redemption",
      targetId: id,
      detail: {
        restockApproved: parsed.data.restockApproved,
        note: parsed.data.note ?? null,
      },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        { success: false, error: { code: "AUDIT_UNAVAILABLE", message: "审计不可用，已拒绝操作" } },
        { status: 503 }
      );
    }

    const result = await receiveReturn({
      redemptionId: id,
      adminId: admin.id,
      restockApproved: parsed.data.restockApproved,
      note: parsed.data.note,
    });
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      status: result.ok ? result.status : null,
      error: result.ok ? null : result.message,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.code === "NOT_FOUND" ? 404 : 409 }
      );
    }
    return NextResponse.json({ success: true, data: { status: result.status } });
  } catch (error) {
    apiConsole.error("[AdminRedemptionReturn] 确认失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
