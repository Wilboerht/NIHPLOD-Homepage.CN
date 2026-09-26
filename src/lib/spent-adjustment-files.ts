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

/** 私有对象命名空间与前缀 */
const OBJECT_PREFIX = "spent-adjustments";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** multipart 请求体粗粒度上限：文件上限（10MB）+ 表单开销；精确校验仍按 file.size 执行 */
export const MAX_SPENT_PROOF_MULTIPART_BYTES = 12 * 1024 * 1024;

/** 解析前按 Content-Length 粗筛，避免超大请求体完整缓冲进内存 */
export function isSpentProofMultipartTooLarge(contentLength: string | null): boolean {
  if (!contentLength) return false; // chunked 无长度：交给后续 file.size 精确校验
  const value = Number(contentLength);
  return Number.isFinite(value) && value > MAX_SPENT_PROOF_MULTIPART_BYTES;
}

/**
 * 新格式对象名（含 userId 前缀）：`spent-adjustments/<userId>/<uuid>.webp`。
 * 归属可由前缀权威判定，不依赖用户可自行填写的申请 images 字段。
 */
function isOwnedObjectKey(userId: string, key: string): boolean {
  const prefix = `${OBJECT_PREFIX}/${userId}/`;
  if (!key.startsWith(prefix)) return false;
  const name = key.slice(prefix.length);
  return name.endsWith(".webp") && UUID_PATTERN.test(name.slice(0, -".webp".length));
}

/** 历史格式对象名（无 userId 前缀）：`spent-adjustments/<uuid>.webp`，需配合申请归属校验 */
function isLegacyObjectKey(key: string): boolean {
  const prefix = `${OBJECT_PREFIX}/`;
  if (!key.startsWith(prefix)) return false;
  const name = key.slice(prefix.length);
  if (name.includes("/")) return false;
  return name.endsWith(".webp") && UUID_PATTERN.test(name.slice(0, -".webp".length));
}

/**
 * 上传凭证截图。
 *
 * 安全策略：
 * - 私有 bucket（ALI_OSS_PRIVATE_BUCKET）优先，对象名含 userId 前缀；
 * - 未配置私有 bucket 时默认 fail-closed（凭证含个人信息，不得落公开存储），
 *   仅非生产环境或显式设置 ALLOW_PUBLIC_SPENT_PROOF_STORAGE=true 时回退公开管线。
 */
export async function uploadSpentProofFile(
  file: File,
  userId: string
): Promise<SpentProofUploadResult> {
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
    // userId 前缀使归属校验可由对象名权威判定（防"把自己申请里的他人 key 拿去签名"）
    const objectName = `${OBJECT_PREFIX}/${userId}/${randomUUID()}.webp`;
    const result = await uploadToPrivateOSS(processed, objectName, "image/webp");
    return { ok: true, url: result.objectName, private: true };
  }

  // 未配置私有 bucket：默认 fail-closed（避免凭证落公开存储 + 1 年公共缓存）
  const allowPublicFallback =
    process.env.ALLOW_PUBLIC_SPENT_PROOF_STORAGE === "true" ||
    process.env.NODE_ENV !== "production";
  if (!allowPublicFallback) {
    return {
      ok: false,
      status: 503,
      code: "STORAGE_NOT_CONFIGURED",
      message: "凭证存储未配置，请联系管理员（需配置 ALI_OSS_PRIVATE_BUCKET）",
    };
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

/** 私有对象签名 URL 有效期：15 分钟（短时效 capability，降低泄漏窗口） */
const PRIVATE_URL_TTL_SECONDS = 15 * 60;

/**
 * 解析凭证图片的签名地址：
 * - 新格式（含 userId 前缀）：前缀即权威归属，直接放行；
 * - 历史格式（无前缀）：必须命中当前用户自己的申请记录（兼容存量对象）；
 * - 私有 bucket 未配置时视为不可用。
 */
export async function resolveSpentProofImage(
  userId: string,
  key: string
): Promise<SpentProofImageResult> {
  if (!key || key.length > 200 || key.includes("..")) {
    return { ok: false, status: 400, code: "INVALID_PARAMS", message: "参数错误" };
  }

  if (!isOwnedObjectKey(userId, key)) {
    if (!isLegacyObjectKey(key)) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
    }
    // 历史对象无 userId 前缀：退化为申请归属校验（兼容存量数据）
    const application = await prisma.spentAdjustmentApplication.findFirst({
      where: { userId, images: { has: key } },
      select: { id: true },
    });
    if (!application) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
    }
  }

  const signedUrl = signPrivateObjectUrl(key, PRIVATE_URL_TTL_SECONDS);
  if (!signedUrl) {
    return { ok: false, status: 404, code: "NOT_CONFIGURED", message: "图片服务未配置" };
  }

  return { ok: true, signedUrl };
}
