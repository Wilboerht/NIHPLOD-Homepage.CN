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
} from "@/lib/notification-idempotency";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 速率限制：每个 IP 每分钟最多 60 次回调请求
  const clientIP = getClientIP(request);
  const limitResult = await rateLimit(clientIP, "pay-notify", { maxRequests: 60, windowMs: 60_000 });
  if (!limitResult.success) {
    return NextResponse.json({ code: "FAIL", message: "rate limited" }, { status: 429 });
  }

  try {
    // API v3 验签必须使用原始报文，不能解析后再 JSON.stringify
    const rawBody = await request.text();

    // 解析通知数据用于幂等性检查
    const notifyData = JSON.parse(rawBody);
    // 微信 v3 通知的 out_trade_no 在解密后的密文中，外层只有 id（通知唯一ID）
    const notifyId = notifyData.id || "";

    // 1. 只读幂等检查（不写入，防止 DoS 填满数据库）
    const idempotencyCheck = await isNotificationProcessed("wechat", notifyId);
    if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
      if (process.env.NODE_ENV === "development") console.log(`[PayNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    }

    // 2. 提取签名相关的头部
    const headers = {
      "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
      "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
      "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
    };

    // 3. 先验签 + 处理（验签失败会抛异常，不会创建数据库记录）
    const result = await handlePaymentNotify(headers, rawBody);
    if (!result.success) {
      console.error("[PayNotify] 处理失败:", result.message);
      return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
    }

    // 4. 验签通过且处理成功后，再记录幂等性（防止伪造通知 DoS）
    try {
      const recordResult = await recordNotification(
        "wechat",
        notifyId,
        result.transactionId || "",
        result.amount || 0,
        notifyData
      );
      if (recordResult.success && recordResult.recordId) {
        await markNotificationSuccess(recordResult.recordId);
      }
    } catch (recordError) {
      // 幂等记录失败不影响主流程，但需记录日志
      console.warn(`[PayNotify] 幂等记录失败 ${notifyId}:`, recordError);
    }

    // v3 成功应答：HTTP 200, JSON 格式
    return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
  } catch (error: unknown) {
    console.error("[PayNotify] 异常:", error);
    return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
  }
}
