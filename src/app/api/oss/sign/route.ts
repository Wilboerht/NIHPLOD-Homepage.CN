/**
 * POST /api/oss/sign
 * 获取阿里云 OSS 直传签名
 */
import { NextRequest, NextResponse } from "next/server";
import { generateUploadSignature } from "@/lib/ali-oss";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { verifyAuth, verifyUserAuth } from "@/lib/auth";
import { z } from "zod";

const signSchema = z.object({
  filename: z.string().min(1, "文件名不能为空").max(255, "文件名过长"),
  type: z.string().min(1, "文件类型不能为空").max(100, "文件类型过长"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // 1. 要求用户登录（优先验证管理员，再验证普通用户）
        const admin = await verifyAuth(request);
        const user = admin ?? (await verifyUserAuth(request));
        if (!user) {
            return NextResponse.json({ error: "请先登录" }, { status: 401 });
        }

        // 2. 频率检查
        const ip = getClientIP(request);
        const limitParams = await rateLimit(ip, "oss-sign");
        if (!limitParams.success) {
            return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
        }

        const body = await request.json();
        const parsed = signSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "参数错误", details: parsed.error.issues }, { status: 400 });
        }
        const { filename, type } = parsed.data;

        // 校验文件扩展名（普通用户只能上传图片和 PDF，视频仅限管理员）
        const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "pdf"];
        const ADMIN_EXTS = ["mp4", "mov"];
        const isAdmin = admin !== null;
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        const allAllowed = isAdmin ? [...ALLOWED_EXTS, ...ADMIN_EXTS] : ALLOWED_EXTS;
        if (!allAllowed.includes(ext)) {
            return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
        }

        // 3. 生成签名
        const signature = await generateUploadSignature(filename, type);

        return NextResponse.json({
            success: true,
            data: signature
        });

    } catch (error) {
        console.error("OSS Sign Error:", error);

        // 如果是未配置 OSS，返回特定错误以便前端降级
        if (error instanceof Error && error.message === "阿里云 OSS 未配置") {
            return NextResponse.json(
                { success: false, error: "NO_OSS" },
                { status: 501 } // Not Implemented
            );
        }

        return NextResponse.json(
            { error: "获取上传签名失败" },
            { status: 500 }
        );
    }
}
