
import { NextRequest, NextResponse } from "next/server";
import { handleUnionPayNotify } from "@/lib/unionpay";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const params: Record<string, string> = {};
        formData.forEach((value, key) => {
            params[key] = value.toString();
        });

        console.log("[UnionPayNotify] 收到回调:", params.orderId);

        const result = await handleUnionPayNotify(params);

        if (result.success) {
            return new NextResponse("ok", { status: 200 });
        } else {
            return new NextResponse("fail", { status: 400 });
        }
    } catch (error) {
        console.error("[UnionPay] Callback Error", error);
        return new NextResponse("error", { status: 500 });
    }
}
