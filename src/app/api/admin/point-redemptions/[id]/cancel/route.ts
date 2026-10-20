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
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import { cancelRedemption } from "@/lib/point-gifts";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  note: z.string().trim().max(200, "取消原因过长").optional(),
  // 资金类操作二次验证码（TOTP 或备用码）
  totpCode: z.string().max(20).optional(),
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
    if (!hasAdminPermission(admin, "redemptions:cancel")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：取消兑换并退分" } },
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

    // 资金类操作：二次验证（TOTP / 备用码）
    const totpResponse = await requireMoneyOperationTotp(admin.id, parsed.data.totpCode, {
      request,
      admin,
    });
    if (totpResponse) return totpResponse;

    const auditId = await beginAuditLog({
      action: "point_redemption_cancel",
      targetType: "point_redemption",
      targetId: id,
      detail: { note: parsed.data.note ?? null },
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

    let result: Awaited<ReturnType<typeof cancelRedemption>>;
    try {
      result = await cancelRedemption({ redemptionId: id, note: parsed.data.note });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
      throw error;
    }

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", { code: result.code ?? "UNKNOWN" });
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_PROCESSED: 409,
      };
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code,
            message:
              result.code === "ALREADY_PROCESSED" ? "该兑换已处理，无法取消" : "兑换记录不存在",
          },
        },
        { status: statusMap[result.code ?? ""] ?? 500 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", {
      refundedPoints: result.points,
      note: parsed.data.note ?? null,
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
