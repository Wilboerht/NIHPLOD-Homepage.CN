/**
 * 支付宝支付回调 API
 * POST /api/pay/alipay-notify
 */
import { NextRequest, NextResponse } from "next/server";
import { handleAlipayNotify } from "@/lib/alipay";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // 将 FormData 转换为对象
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    console.log("[AlipayNotify] 收到回调:", params.out_trade_no);

    const result = await handleAlipayNotify(params);

    if (result.success) {
      // 返回成功响应（支付宝要求返回 "success" 字符串）
      return new NextResponse("success", { status: 200 });
    } else {
      console.error("[AlipayNotify] 处理失败:", result.message);
      return new NextResponse("fail", { status: 200 });
    }
  } catch (error) {
    console.error("[AlipayNotify] 异常:", error);
    return new NextResponse("fail", { status: 200 });
  }
}

