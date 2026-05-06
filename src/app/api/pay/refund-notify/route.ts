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

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    let recordId: string | undefined;

    try {
        const rawBody = await request.text();

        // 解析通知数据用于幂等性检查
        const notifyData = JSON.parse(rawBody);
        const notifyId = notifyData.id || "";

        // 检查通知是否已处理过
        const idempotencyCheck = await isNotificationProcessed("wechat_refund", notifyId);

        if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
            console.log(`[RefundNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
            return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
        }

        // 记录通知
        const recordResult = await recordNotification(
            "wechat_refund",
            notifyId,
            "",
            0,
            notifyData
        );

        if (!recordResult.success) {
            console.warn(`[RefundNotify] 无法记录通知 ${notifyId}`);
            return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
        }

        recordId = recordResult.recordId;

        // 提取签名相关的头部进行验签
        const headers = {
            "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
            "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
            "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
            "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
        };

        const result = await handleRefundNotify(headers, rawBody);

        if (result.success) {
            if (recordId) await markNotificationSuccess(recordId);
            return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
        } else {
            if (recordId) await markNotificationFailed(recordId, result.message || "Unknown error");
            console.error("[Refund Notify] 失败:", result.message);
            return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (recordId) await markNotificationFailed(recordId, errorMessage);
        console.error("[Refund Notify] 异常:", error);
        return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
    }
}
