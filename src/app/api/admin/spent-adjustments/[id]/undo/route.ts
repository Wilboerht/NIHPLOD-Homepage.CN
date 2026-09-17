/**
 * 撤销消费补录审核 API（管理端）
 * POST /api/admin/spent-adjustments/[id]/undo
 *
 * 仅已通过（APPROVED）的申请可撤销：按原核实金额反向冲正历史消费，
 * 申请恢复为待审核（PENDING），可重新审核。操作写入审计日志。
 * 资金类操作：需要 spent:review 权限 + TOTP 二次验证。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import { undoApplication, SPENT_STATUS_LABELS } from "@/lib/spent-adjustments";

const undoBodySchema = z
  .object({ totpCode: z.string().max(20).optional() })
  .optional()
  .default({});

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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费补录撤销" } },
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

    const parsedBody = undoBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    // 资金类操作：二次验证（TOTP / 备用码）
    const totpResponse = await requireMoneyOperationTotp(admin.id, parsedBody.data.totpCode);
    if (totpResponse) return totpResponse;

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
