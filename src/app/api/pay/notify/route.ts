/**
 * 微信支付回调 API (v3)
 * POST /api/pay/notify
 *
 * 处理顺序：先验签 → 处理业务 → 成功后记录幂等
 * 避免未验签就写入 PaymentNotification 表导致 DoS。
 */
import { NextRequest, NextResponse } from "next/server";
import { handlePaymentNotify } from "@/lib/wechat-pay";
import { isNotificationProcessed, recordNotification } from "@/lib/notification-idempotency";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import prisma from "@/lib/prisma";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 速率限制：每个 IP 每分钟最多 120 次回调请求
  const clientIP = getClientIP(request);
  const limitResult = await rateLimit(clientIP, "pay-notify", {
    maxRequests: 120,
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
        apiConsole.debug(`[PayNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
      return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
    }

    // 1. 预记录幂等（PENDING 状态），防止并发/重试导致重复处理
    let notificationRecordId: string | null = null;
    try {
      const recordResult = await recordNotification(
        "wechat",
        notifyId,
        "",
        0,
        {}
      );
      if (recordResult.success && recordResult.recordId) {
        notificationRecordId = recordResult.recordId;
      }
    } catch {
      // 记录失败不阻塞，业务处理层已有 CAS 防重
    }

    // 2. 验签 + 处理业务
    const headers = {
      "wechatpay-signature": request.headers.get("wechatpay-signature") || "",
      "wechatpay-timestamp": request.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": request.headers.get("wechatpay-nonce") || "",
      "wechatpay-serial": request.headers.get("wechatpay-serial") || "",
    };

    const result = await handlePaymentNotify(headers, rawBody);
    if (!result.success) {
      apiConsole.error("[PayNotify] 处理失败:", result.message);
      return NextResponse.json({ code: "FAIL", message: result.message }, { status: 400 });
    }

    // 3. 更新幂等记录为 SUCCESS
    if (notificationRecordId) {
      try {
        await prisma.paymentNotification.update({
          where: { id: notificationRecordId },
          data: {
            transactionId: result.transactionId || "",
            amount: (result.amount || 0) / 100,
            rawData: JSON.stringify(notifyData),
            status: "SUCCESS",
            processedAt: new Date(),
          },
        });
      } catch (recordError) {
        apiConsole.warn(`[PayNotify] 幂等记录更新失败 ${notifyId}:`, recordError);
      }
    }

    return NextResponse.json({ code: "SUCCESS", message: "成功" }, { status: 200 });
  } catch (error: unknown) {
    apiConsole.error("[PayNotify] 异常:", error);
    return NextResponse.json({ code: "FAIL", message: "系统错误" }, { status: 500 });
  }
}
