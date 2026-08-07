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
} from "@/lib/notification-idempotency";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 速率限制：每个 IP 每分钟最多 60 次回调请求
  const clientIP = getClientIP(request);
  const limitResult = await rateLimit(clientIP, "alipay-notify", {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!limitResult.success) {
    return NextResponse.json({ code: "FAIL", message: "rate limited" }, { status: 429 });
  }

  try {
    const formData = await request.formData();

    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const outTradeNo = params.out_trade_no;
    const tradeNo = params.trade_no || outTradeNo;
    // 使用支付宝 notify_id 作为幂等 Key；若不存在则使用 out_trade_no + trade_status 组合
    const notifyId = params.notify_id || `${outTradeNo}_${params.trade_status || ""}`;

    if (process.env.NODE_ENV === "development") apiConsole.debug("[AlipayNotify] 收到回调:", outTradeNo);

    // 1. 只读幂等检查（不写入，防止 DoS 填满数据库）
    const idempotencyCheck = await isNotificationProcessed("alipay", notifyId);
    if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug(`[AlipayNotify] 通知 ${notifyId} 已处理过，返回成功应答`);
      return new NextResponse("success", { status: 200 });
    }

    // 2. 先验签 + 处理（验签失败会返回 fail，不会创建数据库记录）
    const result = await handleAlipayNotify(params);
    if (!result.success) {
      apiConsole.error("[AlipayNotify] 处理失败:", result.message);
      return new NextResponse("fail", { status: 200 });
    }

    // 3. 验签通过且处理成功后，再记录幂等性
    try {
      const amount = parseFloat(params.receipt_amount || params.total_amount || "0"); // 元
      const recordResult = await recordNotification("alipay", notifyId, tradeNo, amount, params);
      if (recordResult.success && recordResult.recordId) {
        await markNotificationSuccess(recordResult.recordId);
      }
    } catch (recordError) {
      apiConsole.warn(`[AlipayNotify] 幂等记录失败 ${notifyId}:`, recordError);
    }

    // 返回成功响应（支付宝要求返回 "success" 字符串）
    return new NextResponse("success", { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiConsole.error("[AlipayNotify] 异常:", error);
    // 区分系统错误和业务错误：系统错误返回 500 让支付宝重试
    const isSystemError =
      errorMessage.includes("connection") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("Prisma");
    if (isSystemError) {
      return new NextResponse("system error", { status: 500 });
    }
    return new NextResponse("fail", { status: 200 });
  }
}
