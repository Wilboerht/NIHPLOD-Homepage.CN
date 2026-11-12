/**
 * 管理端：售后退分（资金类）
 * POST /api/admin/point-redemptions/[id]/after-sales/refund
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { isAdminApprovalEnforced } from "@/lib/admin-approval-guard";
import { isRedemptionRefundApprovalRequired } from "@/lib/admin-approval-policy";
import { refundAfterSales } from "@/lib/redemption-state-machine";
import { parseAdminJsonBody } from "@/lib/request-body";
import { invalidateAdminStats } from "@/lib/admin-stats-invalidate";

export const dynamic = "force-dynamic";

const schema = z.object({
  note: z.string().trim().max(200).optional(),
  totpCode: z.string().max(20).optional(),
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
    if (!hasAdminPermission(admin, "redemptions:cancel")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：售后退分" } },
        { status: 403 }
      );
    }
    const limit = await checkAdminRateLimit(request, "redemption-after-sales:refund", admin.id);
    if (limit) return limit;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();
    const bodyResult = await parseAdminJsonBody(request);
    if (!bodyResult.ok && bodyResult.response.status === 413) return bodyResult.response;
    const parsed = schema.safeParse(bodyResult.ok ? bodyResult.data : {});
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    if (isAdminApprovalEnforced() && admin.role !== "owner") {
      const redemption = await prisma.pointRedemption.findUnique({
        where: { id },
        select: { points: true, status: true },
      });
      if (!redemption) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
          { status: 404 }
        );
      }
      if (redemption.status !== "RETURNED") {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_STATUS", message: "兑换记录不在待退款状态" } },
          { status: 409 }
        );
      }
      if (isRedemptionRefundApprovalRequired(redemption.points)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "APPROVAL_REQUIRED",
              message: "该操作需要 owner 审批，请前往审批中心提交申请",
              details: { policyKey: "redemption.refund" },
            },
          },
          { status: 403 }
        );
      }
    }

    const totpResponse = await requireMoneyOperationTotp(admin.id, parsed.data.totpCode, {
      request,
      admin,
    });
    if (totpResponse) return totpResponse;

    const auditId = await beginAuditLog({
      action: "point_redemption_refund",
      targetType: "point_redemption",
      targetId: id,
      detail: { note: parsed.data.note ?? null },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        { success: false, error: { code: "AUDIT_UNAVAILABLE", message: "审计不可用，已拒绝操作" } },
        { status: 503 }
      );
    }

    const result = await refundAfterSales({
      redemptionId: id,
      adminId: admin.id,
      note: parsed.data.note,
    });
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      status: result.ok ? result.status : null,
      refundedPoints: result.ok ? result.points : null,
      error: result.ok ? null : result.message,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.code === "NOT_FOUND" ? 404 : 409 }
      );
    }
    invalidateAdminStats();
    return NextResponse.json({
      success: true,
      data: { status: result.status, refundedPoints: result.points },
    });
  } catch (error) {
    apiConsole.error("[AdminRedemptionRefund] 退款失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
