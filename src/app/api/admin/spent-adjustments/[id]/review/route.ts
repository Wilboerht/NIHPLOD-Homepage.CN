/**
 * 消费补录审核 API（管理端）
 * POST /api/admin/spent-adjustments/[id]/review
 *
 * Body: { decision: "approve" | "reject", reviewAmount?: number, reviewNote?: string }
 * - approve：必填 reviewAmount（核实金额，以人工核实为准），入账后自动重算会员等级
 * - reject：必填 reviewNote（驳回原因，展示给用户）
 *
 * 权限：需要 spent:review 权限；资金类操作需二次验证（TOTP）；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import { isSpentReviewApprovalRequired } from "@/lib/admin-approval-policy";
import { isAdminApprovalEnforced } from "@/lib/admin-approval-guard";
import { reviewApplication, MAX_REVIEW_AMOUNT, SPENT_STATUS_LABELS } from "@/lib/spent-adjustments";

const reviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reviewAmount: z.number().int().min(1).max(MAX_REVIEW_AMOUNT).optional(),
    reviewNote: z.string().trim().max(500, "备注过长").optional(),
    // 资金类操作二次验证码（TOTP 或备用码）
    totpCode: z.string().max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "approve" && !data.reviewAmount) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewAmount"],
        message: "通过审核必须填写核实金额",
      });
    }
    if (data.decision === "reject" && !data.reviewNote?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewNote"],
        message: "驳回必须填写原因",
      });
    }
  });

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:review")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费补录审核" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:write");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { decision, reviewAmount, reviewNote, totpCode } = parsed.data;

    const claimed = await prisma.spentAdjustmentApplication.findUnique({
      where: { id },
      select: { amountClaimed: true },
    });
    if (!claimed) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "消费补录不存在" } },
        { status: 404 }
      );
    }

    if (
      isAdminApprovalEnforced() &&
      admin.role !== "owner" &&
      decision === "approve" &&
      isSpentReviewApprovalRequired(reviewAmount ?? 0, claimed.amountClaimed)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "该操作需要 owner 审批，请前往审批中心提交申请",
            details: { policyKey: "spent.review.approve" },
          },
        },
        { status: 403 }
      );
    }

    // 资金类操作：二次验证（TOTP / 备用码）
    const totpResponse = await requireMoneyOperationTotp(admin.id, totpCode, {
      request,
      admin,
    });
    if (totpResponse) return totpResponse;

    const action = decision === "approve" ? "approve_spent_adjustment" : "reject_spent_adjustment";
    const auditId = await beginAuditLog({
      action,
      targetType: "spent_adjustment",
      targetId: id,
      detail: { decision, reviewAmount, reviewNote },
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

    let result: Awaited<ReturnType<typeof reviewApplication>>;
    try {
      result = await reviewApplication({
        applicationId: id,
        decision,
        adminId: admin.id,
        reviewAmount,
        reviewNote: reviewNote || undefined,
      });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { decision, error: "EXCEPTION" });
      throw error;
    }

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", { decision, code: result.code });
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_REVIEWED: 409,
        ORDER_ALREADY_IMPORTED: 409,
        ORDER_CONFLICT: 409,
        INVALID_PARAMS: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", {
      decision,
      reviewAmount,
      reviewNote,
      status: result.status,
    });

    return NextResponse.json({
      success: true,
      data: { status: result.status, statusLabel: SPENT_STATUS_LABELS[result.status] },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 审核失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
