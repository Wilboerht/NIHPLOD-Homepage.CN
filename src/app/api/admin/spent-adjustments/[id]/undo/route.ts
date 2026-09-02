/**
 * 撤销消费补录审核 API（管理端）
 * POST /api/admin/spent-adjustments/[id]/undo
 *
 * 仅已通过（APPROVED）的申请可撤销：按原核实金额反向冲正历史消费，
 * 申请恢复为待审核（PENDING），可重新审核。操作写入审计日志。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { undoApplication, SPENT_STATUS_LABELS } from "@/lib/spent-adjustments";

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

    const result = await undoApplication({
      applicationId: id,
      adminId: admin.id,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        ALREADY_REVIEWED: 409,
        NOT_APPROVED: 409,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    // 审计日志（资金相关，合规敏感，同步等待写入）
    await createAuditLog({
      action: "undo_spent_adjustment",
      targetType: "spent_adjustment",
      targetId: id,
      detail: { decision: "undo" },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { status: result.status, statusLabel: SPENT_STATUS_LABELS[result.status] },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 撤销审核失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
