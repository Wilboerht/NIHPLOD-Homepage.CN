import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { dirname, join, resolve, sep } from "path";
import {
  deletePrivateOSSObject,
  isPrivateBucketConfigured,
  signPrivateObjectUrl,
  uploadToPrivateOSS,
} from "@/lib/ali-oss";
import { validateFileBuffer } from "@/lib/upload";

/**
 * 简历私有存储
 *
 * 新 key 显式携带存储后端：
 * - private-local:resumes/<uuid>.pdf  → 服务器本地 private/ 目录
 * - private-oss:resumes/<uuid>.pdf    → 私有 OSS bucket
 *
 * 历史 key `private:resumes/<uuid>.pdf` 无法区分后端，读取时先查本地文件，
 * 不存在再回退私有 OSS；删除时两边都尝试，避免切换存储后留下不可管理的 PII。
 */

const LEGACY_KEY_PREFIX = "private:";
const LOCAL_KEY_PREFIX = "private-local:";
const OSS_KEY_PREFIX = "private-oss:";
const OBJECT_PREFIX = "resumes/";
const FILE_PATTERN =
  /^(?:private-local:|private-oss:|private:)resumes\/[0-9a-f-]{36}\.pdf$/i;
const PRIVATE_ROOT = resolve(process.cwd(), "private");
const PRIVATE_URL_TTL_SECONDS = 5 * 60;

export type ResumeStorageBackend = "local" | "oss" | "legacy";

export type ResumeDownload =
  | { kind: "redirect"; url: string }
  | { kind: "file"; path: string; filename: string };

interface ParsedResumeKey {
  backend: ResumeStorageBackend;
  objectName: string;
}

/** 生产环境默认禁止把简历落到本地磁盘，除非显式开启逃生开关。 */
export function isLocalResumeStorageAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOCAL_RESUME_STORAGE === "true"
  );
}

/** 清洗候选人上传的原始文件名，仅用于展示/下载，不参与存储路径。 */
export function sanitizeResumeFileName(input: string | null | undefined): string | null {
  if (!input) return null;
  const base = input
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!base) return null;
  const limited = base.slice(0, 200);
  return /\.pdf$/i.test(limited) ? limited : `${limited}.pdf`;
}

/** 生成安全的 Content-Disposition（ASCII 回退 + RFC 5987 UTF-8）。 */
export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeResumeFileName(filename) ?? "resume.pdf";
  const fallback =
    safe
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "resume.pdf";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function parseResumeKey(key: string): ParsedResumeKey | null {
  if (!FILE_PATTERN.test(key)) return null;
  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    return { backend: "local", objectName: key.slice(LOCAL_KEY_PREFIX.length) };
  }
  if (key.startsWith(OSS_KEY_PREFIX)) {
    return { backend: "oss", objectName: key.slice(OSS_KEY_PREFIX.length) };
  }
  return { backend: "legacy", objectName: key.slice(LEGACY_KEY_PREFIX.length) };
}

function localObjectPath(objectName: string): string | null {
  const localPath = resolve(PRIVATE_ROOT, objectName);
  if (!localPath.startsWith(`${PRIVATE_ROOT}${sep}`)) return null;
  return localPath;
}

async function resolveLocalDownload(
  objectName: string,
  filename: string
): Promise<ResumeDownload | null> {
  const localPath = localObjectPath(objectName);
  if (!localPath) return null;
  try {
    await fs.access(localPath);
    return { kind: "file", path: localPath, filename };
  } catch {
    return null;
  }
}

function resolveOssDownload(objectName: string, filename: string): ResumeDownload | null {
  if (!isPrivateBucketConfigured()) return null;
  const url = signPrivateObjectUrl(
    objectName,
    PRIVATE_URL_TTL_SECONDS,
    contentDispositionAttachment(filename)
  );
  return url ? { kind: "redirect", url } : null;
}

export function getResumeStorageBackend(key: string): ResumeStorageBackend | null {
  return parseResumeKey(key)?.backend ?? null;
}

export function getResumeObjectName(key: string): string | null {
  return parseResumeKey(key)?.objectName ?? null;
}

export async function uploadResumeFile(buffer: Buffer): Promise<{ key: string }> {
  const typeCheck = await validateFileBuffer(buffer);
  if (!typeCheck.valid || typeCheck.detectedType !== "application/pdf") {
    throw new Error("INVALID_RESUME_FILE");
  }

  const objectName = `${OBJECT_PREFIX}${randomUUID()}.pdf`;

  if (isPrivateBucketConfigured()) {
    const result = await uploadToPrivateOSS(buffer, objectName, "application/pdf");
    return { key: `${OSS_KEY_PREFIX}${result.objectName}` };
  }

  if (!isLocalResumeStorageAllowed()) {
    throw new Error("RESUME_STORAGE_NOT_CONFIGURED");
  }

  const localPath = localObjectPath(objectName);
  if (!localPath) {
    throw new Error("INVALID_RESUME_PATH");
  }
  await fs.mkdir(dirname(localPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(localPath, buffer, { mode: 0o600 });
  return { key: `${LOCAL_KEY_PREFIX}${objectName}` };
}

export function isPrivateResumeKey(key: string): boolean {
  return parseResumeKey(key) !== null;
}

export async function resolveResumeDownload(
  key: string,
  filename = "resume.pdf"
): Promise<ResumeDownload | null> {
  const parsed = parseResumeKey(key);
  if (!parsed) return null;
  const safeFilename = sanitizeResumeFileName(filename) ?? "resume.pdf";

  if (parsed.backend === "local") {
    return resolveLocalDownload(parsed.objectName, safeFilename);
  }

  if (parsed.backend === "oss") {
    return resolveOssDownload(parsed.objectName, safeFilename);
  }

  // 历史 key：优先本地（切到私有 OSS 之前写入的文件），再回退 OSS
  const local = await resolveLocalDownload(parsed.objectName, safeFilename);
  if (local) return local;
  return resolveOssDownload(parsed.objectName, safeFilename);
}

async function unlinkLocalResume(objectName: string): Promise<boolean> {
  const localPath = localObjectPath(objectName);
  if (!localPath) throw new Error("INVALID_RESUME_PATH");
  try {
    await fs.unlink(localPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteResumeFile(key: string): Promise<void> {
  const parsed = parseResumeKey(key);
  if (!parsed) return;

  if (parsed.backend === "local") {
    await unlinkLocalResume(parsed.objectName);
    return;
  }

  if (parsed.backend === "oss") {
    if (!isPrivateBucketConfigured()) {
      throw new Error("PRIVATE_RESUME_BUCKET_NOT_CONFIGURED");
    }
    await deletePrivateOSSObject(parsed.objectName);
    return;
  }

  // 历史 key：两边都尝试，避免只删掉其中一份。
  // 先记录错误，确保本地和 OSS 都尝试过后再抛出，由调用方告警/重试。
  let localError: unknown = null;
  try {
    await unlinkLocalResume(parsed.objectName);
  } catch (error) {
    localError = error;
  }

  let ossError: unknown = null;
  if (isPrivateBucketConfigured()) {
    try {
      await deletePrivateOSSObject(parsed.objectName);
    } catch (error) {
      ossError = error;
    }
  }

  if (localError) throw localError;
  if (ossError) throw ossError;
}

export function getPrivateResumeRoot(): string {
  return join(PRIVATE_ROOT, "resumes");
}
