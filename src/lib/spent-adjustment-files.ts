/**
 * 消费补录凭证文件：上传与访问
 *
 * 会话路由（/api/user/spent-adjustments/{upload,image}）与 OAuth 资源端点
 * （/api/oauth/spent-adjustments/{upload,image}）共用，保证存储策略与归属校验口径一致。
 *
 * 生产当前使用本地私有存储：
 * - 目录：private/spent-adjustments/<userId>/<uuid>.webp
 * - key：private-local:spent-adjustments/<userId>/<uuid>.webp
 * - 读取：必须经鉴权 API 流式返回，不暴露公开 URL
 */
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { dirname, resolve, sep } from "path";
import { prisma } from "@/lib/prisma";
import { processImageToWebp, validateUploadServer, validateFileBuffer } from "@/lib/upload";
import {
  deletePrivateOSSObject,
  isPrivateBucketConfigured,
  uploadToPrivateOSS,
  signPrivateObjectUrl,
} from "@/lib/ali-oss";

export type SpentProofUploadResult =
  | { ok: true; url: string; private: boolean }
  | { ok: false; status: number; code: string; message: string };

/** 本地私有对象命名空间与前缀 */
const OBJECT_PREFIX = "spent-adjustments";
const LOCAL_KEY_PREFIX = "private-local:";
const OSS_KEY_PREFIX = "private-oss:";
const LEGACY_PRIVATE_KEY_PREFIX = "private:";
const PRIVATE_ROOT = resolve(process.cwd(), "private");
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

function keyToLocalObjectName(key: string): string | null {
  if (!key.startsWith(LOCAL_KEY_PREFIX)) return null;
  return key.slice(LOCAL_KEY_PREFIX.length);
}

function localPathForObject(objectName: string): string | null {
  const localPath = resolve(PRIVATE_ROOT, objectName);
  if (!localPath.startsWith(`${PRIVATE_ROOT}${sep}`)) return null;
  return localPath;
}

function isLocalSpentProofAllowed(): boolean {
  return (
    process.env.ALLOW_LOCAL_SPENT_PROOF_STORAGE === "true" || process.env.NODE_ENV !== "production"
  );
}

async function hasApplicationImage(userId: string, key: string): Promise<boolean> {
  const application = await prisma.spentAdjustmentApplication.findFirst({
    where: { userId, images: { has: key } },
    select: { id: true },
  });
  return Boolean(application);
}

/**
 * 上传凭证截图。
 *
 * 安全策略：
 * - 私有 OSS 优先（未来可选），对象名含 userId 前缀；
 * - 未配置私有 OSS 时使用本地私有存储，要求显式 ALLOW_LOCAL_SPENT_PROOF_STORAGE=true
 *   （非生产环境默认允许，便于本地开发）；
 * - 不再回退到 public/uploads 公开存储。
 */
export async function uploadSpentProofFile(
  file: File,
  userId: string
): Promise<SpentProofUploadResult> {
  // 验证文件（大小 + 声明类型）
  const validation = validateUploadServer(file.type, file.size);
  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_FILE",
      message: validation.error || "文件不合法",
    };
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

  // 私有 OSS 优先（保留未来启用能力）
  if (isPrivateBucketConfigured()) {
    const processed = await processImageToWebp(buffer);
    const objectName = `${OBJECT_PREFIX}/${userId}/${randomUUID()}.webp`;
    const result = await uploadToPrivateOSS(processed, objectName, "image/webp");
    return { ok: true, url: `${OSS_KEY_PREFIX}${result.objectName}`, private: true };
  }

  if (!isLocalSpentProofAllowed()) {
    return {
      ok: false,
      status: 503,
      code: "STORAGE_NOT_CONFIGURED",
      message: "凭证存储未配置，请联系管理员（需配置 ALLOW_LOCAL_SPENT_PROOF_STORAGE 或私有 OSS）",
    };
  }

  const processed = await processImageToWebp(buffer);
  const objectName = `${OBJECT_PREFIX}/${userId}/${randomUUID()}.webp`;
  const localPath = localPathForObject(objectName);
  if (!localPath) {
    return {
      ok: false,
      status: 500,
      code: "STORAGE_ERROR",
      message: "凭证存储路径无效",
    };
  }

  await fs.mkdir(dirname(localPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(localPath, processed, { mode: 0o600 });
  await fs.chmod(localPath, 0o600);

  return { ok: true, url: `${LOCAL_KEY_PREFIX}${objectName}`, private: true };
}

export type SpentProofImageResult =
  | { ok: true; kind: "file"; path: string; contentType: string }
  | { ok: true; kind: "redirect"; signedUrl: string }
  | { ok: false; status: number; code: string; message: string };

/** 私有对象签名 URL 有效期：15 分钟（短时效 capability，降低泄漏窗口） */
const PRIVATE_URL_TTL_SECONDS = 15 * 60;

function signedUrlResult(objectName: string): SpentProofImageResult {
  const signedUrl = signPrivateObjectUrl(objectName, PRIVATE_URL_TTL_SECONDS);
  if (!signedUrl) {
    return { ok: false, status: 404, code: "NOT_CONFIGURED", message: "图片服务未配置" };
  }
  return { ok: true, kind: "redirect", signedUrl };
}

async function localFileResult(path: string): Promise<SpentProofImageResult> {
  try {
    await fs.access(path);
  } catch {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
  }
  return { ok: true, kind: "file", path, contentType: "image/webp" };
}

/**
 * 解析凭证图片：
 * - 本地私有 key：前缀即归属，直接返回本地文件；
 * - 私有 OSS key：前缀即归属，返回短时效签名 URL；
 * - 历史 key（无 userId 前缀）：必须命中当前用户自己的申请记录。
 * - 公开 /uploads/... 不再接受。
 */
export async function resolveSpentProofImage(
  userId: string,
  key: string
): Promise<SpentProofImageResult> {
  if (!key || key.length > 200 || key.includes("..") || key.includes("\\")) {
    return { ok: false, status: 400, code: "INVALID_PARAMS", message: "参数错误" };
  }

  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    const objectName = keyToLocalObjectName(key);
    if (!objectName) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
    }
    if (!isOwnedObjectKey(userId, objectName)) {
      if (!isLegacyObjectKey(objectName) || !(await hasApplicationImage(userId, key))) {
        return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
      }
    }
    const localPath = localPathForObject(objectName);
    if (!localPath) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
    }
    return localFileResult(localPath);
  }

  if (key.startsWith(OSS_KEY_PREFIX)) {
    const objectName = key.slice(OSS_KEY_PREFIX.length);
    if (!isOwnedObjectKey(userId, objectName)) {
      if (!isLegacyObjectKey(objectName) || !(await hasApplicationImage(userId, key))) {
        return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
      }
    }
    return signedUrlResult(objectName);
  }

  if (key.startsWith(LEGACY_PRIVATE_KEY_PREFIX)) {
    const objectName = key.slice(LEGACY_PRIVATE_KEY_PREFIX.length);
    if (!isOwnedObjectKey(userId, objectName)) {
      if (!isLegacyObjectKey(objectName) || !(await hasApplicationImage(userId, key))) {
        return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
      }
    }
    const localPath = localPathForObject(objectName);
    if (
      localPath &&
      (await fs
        .access(localPath)
        .then(() => true)
        .catch(() => false))
    ) {
      return { ok: true, kind: "file", path: localPath, contentType: "image/webp" };
    }
    return signedUrlResult(objectName);
  }

  if (key.startsWith(`${OBJECT_PREFIX}/`)) {
    if (isOwnedObjectKey(userId, key)) return signedUrlResult(key);
    if (isLegacyObjectKey(key) && (await hasApplicationImage(userId, key))) {
      return signedUrlResult(key);
    }
    return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
  }

  return { ok: false, status: 404, code: "NOT_FOUND", message: "图片不存在" };
}

/**
 * 删除凭证文件（账号注销使用）。
 *
 * 只允许删除当前用户前缀的本地私有对象；任意 /uploads/... 一律不删，
 * 历史 OSS 对象仅在私有 bucket 已配置且归属匹配时删除。
 */
export async function deleteSpentProofFile(key: string, userId: string): Promise<boolean> {
  if (!key || key.includes("..") || key.includes("\\")) return false;

  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    const objectName = keyToLocalObjectName(key);
    if (!objectName || !isOwnedObjectKey(userId, objectName)) return false;
    const localPath = localPathForObject(objectName);
    if (!localPath) return false;
    try {
      await fs.unlink(localPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  if (key.startsWith(OSS_KEY_PREFIX)) {
    const objectName = key.slice(OSS_KEY_PREFIX.length);
    if (!isOwnedObjectKey(userId, objectName)) {
      if (!isLegacyObjectKey(objectName) || !(await hasApplicationImage(userId, key))) {
        return false;
      }
    }
    return deletePrivateOSSObject(objectName);
  }

  if (key.startsWith(LEGACY_PRIVATE_KEY_PREFIX)) {
    const objectName = key.slice(LEGACY_PRIVATE_KEY_PREFIX.length);
    if (!isOwnedObjectKey(userId, objectName)) {
      if (!isLegacyObjectKey(objectName) || !(await hasApplicationImage(userId, key))) {
        return false;
      }
    }
    const localPath = localPathForObject(objectName);
    if (localPath) {
      try {
        await fs.unlink(localPath);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return deletePrivateOSSObject(objectName);
  }

  if (key.startsWith(`${OBJECT_PREFIX}/`)) {
    if (!isOwnedObjectKey(userId, key)) {
      if (!isLegacyObjectKey(key) || !(await hasApplicationImage(userId, key))) {
        return false;
      }
    }
    return deletePrivateOSSObject(key);
  }

  // 公开 /uploads/... 或未知 key：不删除，避免任意文件删除。
  return false;
}
