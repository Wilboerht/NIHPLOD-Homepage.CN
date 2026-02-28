/**
 * 微信退款回调接口 (v3)
 */
import { NextRequest, NextResponse } from "next/server";
import { handleRefundNotify } from "@/lib/wechat-pay";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();

        // 提取签名相关的头部进行验签
        const headers = {
            "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
            "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
            "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
            "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
        };

        const result = await handleRefundNotify(headers, rawBody);

        if (result.success) {
            return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
        } else {
            console.error("[Refund Notify] 失败:", result.message);
            return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
        }
    } catch (error) {
        console.error("[Refund Notify] 异常:", error);
        return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
    }
}
