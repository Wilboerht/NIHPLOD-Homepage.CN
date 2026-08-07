/**
 * 支付宝退款通知 API
 * POST /api/pay/alipay-refund-notify
 * 处理支付宝的退款成功异步通知
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { formatKey } from "@/lib/crypto-utils";
import { verifyWithRSA2, buildSignContent } from "@/lib/alipay";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import {
  isNotificationProcessed,
  recordNotification,
  markNotificationSuccess,
  markNotificationFailed,
} from "@/lib/notification-idempotency";

// 支付宝配置
const ALIPAY_CONFIG = {
  alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY),
};

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 速率限制：每个 IP 每分钟最多 60 次回调请求
  const clientIP = getClientIP(request);
  const limitResult = await rateLimit(clientIP, "alipay-refund-notify", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limitResult.success) {
    return new NextResponse("fail", { status: 200 });
  }

  try {
    const formData = await request.formData();

    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const tradeNo = params.out_trade_no;
    const refundStatus = params.refund_status;

    if (process.env.NODE_ENV === "development")
      apiConsole.debug(`[AlipayRefundNotify] 收到退款回调: ${tradeNo}, 状态: ${refundStatus}`);

    // 验证签名
    const sign = params.sign;
    const signType = params.sign_type;

    // 移除 sign 和 sign_type 后验签
    const verifyParams = { ...params };
    delete verifyParams.sign;
    delete verifyParams.sign_type;

    const signContent = buildSignContent(verifyParams);

    if (signType !== "RSA2") {
      apiConsole.error(`[AlipayRefundNotify] 不支持的签名类型: ${tradeNo}`);
      return new NextResponse("fail", { status: 200 });
    }
    if (!verifyWithRSA2(signContent, sign, ALIPAY_CONFIG.alipayPublicKey)) {
      apiConsole.error(`[AlipayRefundNotify] 签名验证失败: ${tradeNo}`);
      return new NextResponse("fail", { status: 200 });
    }

    // 检查退款状态：只有 REFUND_SUCCESS 表示退款成功
    // 注意：支付宝退款通知中通常不包含 refund_status 字段，此检查为防御性逻辑
    if (refundStatus && refundStatus !== "REFUND_SUCCESS") {
      apiConsole.warn(`[AlipayRefundNotify] 退款状态无效: ${refundStatus}`);
      return new NextResponse("success", { status: 200 });
    }

    const notifyId = params.refund_no || `${tradeNo}_${params.gmt_refund_pay || Date.now()}`;

    // 幂等性检查：验签通过后再检查
    const idempotencyCheck = await isNotificationProcessed("alipay_refund", notifyId);
    if (idempotencyCheck.processed) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug(`[AlipayRefundNotify] 退款通知已处理: ${notifyId}`);
      return new NextResponse("success", { status: 200 });
    }

    let recordId: string | undefined;
    try {
      const recordResult = await recordNotification("alipay_refund", notifyId, tradeNo, 0, params);
      if (recordResult.success && recordResult.recordId) {
        recordId = recordResult.recordId;
      }
    } catch {
      // 记录失败继续处理，不阻断
    }

    // 根据 out_trade_no 查询本地订单
    const order = await prisma.order.findUnique({
      where: { orderNo: tradeNo },
    });

    if (!order) {
      apiConsole.warn(`[AlipayRefundNotify] 订单不存在: ${tradeNo}`);
      if (recordId) await markNotificationSuccess(recordId);
      return new NextResponse("success", { status: 200 });
    }

    // 检查订单是否已退款
    if (order.status === OrderStatus.REFUNDED) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug(`[AlipayRefundNotify] 订单已退款: ${tradeNo}`);
      if (recordId) await markNotificationSuccess(recordId);
      return new NextResponse("success", { status: 200 });
    }

    // 退款金额上限校验
    const refundAmount = parseFloat(params.refund_amount || "0");
    if (refundAmount <= 0 || refundAmount > Number(order.payAmount)) {
      apiConsole.error(
        `[AlipayRefundNotify] 退款金额异常: ${refundAmount}, 订单金额: ${order.payAmount}`
      );
      if (recordId) await markNotificationFailed(recordId, "REFUND_AMOUNT_INVALID");
      return new NextResponse("fail", { status: 200 });
    }

    // 调用统一退款确认逻辑（恢复库存、回滚销量、释放优惠券）
    const { finalizeRefund } = await import("@/lib/refund");
    await finalizeRefund(order.id, params.refund_no || null, refundAmount);

    // 追加 adminNote（幂等：检查是否已包含该退款单号）
    const refundNote = `支付宝自动退款成功 (退款单号: ${params.refund_no || "未提供"})`;
    const newAdminNote = order.adminNote?.includes(refundNote)
      ? order.adminNote
      : order.adminNote
        ? `${order.adminNote}\n${refundNote}`
        : refundNote;

    await prisma.order.update({
      where: { orderNo: tradeNo },
      data: { adminNote: newAdminNote },
    });

    if (process.env.NODE_ENV === "development")
      apiConsole.debug(`[AlipayRefundNotify] 订单退款成功: ${tradeNo}`);
    if (recordId) await markNotificationSuccess(recordId);

    // 支付宝要求返回 "success" 字符串
    return new NextResponse("success", { status: 200 });
  } catch (error: unknown) {
    const isSystemError =
      error instanceof Error &&
      (error.message.includes("connection") ||
        error.message.includes("timeout") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("Prisma"));
    apiConsole.error("[AlipayRefundNotify] 异常:", error);
    // 系统错误返回 500，让支付宝重试；业务错误返回 200 + fail
    if (isSystemError) {
      return new NextResponse("system error", { status: 500 });
    }
    return new NextResponse("fail", { status: 200 });
  }
}
