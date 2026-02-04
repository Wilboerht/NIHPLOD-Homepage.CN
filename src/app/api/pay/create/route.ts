/**
 * 创建支付 API
 * POST /api/pay/create
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { createPayment } from "@/lib/wechat-pay";
import { createAlipayPayment } from "@/lib/alipay";
import { createUnionPayPayment } from "@/lib/unionpay";
import { z } from "zod";

// 创建支付参数验证
const createPaySchema = z.object({
  orderId: z.string().min(1, "订单ID不能为空"),
  payMethod: z.enum(["wechat", "alipay", "unionpay"]).optional().default("wechat"),
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

    const body = await request.json();

    const result = createPaySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { orderId, payMethod, tradeType } = result.data;

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

    // 银联支付 (银行卡)
    if (payMethod === "unionpay") {
      const uResult = await createUnionPayPayment(orderId);

      if (!uResult.success) {
        return NextResponse.json(
          { success: false, error: { code: "PAY_FAILED", message: uResult.error } },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          payType: "unionpay",
          payHtml: uResult.html,
        }
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

      const payResult = await createPayment(orderId, tradeType, openId);

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
          mwebUrl: payResult.mwebUrl,   // MWEB
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

