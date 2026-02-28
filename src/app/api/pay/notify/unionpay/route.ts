

import { NextRequest, NextResponse } from "next/server";
import { handleUnionPayNotify } from "@/lib/unionpay";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        console.log("[UnionPayNotify] 收到聚合支付回调:", body.billNo);

        const result = await handleUnionPayNotify(body);

        if (result.success) {
            // 银联商务聚合支付成功响应：SUCCESS
            return new NextResponse("SUCCESS", { status: 200 });
        } else {
            console.error("[UnionPayNotify] 处理失败:", result.message);
            return new NextResponse("FAIL", { status: 200 });
        }
    } catch (error) {
        console.error("[UnionPay] Callback Error", error);
        return new NextResponse("error", { status: 500 });
    }
}
