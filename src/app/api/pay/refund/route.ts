/**
 * 申请退款 API
 * POST /api/pay/refund
 * 
 * 用户端退款申请（仅改变订单状态为 REFUNDING，等待管理员审批）
 * 实际退款由管理员通过后台审批时触发
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { ensureMoneyPrecision } from "@/lib/money";
import { apiError, apiSuccess, ErrorCode } from "@/lib/api-response";
import { dualRateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/client";

// 退款参数验证
const refundSchema = z.object({
  orderId: z.string().min(1, "订单ID不能为空"),
  reason: z.string().min(5, "退款原因需至少5个字符").max(500, "退款原因过长"),
  refundAmount: z.number().positive("退款金额必须大于0").optional(),
});

// 强制动态渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return apiError(ErrorCode.UNAUTHORIZED);
    }

    // 速率限制检查（防止滥用退款申请）
    const clientIP = getClientIP(request);
    const rateLimitResult = await dualRateLimit(
      clientIP,
      payload.id,
      "refund-request",
      "refund-request"
    );

    if (!rateLimitResult.success) {
      return apiError(
        ErrorCode.RATE_LIMITED,
        `请求过于频繁，请在 ${Math.ceil((rateLimitResult.reset - Date.now()) / 1000)} 秒后重试`
      );
    }

    const body = await request.json();
    const result = refundSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues?.[0]?.message || "参数验证失败";
      return apiError(ErrorCode.INVALID_PARAMS, firstError);
    }

    const { orderId, reason, refundAmount } = result.data;

    // 获取订单（包含items用于后续库存恢复）
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: payload.id },
      include: { items: true },
    });

    if (!order) {
      return apiError(ErrorCode.ORDER_NOT_FOUND);
    }

    // 检查订单状态：只有已支付、处理中、已发货的订单才能申请退款
    const refundableStatus: (typeof OrderStatus)[keyof typeof OrderStatus][] = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ];

    if (!refundableStatus.includes(order.status)) {
      return apiError(ErrorCode.INVALID_ORDER_STATUS, "该订单状态不支持退款");
    }

    // 检查是否已有退款申请在处理中
    if (order.status === OrderStatus.REFUNDING) {
      return apiError(ErrorCode.REFUND_ALREADY_PROCESSING, "您已有退款申请正在处理中");
    }

    if (order.refundStatus === "SUCCESS" || order.status === OrderStatus.REFUNDED) {
      return apiError(ErrorCode.REFUND_ALREADY_PROCESSING, "该订单已退款");
    }

    // 验证退款金额
    const actualRefundAmount = refundAmount 
      ? ensureMoneyPrecision(refundAmount) 
      : Number(order.payAmount);

    if (actualRefundAmount <= 0) {
      return apiError(ErrorCode.INVALID_PARAMS, "退款金额必须大于0");
    }

    if (actualRefundAmount > Number(order.payAmount)) {
      return apiError(ErrorCode.REFUND_EXCEED_AMOUNT, `退款金额不能超过订单金额 ${order.payAmount}`);
    }

    // 部分退款提示
    if (actualRefundAmount < Number(order.payAmount)) {
      if (process.env.NODE_ENV === "development") console.log(`[Refund] 部分退款申请: 订单 ${order.orderNo}, 申请 ${actualRefundAmount}, 订单总额 ${order.payAmount}`);
    }

    // 更新订单状态为 REFUNDING（等待管理员审批）
    // 不直接调用第三方支付网关的退款接口，改为等待管理员审批后再退款
    const refundNo = `ref-${orderId}-${Date.now()}`;
    
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.REFUNDING,
        refundStatus: "PENDING",
        refundAmount: actualRefundAmount,
        refundNo: refundNo,
        remark: reason,
      },
    });

    return apiSuccess(
      {
        orderId: updatedOrder.id,
        refundNo: updatedOrder.refundNo,
        refundAmount: updatedOrder.refundAmount,
        refundStatus: updatedOrder.refundStatus,
        message: "退款申请已提交，请等待管理员审批"
      },
      "退款申请已提交"
    );
  } catch (error: unknown) {
    console.error("退款接口错误:", error);
    return apiError(ErrorCode.INTERNAL_ERROR);
  }
}
