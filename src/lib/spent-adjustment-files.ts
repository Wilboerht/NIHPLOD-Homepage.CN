/**
 * 消费补录凭证文件：上传与签名访问
 *
 * 会话路由（/api/user/spent-adjustments/{upload,image}）与 OAuth 资源端点
 * （/api/oauth/spent-adjustments/{upload,image}）共用，保证私有 bucket
 * 存储策略与归属校验口径一致。
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  processAndSaveImage,
  processImageToWebp,
  validateUploadServer,
  validateFileBuffer,
} from "@/lib/upload";
import { isPrivateBucketConfigured, uploadToPrivateOSS, signPrivateObjectUrl } from "@/lib/ali-oss";

export type SpentProofUploadResult =
  | { ok: true; url: string; private: boolean }
  | { ok: false; status: number; code: string; message: string };

/**
 * 上传凭证截图：私有 bucket 优先（凭证含个人信息），未配置时回退公开管线。
 */
export async function uploadSpentProofFile(file: File): Promise<SpentProofUploadResult> {
  // 验证文件（大小 + 声明类型）
  const validation = validateUploadServer(file.type, file.size);
  if (!validation.valid) {
    return { ok: false, status: 400, code: "INVALID_FILE", message: validation.error || "文件不合法" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // magic bytes 检测真实文件类型（防止 MIME 伪造）
  const fileTypeResult = await validateFileBuffer(buffer);
  if (!fileTypeResult.valid) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: fileTypeResult.error || "不支持的文件类型",
    };
  }

  // 凭证仅接受图片（通用上传白名单含 PDF，此处收紧）
  if (!fileTypeResult.detectedType?.startsWith("image/")) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: "凭证仅支持图片格式（JPG/PNG/WebP/GIF）",
    };
  }

  // 私有 bucket 优先：凭证含个人信息，不落公开读存储
  if (isPrivateBucketConfigured()) {
    const processed = await processImageToWebp(buffer);
    const objectName = `spent-adjustments/${randomUUID()}.webp`;
    const result = await uploadToPrivateOSS(processed, objectName, "image/webp");
    return { ok: true, url: result.objectName, private: true };
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

  return { ok: true, url: result.url, private: false };
}

export type SpentProofImageResult =
  | { ok: true; signedUrl: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * 解析凭证图片的签名地址：
 * 仅允许凭证所属用户查看（归属校验），私有 bucket 未配置时视为不可用。
 */
export async function resolveSpentProofImage(
  userId: string,
  key: string
): Promise<SpentProofImageResult> {
  if (!key || key.length > 200) {
    return { ok: false, status: 400, code: "INVALID_PARAMS", message: "参数错误" };
  }

  // 归属校验：该对象必须属于当前用户自己的申请
  const application = await prisma.spentAdjustmentApplication.findFirst({
    where: { userId, images: { has: key } },
    select: { id: true },
  });

  if (!application) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
  }

  const signedUrl = signPrivateObjectUrl(key);
  if (!signedUrl) {
    return { ok: false, status: 404, code: "NOT_CONFIGURED", message: "图片服务未配置" };
  }

  return { ok: true, signedUrl };
}
