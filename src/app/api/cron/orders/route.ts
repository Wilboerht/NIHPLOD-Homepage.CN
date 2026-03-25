import { NextResponse } from "next/server";
import { autoCancelExpiredOrders, autoCompleteShippedOrders } from "@/lib/order";

export const dynamic = "force-dynamic"; // 不缓存，每次都执行

export async function GET(request: Request) {
  try {
    // 【安全检查】如果使用 Vercel Cron，需要验证请求头：
    const authHeader = request.headers.get("authorization");
    const isCronAction = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // 注: 如果暂未配置 CRON_SECRET（或处于开发环境），您可以根据需要放宽限制
    // 此处给出一个宽松的处理方式，如果是正式环境建议只允许 CRON 触发：
    // if (process.env.NODE_ENV === 'production' && !isCronAction) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

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
