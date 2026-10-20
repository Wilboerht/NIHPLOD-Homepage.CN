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

const KEY_PREFIX = "private:resumes/";
const FILE_PATTERN = /^private:resumes\/[0-9a-f-]{36}\.pdf$/i;
const PRIVATE_ROOT = resolve(process.cwd(), "private");
const PRIVATE_URL_TTL_SECONDS = 5 * 60;

export type ResumeDownload =
  { kind: "redirect"; url: string } | { kind: "file"; path: string; filename: string };

export async function uploadResumeFile(buffer: Buffer): Promise<{ key: string }> {
  const typeCheck = await validateFileBuffer(buffer);
  if (!typeCheck.valid || typeCheck.detectedType !== "application/pdf") {
    throw new Error("INVALID_RESUME_FILE");
  }

  const objectName = `resumes/${randomUUID()}.pdf`;

  if (isPrivateBucketConfigured()) {
    const result = await uploadToPrivateOSS(buffer, objectName, "application/pdf");
    return { key: `private:${result.objectName}` };
  }

  const localPath = resolve(PRIVATE_ROOT, objectName);
  if (!localPath.startsWith(`${PRIVATE_ROOT}${sep}`)) {
    throw new Error("INVALID_RESUME_PATH");
  }
  await fs.mkdir(dirname(localPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(localPath, buffer, { mode: 0o600 });
  return { key: `${KEY_PREFIX}${objectName.slice("resumes/".length)}` };
}

export function isPrivateResumeKey(key: string): boolean {
  return FILE_PATTERN.test(key);
}

export async function resolveResumeDownload(key: string): Promise<ResumeDownload | null> {
  if (!isPrivateResumeKey(key)) return null;
  const objectName = key.slice("private:".length);

  if (isPrivateBucketConfigured()) {
    const url = signPrivateObjectUrl(objectName, PRIVATE_URL_TTL_SECONDS);
    return url ? { kind: "redirect", url } : null;
  }

  const localPath = resolve(PRIVATE_ROOT, objectName);
  if (!localPath.startsWith(`${PRIVATE_ROOT}${sep}`)) return null;
  try {
    await fs.access(localPath);
    return { kind: "file", path: localPath, filename: "resume.pdf" };
  } catch {
    return null;
  }
}

export async function deleteResumeFile(key: string): Promise<void> {
  if (!isPrivateResumeKey(key)) return;
  const objectName = key.slice("private:".length);

  if (isPrivateBucketConfigured()) {
    await deletePrivateOSSObject(objectName);
    return;
  }

  const localPath = resolve(PRIVATE_ROOT, objectName);
  if (!localPath.startsWith(`${PRIVATE_ROOT}${sep}`)) return;
  await fs.unlink(localPath).catch(() => {});
}

export function getPrivateResumeRoot(): string {
  return join(PRIVATE_ROOT, "resumes");
}
