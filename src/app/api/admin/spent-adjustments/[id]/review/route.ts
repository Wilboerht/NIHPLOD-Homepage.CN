/**
 * 消费补录审核 API（管理端）
 * POST /api/admin/spent-adjustments/[id]/review
 *
 * Body: { decision: "approve" | "reject", reviewAmount?: number, reviewNote?: string }
 * - approve：必填 reviewAmount（核实金额，以人工核实为准），入账后自动重算会员等级
 * - reject：必填 reviewNote（驳回原因，展示给用户）
 *
 * 权限：所有管理员均可审核；操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { reviewApplication, MAX_REVIEW_AMOUNT, SPENT_STATUS_LABELS } from "@/lib/spent-adjustments";

const reviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reviewAmount: z.number().int().min(1).max(MAX_REVIEW_AMOUNT).optional(),
    reviewNote: z.string().trim().max(500, "备注过长").optional(),
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

    const { decision, reviewAmount, reviewNote } = parsed.data;

    const result = await reviewApplication({
      applicationId: id,
      decision,
      adminId: admin.id,
      reviewAmount,
      reviewNote: reviewNote || undefined,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_REVIEWED: 409,
        INVALID_PARAMS: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    // 审计日志（审核结果合规敏感，同步等待写入）
    await createAuditLog({
      action: decision === "approve" ? "approve_spent_adjustment" : "reject_spent_adjustment",
      targetType: "spent_adjustment",
      targetId: id,
      detail: { decision, reviewAmount, reviewNote },
      adminId: admin.id,
      request,
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
