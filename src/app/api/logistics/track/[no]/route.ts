
import { NextRequest, NextResponse } from "next/server";
import { querySFExpressRoute } from "@/lib/sf-express";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ no: string }> }) {
    try {
        const { no } = await params;
        const result = await querySFExpressRoute(no);
        return NextResponse.json(result);
    } catch (error) {
        console.error("[TrackAPI] Error:", error);
        return NextResponse.json({ success: false, error: "系统错误" }, { status: 500 });
    }
}
