/**
 * 支付宝支付回调 API
 * POST /api/pay/alipay-notify
 */
import { NextRequest, NextResponse } from "next/server";
import { handleAlipayNotify } from "@/lib/alipay";
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
  const limitResult = await rateLimit(clientIP, "alipay-notify", { maxRequests: 60, windowMs: 60_000 });
  if (!limitResult.success) {
    return NextResponse.json({ code: "FAIL", message: "rate limited" }, { status: 429 });
  }

  let recordId: string | undefined;

  try {
    const formData = await request.formData();
    
    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const outTradeNo = params.out_trade_no;
    const tradeNo = params.trade_no || outTradeNo;

    console.log("[AlipayNotify] 收到回调:", outTradeNo);

    // 检查通知是否已处理过（用本地订单号 out_trade_no 作为幂等Key，稳定不变）
    const idempotencyCheck = await isNotificationProcessed("alipay", outTradeNo);
    
    if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
      // 已成功处理过，直接返回成功
      console.log(`[AlipayNotify] 通知 ${outTradeNo} 已处理过，返回成功应答`);
      return new NextResponse("success", { status: 200 });
    }

    // 记录通知
    const recordResult = await recordNotification(
      "alipay",
      outTradeNo,
      tradeNo,
      Math.round(parseFloat(params.receipt_amount || params.total_amount || "0") * 100),
      params
    );

    if (!recordResult.success) {
      // 如果无法记录（可能是并发冲突），返回成功以避免重试
      console.warn(`[AlipayNotify] 无法记录通知 ${tradeNo}`);
      return new NextResponse("success", { status: 200 });
    }

    recordId = recordResult.recordId;

    const result = await handleAlipayNotify(params);

    if (result.success) {
      // 标记为成功
      if (recordId) {
        await markNotificationSuccess(recordId);
      }
      // 返回成功响应（支付宝要求返回 "success" 字符串）
      return new NextResponse("success", { status: 200 });
    } else {
      // 标记为失败
      if (recordId) {
        await markNotificationFailed(recordId, result.message || "Unknown error");
      }
      console.error("[AlipayNotify] 处理失败:", result.message);
      return new NextResponse("fail", { status: 200 });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // 标记为失败
    if (recordId) {
      await markNotificationFailed(recordId, errorMessage);
    }
    console.error("[AlipayNotify] 异常:", error);
    return new NextResponse("fail", { status: 200 });
  }
}

