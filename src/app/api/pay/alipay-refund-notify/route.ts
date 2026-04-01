/**
 * 支付宝退款通知 API
 * POST /api/pay/alipay-refund-notify
 * 处理支付宝的退款成功异步通知
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/client";
import crypto from "crypto";

// 支付宝配置
const ALIPAY_CONFIG = {
  alipayPublicKey: (process.env.ALIPAY_PUBLIC_KEY || "").replace(/\\n/g, "\n"),
};

/**
 * RSA2 验签
 */
function verifyWithRSA2(content: string, sign: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(content, "utf8");
    return verify.verify(
      `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      sign,
      "base64"
    );
  } catch {
    return false;
  }
}

/**
 * 生成待签名字符串
 */
function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const tradeNo = params.out_trade_no;
    const refundStatus = params.refund_status;

    console.log(`[AlipayRefundNotify] 收到退款回调: ${tradeNo}, 状态: ${refundStatus}`);

    // 验证签名
    const sign = params.sign;
    const signType = params.sign_type;

    // 移除 sign 和 sign_type 后验签
    const verifyParams = { ...params };
    delete verifyParams.sign;
    delete verifyParams.sign_type;

    const signContent = buildSignContent(verifyParams);

    if (signType === "RSA2" && !verifyWithRSA2(signContent, sign, ALIPAY_CONFIG.alipayPublicKey)) {
      console.error(`[AlipayRefundNotify] 签名验证失败: ${tradeNo}`);
      return new NextResponse("fail", { status: 200 });
    }

    // 检查退款状态：只有 REFUND_SUCCESS 表示退款成功
    if (refundStatus !== "REFUND_SUCCESS") {
      console.warn(`[AlipayRefundNotify] 退款状态无效: ${refundStatus}`);
      return new NextResponse("success", { status: 200 });
    }

    // 根据 out_trade_no（支付宝订单号）查询本地订单
    // 因为支付宝通知的 out_trade_no 对应我们的 order.paymentNo（支付宝交易号）
    // 实际上，支付宝的通知中:
    // - out_trade_no: 我们的订单号 (order.orderNo)
    // - trade_no: 支付宝交易号
    // - refund_status: 退款状态

    const order = await prisma.order.findUnique({
      where: { orderNo: tradeNo },
    });

    if (!order) {
      console.warn(`[AlipayRefundNotify] 订单不存在: ${tradeNo}`);
      return new NextResponse("success", { status: 200 });
    }

    // 检查订单是否已退款
    if (order.status === OrderStatus.REFUNDED) {
      console.log(`[AlipayRefundNotify] 订单已退款: ${tradeNo}`);
      return new NextResponse("success", { status: 200 });
    }

    // 更新订单为已退款
    await prisma.order.update({
      where: { orderNo: tradeNo },
      data: {
        status: OrderStatus.REFUNDED,
        refundTime: new Date(),
        refundStatus: "SUCCESS",
        adminNote: `支付宝自动退款成功 (退款单号: ${params.refund_no || "未提供"})`,
      },
    });

    console.log(`[AlipayRefundNotify] 订单退款成功: ${tradeNo}`);

    // 支付宝要求返回 "success" 字符串
    return new NextResponse("success", { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[AlipayRefundNotify] 异常:", error);
    return new NextResponse("fail", { status: 200 });
  }
}
