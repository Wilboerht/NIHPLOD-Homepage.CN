import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "@/lib/order";
import { queryAndFulfillExpiredPendingOrders } from "@/lib/payment-query";
import { autoExpireUserCoupons } from "@/lib/coupon";
import { healStuckNotifications, cleanupOldNotifications } from "@/lib/notification-idempotency";
import { cleanupExpiredRefreshTokens } from "@/lib/auth-security";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic"; // 不缓存，每次都执行

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  // 校验 Cron Secret，防止被外部恶意调用（timing-safe 比较）
  const cronSecret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!cronSecret || !expected || !safeEqual(cronSecret, expected)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (process.env.NODE_ENV === "development") apiConsole.debug("[Cron] 开始执行订单定时任务...");

    // 0. 取消前先主动查询支付状态，避免误取消已付款订单
    const queryResult = await queryAndFulfillExpiredPendingOrders(25);

    // 1. 30分钟未支付自动取消 (时间可以调整)
    const cancelResult = await autoCancelExpiredOrders(30);

    // 2. 15天未签收自动完成 (时间可以调整)
    const completeResult = await autoCompleteShippedOrders(15);

    // 3. 过期优惠券清理
    const expireResult = await autoExpireUserCoupons();

    // 4. 修复卡住的支付通知记录（PENDING 超时自愈）
    const healedCount = await healStuckNotifications(5);

    // 5. 清理 30 天前的 SUCCESS/FAILED 通知记录
    const cleanedCount = await cleanupOldNotifications(30);

    // 6. 清理过期的 Refresh Token
    const cleanedRefreshTokens = await cleanupExpiredRefreshTokens();

    return NextResponse.json({
      success: true,
      data: {
        paymentQueried: queryResult,
        cancelled: cancelResult,
        completed: completeResult,
        couponsExpired: expireResult,
        healedNotifications: healedCount,
        cleanedNotifications: cleanedCount,
        cleanedRefreshTokens,
      },
      message: "定时任务执行成功",
    });
  } catch (error) {
    apiConsole.error("[Cron] 订单定时任务执行失败:", error);
    return NextResponse.json({ success: false, error: "系统内部错误" }, { status: 500 });
  }
}
