import { NextRequest, NextResponse } from "next/server";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "@/lib/order";
import { autoExpireUserCoupons } from "@/lib/coupon";

export const dynamic = "force-dynamic"; // 不缓存，每次都执行

export async function GET(request: NextRequest) {
  // 校验 Cron Secret，防止被外部恶意调用
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    console.log("[Cron] 开始执行订单定时任务...");

    // 1. 30分钟未支付自动取消 (时间可以调整)
    const cancelResult = await autoCancelExpiredOrders(30);

    // 2. 15天未签收自动完成 (时间可以调整)
    const completeResult = await autoCompleteShippedOrders(15);

    // 3. 过期优惠券清理
    const expireResult = await autoExpireUserCoupons();

    return NextResponse.json({
      success: true,
      data: {
        cancelled: cancelResult,
        completed: completeResult,
        couponsExpired: expireResult,
      },
      message: "定时任务执行成功"
    });
  } catch (error) {
    console.error("[Cron] 订单定时任务执行失败:", error);
    return NextResponse.json(
      { success: false, error: "系统内部错误" },
      { status: 500 }
    );
  }
}
