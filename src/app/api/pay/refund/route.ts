/**
 * 申请退款 API
 * POST /api/pay/refund
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { applyWechatRefund } from "@/lib/wechat-pay";
import { applyAlipayRefund } from "@/lib/alipay";
import { yuanToFen, ensureMoneyPrecision } from "@/lib/money";
import { apiError, apiSuccess, ErrorCode } from "@/lib/api-response";
import { z } from "zod";

// 退款参数验证
const refundSchema = z.object({
  orderId: z.string().min(1, "订单ID不能为空"),
  reason: z.string().optional().default("用户申请退款"),
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

    const body = await request.json();
    const result = refundSchema.safeParse(body);

    if (!result.success) {
      return apiError(ErrorCode.INVALID_PARAMS, "参数验证失败");
    }

    const { orderId, reason, refundAmount } = result.data;

    // 获取订单
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: payload.id },
    });

    if (!order) {
      return apiError(ErrorCode.ORDER_NOT_FOUND);
    }

    // 检查订单状态
    if (order.status !== "PAID" && order.status !== "PROCESSING" && order.status !== "SHIPPED") {
      return apiError(ErrorCode.INVALID_ORDER_STATUS, "该订单状态不支持退款");
    }

    // 检查是否已在退款中
    if (order.refundStatus === "PENDING" || order.refundStatus === "SUCCESS") {
      return apiError(ErrorCode.REFUND_ALREADY_PROCESSING);
    }

    // 确定退款金额（如果未指定，则使用全额）
    const actualRefundAmount = refundAmount 
      ? ensureMoneyPrecision(refundAmount) 
      : Number(order.payAmount);

    // 验证退款金额
    if (actualRefundAmount > Number(order.payAmount)) {
      return apiError(ErrorCode.REFUND_EXCEED_AMOUNT);
    }

    // 根据支付方式调用退款 API
    let refundData: any = null;
    let refundApiError = null;

    try {
      if (order.paymentMethod === "wechat" && order.paymentNo) {
        const refundNo = `ref-${orderId}-${Date.now()}`;
        refundData = await applyWechatRefund(
          order.orderNo,
          refundNo,
          Math.round(Number(order.payAmount) * 100), // 原支付金额（分）
          Math.round(actualRefundAmount * 100), // 退款金额（分）
          reason
        );
      } else if (order.paymentMethod === "alipay" && order.paymentNo) {
        refundData = await applyAlipayRefund({
          tradeNo: order.paymentNo,
          refundAmount: actualRefundAmount.toFixed(2),
          refundReason: reason,
        });
      } else {
        return apiError(ErrorCode.INVALID_ORDER_STATUS, "不支持的支付方式或支付信息缺失");
      }
    } catch (error: any) {
      refundApiError = error;
      console.error("退款API错误:", error);
    }

    // 更新订单状态
    const refundNo = `ref-${orderId}-${Date.now()}`;
    const updateData: any = {
      refundStatus: "PENDING",
      refundAmount: actualRefundAmount,
      refundNo: refundNo,
    };

    // 如果API返回成功，更新状态为SUCCESS
    if (refundData?.success === true) {
      updateData.refundStatus = "SUCCESS";
      updateData.refundTime = new Date();
      updateData.status = "REFUNDED";
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    return apiSuccess(
      {
        orderId: updatedOrder.id,
        refundNo: updatedOrder.refundNo,
        refundAmount: updatedOrder.refundAmount,
        refundStatus: updatedOrder.refundStatus,
      },
      refundApiError
        ? "退款申请已提交，请稍候处理"
        : "退款成功"
    );
  } catch (error: any) {
    console.error("退款接口错误:", error);
    return apiError(ErrorCode.INTERNAL_ERROR);
  }
}
