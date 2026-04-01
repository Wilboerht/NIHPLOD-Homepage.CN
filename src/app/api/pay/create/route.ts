/**
 * 创建支付 API
 * POST /api/pay/create
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { createPayment } from "@/lib/wechat-pay";
import { createAlipayPayment } from "@/lib/alipay";
import { isPaymentMethodEnabled } from "@/lib/payment-config";
import { dualRateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";

// 创建支付参数验证
const createPaySchema = z.object({
  orderId: z.string().min(1, "订单ID不能为空"),
  payMethod: z.enum(["wechat", "alipay"]).optional().default("wechat"),
  tradeType: z.enum(["NATIVE", "JSAPI", "MWEB"]).default("NATIVE"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 速率限制检查（双重限制：IP + 用户）
    const clientIP = getClientIP(request);
    const rateLimitResult = await dualRateLimit(
      clientIP,
      payload.id,
      "payment-create",
      "payment-user"
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `请求过于频繁，请在 ${Math.ceil((rateLimitResult.reset - Date.now()) / 1000)} 秒后重试`,
          },
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();

    const result = createPaySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { orderId, payMethod, tradeType } = result.data;

    // 检查支付方式是否启用
    if (!isPaymentMethodEnabled(payMethod)) {
      return NextResponse.json(
        { success: false, error: { code: "PAYMENT_METHOD_DISABLED", message: `${payMethod} 暂不可用` } },
        { status: 400 }
      );
    }

    // 验证订单归属
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: payload.id },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    // 检查订单状态 - 只能从 PENDING 或 PAYING 发起支付
    if (order.status !== "PENDING" && order.status !== "PAYING") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "订单状态不支持支付" } },
        { status: 400 }
      );
    }

    // 将订单状态更新为 PAYING（支付中）
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAYING" },
    });

    // 支付宝支付
    if (payMethod === "alipay") {
      const alipayResult = await createAlipayPayment(orderId);

      if (!alipayResult.success) {
        return NextResponse.json(
          { success: false, error: { code: "PAY_FAILED", message: alipayResult.error } },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          payType: "alipay",
          payUrl: alipayResult.payUrl,
        },
      });
    }

    // 微信支付
    if (payMethod === "wechat") {
      let openId: string | undefined = undefined;

      // JSAPI 需要 OpenID
      if (tradeType === "JSAPI") {
        const user = await prisma.user.findUnique({
          where: { id: payload.id },
          select: { wechatOpenId: true },
        });

        if (!user?.wechatOpenId) {
          return NextResponse.json(
            { success: false, error: { code: "NO_OPENID", message: "请使用微信登录后支付" } },
            { status: 400 }
          );
        }
        openId = user.wechatOpenId;
      }

      // 将 v2 的 MWEB 转换为 v3 的 H5
      const v3TradeType = tradeType === "MWEB" ? "H5" : tradeType;

      // 获取真实 IP
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

      const payResult = await createPayment(orderId, v3TradeType as "H5" | "JSAPI" | "NATIVE", openId, clientIp);

      if (!payResult.success) {
        return NextResponse.json(
          { success: false, error: { code: "PAY_FAILED", message: payResult.error } },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          payType: "wechat",
          tradeType,
          codeUrl: payResult.codeUrl,   // NATIVE
          mwebUrl: payResult.mwebUrl,   // H5 (MWEB)
          payParams: payResult.payParams, // JSAPI
        },
      });
    }

    return NextResponse.json(
      { success: false, error: { code: "NOT_SUPPORTED", message: "暂不支持该支付方式" } },
      { status: 400 }
    );

  } catch (error) {
    console.error("[CreatePay] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

