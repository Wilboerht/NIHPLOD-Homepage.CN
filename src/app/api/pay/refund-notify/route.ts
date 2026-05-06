/**
 * 微信退款回调接口 (v3)
 */
import { NextRequest, NextResponse } from "next/server";
import { handleRefundNotify } from "@/lib/wechat-pay";
import {
  isNotificationProcessed,
  recordNotification,
  markNotificationSuccess,
  markNotificationFailed,
} from "@/lib/notification-idempotency";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    // 速率限制：每个 IP 每分钟最多 60 次回调请求
    const clientIP = getClientIP(request);
    const limitResult = await rateLimit(clientIP, "refund-notify", { maxRequests: 60, windowMs: 60_000 });
    if (!limitResult.success) {
      return NextResponse.json({ code: "FAIL", message: "rate limited" }, { status: 429 });
    }

    try {
        const rawBody = await request.text();

        // 解析通知数据用于幂等性检查
        const notifyData = JSON.parse(rawBody);
        const notifyId = notifyData.id || "";

        // 1. 只读幂等检查（不写入，防止 DoS 填满数据库）
        const idempotencyCheck = await isNotificationProcessed("wechat_refund", notifyId);
        if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
            console.log(`[RefundNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
            return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
        }

        // 2. 提取签名相关的头部进行验签
        const headers = {
            "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
            "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
            "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
            "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
        };

        // 3. 先验签 + 处理
        const result = await handleRefundNotify(headers, rawBody);
        if (!result.success) {
            console.error("[Refund Notify] 失败:", result.message);
            return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
        }

        // 4. 验签通过且处理成功后，再记录幂等性
        try {
            const recordResult = await recordNotification("wechat_refund", notifyId, "", 0, notifyData);
            if (recordResult.success && recordResult.recordId) {
                await markNotificationSuccess(recordResult.recordId);
            }
        } catch (recordError) {
            console.warn(`[RefundNotify] 幂等记录失败 ${notifyId}:`, recordError);
        }

        return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[Refund Notify] 异常:", error);
        return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
    }
}
