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
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hasAdminPermission } from "@/lib/admin-permissions";
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：运单号维护" } },
        { status: 403 }
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

    const auditId = await beginAuditLog({
      action: "point_redemption_waybill_update",
      targetType: "point_redemption",
      targetId: id,
      detail: { waybillNo },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    let result: Awaited<ReturnType<typeof updateRedemptionWaybill>>;
    try {
      result = await updateRedemptionWaybill({ redemptionId: id, waybillNo });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
      throw error;
    }

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", { code: result.code ?? "UNKNOWN" });
      if (result.code === "INVALID_STATUS") {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_STATUS", message: "仅已履约的兑换单可维护运单号" },
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
        { status: 404 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", { waybillNo });

    return NextResponse.json({ success: true, data: { message: "运单号已更新" } });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptions] 运单号更新失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
