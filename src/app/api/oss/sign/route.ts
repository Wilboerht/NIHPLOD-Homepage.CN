/**
 * POST /api/oss/sign
 * 获取阿里云 OSS 直传签名
 */
import { NextRequest, NextResponse } from "next/server";
import { generateUploadSignature } from "@/lib/ali-oss";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // 1. 简单的身份/频率检查
        const ip = getClientIP(request);
        const limitParams = await rateLimit(ip, "oss-sign");
        if (!limitParams.success) {
            return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
        }

        const { filename, type } = await request.json();

        if (!filename || !type) {
            return NextResponse.json({ error: "Missing filename or type" }, { status: 400 });
        }

        // 2. 生成签名
        const signature = await generateUploadSignature(filename, type);

        return NextResponse.json({
            success: true,
            data: signature
        });

    } catch (error) {
        console.error("OSS Sign Error:", error);
        return NextResponse.json(
            { error: "获取上传签名失败" },
            { status: 500 }
        );
    }
}
