/**
 * 退款审核 API
 * POST /api/admin/orders/:id/refund
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyAuth } from "@/lib/auth";
import { processRefund } from "@/lib/refund";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const refundSchema = z.object({
  approved: z.boolean(),
  adminRemark: z.string().optional(),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    const result = refundSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { approved, adminRemark } = result.data;

    const refundResult = await processRefund(id, approved, adminRemark);

    if (!refundResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "REFUND_FAILED", message: refundResult.error } },
        { status: 400 }
      );
    }

    // 记录审计日志
    const auditSuccess = await createAuditLog({
      action: approved ? "refund_approve" : "refund_reject",
      targetType: "order",
      targetId: id,
      detail: { approved, adminRemark },
      adminId: admin.id,
      request,
    });

    if (!auditSuccess) {
      apiConsole.error("[AdminRefund] 审计日志写入失败，业务操作已执行");
    }

    revalidateTag("admin-stats", "max");

    return NextResponse.json({
      success: true,
      data: {
        message: approved ? "退款已批准" : "退款已拒绝",
      },
    });
  } catch (error) {
    apiConsole.error("[AdminRefund] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
