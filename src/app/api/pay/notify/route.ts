/**
 * 微信支付回调 API (v3)
 * POST /api/pay/notify
 */
import { NextRequest, NextResponse } from "next/server";
import { handlePaymentNotify } from "@/lib/wechat-pay";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // API v3 验签必须使用原始报文，不能解析后再 JSON.stringify
    const rawBody = await request.text();

    // 提取签名相关的头部
    const headers = {
      "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
      "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
      "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
    };

    const result = await handlePaymentNotify(headers, rawBody);

    if (result.success) {
      // v3 成功应答：HTTP 200, JSON 格式
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    } else {
      console.error("[PayNotify] 处理失败:", result.message);
      return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
    }
  } catch (error) {
    console.error("[PayNotify] 异常:", error);
    return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
  }
}
