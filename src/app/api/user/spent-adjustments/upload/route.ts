/**
 * 消费补录凭证上传 API（用户端）
 * POST /api/user/spent-adjustments/upload - 上传凭证截图（仅图片）
 *
 * 存储策略：
 * - 配置了 ALI_OSS_PRIVATE_BUCKET 时，凭证上传至私有 bucket，返回 objectName（不公开）；
 *   展示/下载一律走鉴权签名 URL（/api/user/spent-adjustments/image）。
 * - 未配置时回退公开管线（与产品图一致，返回可直接访问的 URL）。
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { rateLimit } from "@/lib/ratelimit";
import {
  processAndSaveImage,
  processImageToWebp,
  validateUploadServer,
  validateFileBuffer,
} from "@/lib/upload";
import { isPrivateBucketConfigured, uploadToPrivateOSS } from "@/lib/ali-oss";

export const dynamic = "force-dynamic";

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级上传限流（凭证上传，防滥用）
    const limitResult = await rateLimit(`user-upload:${payload.id}`, "default", {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "上传过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的图片" } },
        { status: 400 }
      );
    }

    // 验证文件（大小 + 声明类型）
    const validation = validateUploadServer(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE", message: validation.error } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // magic bytes 检测真实文件类型（防止 MIME 伪造）
    const fileTypeResult = await validateFileBuffer(buffer);
    if (!fileTypeResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_FILE", message: fileTypeResult.error || "不支持的文件类型" },
        },
        { status: 400 }
      );
    }

    // 凭证仅接受图片（通用上传白名单含 PDF，此处收紧）
    if (!fileTypeResult.detectedType?.startsWith("image/")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_FILE", message: "凭证仅支持图片格式（JPG/PNG/WebP/GIF）" },
        },
        { status: 400 }
      );
    }

    // 私有 bucket 优先：凭证含个人信息，不落公开读存储
    if (isPrivateBucketConfigured()) {
      const processed = await processImageToWebp(buffer);
      const objectName = `spent-adjustments/${randomUUID()}.webp`;
      const result = await uploadToPrivateOSS(processed, objectName, "image/webp");
      return NextResponse.json({
        success: true,
        data: { url: result.objectName, private: true },
      });
    }

    // 安全清理文件名
    const safeName = file.name
      .replace(/\\/g, "/")
      .replace(/^.*[\\/]/, "")
      .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 200);

    // 回退公开管线：凭证截图不需要缩略图/占位符，减轻处理开销
    const result = await processAndSaveImage(buffer, safeName || "receipt", "spent-adjustments", {
      generateThumbnail: false,
      generateBlur: false,
    });

    return NextResponse.json({
      success: true,
      data: { url: result.url, private: false },
    });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 凭证上传失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "上传失败，请稍后重试" } },
      { status: 500 }
    );
  }
});
