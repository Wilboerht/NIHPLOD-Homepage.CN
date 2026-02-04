
import { NextRequest, NextResponse } from "next/server";
import { handleAlipayNotify } from "@/lib/alipay";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // 支付宝推送的数据是 Form Data
        const formData = await request.formData();
        const params: Record<string, string> = {};

        formData.forEach((value, key) => {
            params[key] = value.toString();
        });

        console.log("[AlipayNotify] 收到回调:", params.out_trade_no);

        const result = await handleAlipayNotify(params);

        if (result.success) {
            return new NextResponse("success", { status: 200 });
        } else {
            return new NextResponse("fail", { status: 200 });
        }
    } catch (error) {
        console.error("[AlipayNotify] 异常:", error);
        return new NextResponse("fail", { status: 500 });
    }
}
