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

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let recordId: string | undefined;

  try {
    const formData = await request.formData();
    
    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const tradeNo = params.trade_no || params.out_trade_no;

    console.log("[AlipayNotify] 收到回调:", tradeNo);

    // 检查通知是否已处理过
    const idempotencyCheck = await isNotificationProcessed("alipay", tradeNo);
    
    if (idempotencyCheck.processed && idempotencyCheck.status === "SUCCESS") {
      // 已成功处理过，直接返回成功
      console.log(`[AlipayNotify] 通知 ${tradeNo} 已处理过，返回成功应答`);
      return new NextResponse("success", { status: 200 });
    }

    // 记录通知
    const recordResult = await recordNotification(
      "alipay",
      tradeNo,
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
  } catch (error: any) {
    // 标记为失败
    if (recordId) {
      await markNotificationFailed(recordId, error.message || String(error));
    }
    console.error("[AlipayNotify] 异常:", error);
    return new NextResponse("fail", { status: 200 });
  }
}

