/**
 * 获取可用支付方式列表 API
 * GET /api/pay/methods
 */
import { NextResponse } from "next/server";
import { getEnabledPaymentMethods } from "@/lib/payment-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const methods = getEnabledPaymentMethods();

    return NextResponse.json({
      success: true,
      data: methods,
    });
  } catch (error) {
    console.error("获取支付方式失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取支付方式失败" } },
      { status: 500 }
    );
  }
}
