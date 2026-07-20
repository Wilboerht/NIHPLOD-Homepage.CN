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
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 速率限制：每个 IP 每分钟最多 60 次回调请求
  const clientIP = getClientIP(request);
  const limitResult = await rateLimit(clientIP, "pay-notify", {
    maxRequests: 60,
    windowMs: 60_000,
  });
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
      if (process.env.NODE_ENV === "development")
        console.log(`[PayNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    }

    // 2. 先记录幂等性（占位 PENDING），防止并发重复处理
    //    recordNotification 内部有唯一约束，并发请求第二个会返回 P2002 错误
    let recordId: string | undefined;
    try {
      const recordResult = await recordNotification(
        "wechat",
        notifyId,
        notifyData.out_trade_no || "",
        0, // 金额在验签解密后才知道，先记 0
        notifyData
      );
      if (!recordResult.success) {
        // 并发请求：已被另一个请求先记录
        if (process.env.NODE_ENV === "development")
          console.log(`[PayNotify] 通知 ${notifyId} 正在被其他请求处理`);
        return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
      }
      recordId = recordResult.recordId;
    } catch (recordError) {
      console.warn(`[PayNotify] 幂等记录失败 ${notifyId}:`, recordError);
      // 记录失败不阻塞主流程，防止因幂等表故障导致支付失败
    }

    // 3. 提取签名相关的头部
    const headers = {
      "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
      "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
      "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
    };

    // 4. 验签 + 处理
    const result = await handlePaymentNotify(headers, rawBody);
    if (!result.success) {
      // 处理失败：标记通知为 FAILED
      if (recordId) {
        await markNotificationFailed(recordId, result.message || "支付处理失败").catch(() => {});
      }
      apiConsole.error("[PayNotify] 处理失败:", result.message);
      return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
    }

    // 5. 处理成功：标记通知为 SUCCESS
    if (recordId) {
      await markNotificationSuccess(recordId).catch(() => {});
    }

    return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
  } catch (error: unknown) {
    apiConsole.error("[PayNotify] 异常:", error);
    return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
  }
}
