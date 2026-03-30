/**
 * 微信支付回调 API (v3)
 * POST /api/pay/notify
 */
import { NextRequest, NextResponse } from "next/server";
import { handlePaymentNotify } from "@/lib/wechat-pay";
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
    // API v3 验签必须使用原始报文，不能解析后再 JSON.stringify
    const rawBody = await request.text();

    // 解析通知数据用于幂等性检查
    const notifyData = JSON.parse(rawBody);
    const outTradeNo = notifyData.out_trade_no;
    const transactionId = notifyData.resource?.transaction_id || "";

    // 检查通知是否已处理过
    const idempotencyCheck = await isNotificationProcessed("wechat", outTradeNo);
    
    if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
      // 已成功处理过，直接返回成功
      console.log(`[PayNotify] 通知 ${outTradeNo} 已处理过，返回成功应答`);
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    }

    // 记录通知
    const recordResult = await recordNotification(
      "wechat",
      outTradeNo,
      transactionId,
      notifyData.resource?.amount?.total || 0,
      notifyData
    );

    if (!recordResult.success) {
      // 如果无法记录（可能是并发冲突），返回成功以避免重试
      console.warn(`[PayNotify] 无法记录通知 ${outTradeNo}`);
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    }

    recordId = recordResult.recordId;

    // 提取签名相关的头部
    const headers = {
      "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
      "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
      "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
    };

    // 处理支付通知
    const result = await handlePaymentNotify(headers, rawBody);

    if (result.success) {
      // 标记为成功
      if (recordId) {
        await markNotificationSuccess(recordId);
      }
      // v3 成功应答：HTTP 200, JSON 格式
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    } else {
      // 标记为失败
      if (recordId) {
        await markNotificationFailed(recordId, result.message || "Unknown error");
      }
      console.error("[PayNotify] 处理失败:", result.message);
      return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
    }
  } catch (error: any) {
    // 标记为失败
    if (recordId) {
      await markNotificationFailed(recordId, error.message || String(error));
    }
    console.error("[PayNotify] 异常:", error);
    return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
  }
}
