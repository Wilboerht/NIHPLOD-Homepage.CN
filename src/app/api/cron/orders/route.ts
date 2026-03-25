import { NextResponse } from "next/server";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "@/lib/order";

export const dynamic = "force-dynamic"; // 不缓存，每次都执行

export async function GET() {
  try {
    console.log("[Cron] 开始执行订单定时任务...");

    // 1. 30分钟未支付自动取消 (时间可以调整)
    const cancelResult = await autoCancelExpiredOrders(30);

    // 2. 15天未签收自动完成 (时间可以调整)
    const completeResult = await autoCompleteShippedOrders(15);

    return NextResponse.json({
      success: true,
      data: {
        cancelled: cancelResult,
        completed: completeResult,
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
