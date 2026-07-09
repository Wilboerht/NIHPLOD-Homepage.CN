/**
 * POST /api/oss/sign
 * 获取阿里云 OSS 直传签名
 */
import { NextRequest, NextResponse } from "next/server";
import { generateUploadSignature } from "@/lib/ali-oss";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { verifyAuth, verifyUserAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const signSchema = z.object({
  filename: z.string().min(1, "文件名不能为空").max(255, "文件名过长"),
  type: z.string().min(1, "文件类型不能为空").max(100, "文件类型过长"),
  size: z.number().int("文件大小必须为整数").positive("文件大小必须为正数").max(100 * 1024 * 1024, "文件大小超过最大限制"),
});

// 允许的图片 MIME 类型
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// 允许的视频 MIME 类型（仅管理员）
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
// 禁止的可执行/危险 MIME 类型
const BLOCKED_CONTENT_TYPES = ["text/html", "application/javascript", "application/xhtml+xml"];
// 文件名安全字符白名单
const FILENAME_SAFE_REGEX = /^[a-zA-Z0-9._-]+$/;
// 扩展名到 MIME 的映射（用于一致性校验）
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

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
        const { filename, type, size } = parsed.data;

        // 文件名安全字符白名单
        if (!FILENAME_SAFE_REGEX.test(filename)) {
            return NextResponse.json({ error: "文件名包含非法字符" }, { status: 400 });
        }

        // 校验文件扩展名（普通用户只能上传图片和 PDF，视频仅限管理员）
        const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "pdf"];
        const ADMIN_EXTS = ["mp4", "mov"];
        const isAdmin = admin !== null;
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        const allAllowed = isAdmin ? [...ALLOWED_EXTS, ...ADMIN_EXTS] : ALLOWED_EXTS;
        if (!allAllowed.includes(ext)) {
            return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
        }

        // MIME 类型白名单与可执行类型拦截
        if (BLOCKED_CONTENT_TYPES.includes(type)) {
            return NextResponse.json({ error: "不允许的文件类型" }, { status: 400 });
        }

        const isImage = ALLOWED_IMAGE_TYPES.includes(type);
        const isVideo = ALLOWED_VIDEO_TYPES.includes(type);

        if (!isImage && !(isAdmin && isVideo)) {
            return NextResponse.json({ error: "不支持的 MIME 类型" }, { status: 400 });
        }

        // 文件大小限制（普通用户图片最大 10MB；管理员视频最大 100MB）
        if (isImage && size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "图片大小不能超过 10MB" }, { status: 400 });
        }
        if (isAdmin && isVideo && size > 100 * 1024 * 1024) {
            return NextResponse.json({ error: "视频大小不能超过 100MB" }, { status: 400 });
        }

        // 扩展名与 MIME 类型一致性校验
        if (EXT_TO_MIME[ext] && EXT_TO_MIME[ext] !== type) {
            return NextResponse.json({ error: "文件扩展名与 MIME 类型不一致" }, { status: 400 });
        }

        // 3. 生成签名
        const signature = await generateUploadSignature(filename, type);

        return NextResponse.json({
            success: true,
            data: signature
        });

    } catch (error) {
        apiConsole.error("OSS Sign Error:", error);

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
