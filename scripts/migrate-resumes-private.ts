/**
 * 存量简历迁移到私有存储。
 *
 * 用法：
 *   npx tsx scripts/migrate-resumes-private.ts            # dry-run
 *   npx tsx scripts/migrate-resumes-private.ts --apply    # 实际迁移
 *
 * 支持：
 * - /uploads/resumes/<file>.pdf 本地公开文件 → private/resumes/<uuid>.pdf
 * - https://<public-domain>/resumes/... 公开 OSS URL → 私有 OSS bucket
 *
 * 迁移成功后更新 JobApplication.resumePath 并删除旧公开对象。
 * 无法识别的 URL 会列出，需人工处理。
 */
import { promises as fs } from "fs";
import { resolve, sep } from "path";
import { prisma } from "@/lib/prisma";
import { isPrivateResumeKey, uploadResumeFile } from "@/lib/resume-files";
import { deleteUploadedFile } from "@/lib/upload";

const APPLY = process.argv.includes("--apply");
const PUBLIC_ROOT = resolve(process.cwd(), "public");

function resolveLocalPublicPath(url: string): string | null {
  if (!url.startsWith("/uploads/resumes/")) return null;
  const path = resolve(PUBLIC_ROOT, url.replace(/^\//, ""));
  return path.startsWith(`${PUBLIC_ROOT}${sep}`) ? path : null;
}

async function readLegacyResume(url: string): Promise<Buffer | null> {
  const localPath = resolveLocalPublicPath(url);
  if (localPath) {
    try {
      return await fs.readFile(localPath);
    } catch {
      return null;
    }
  }

  if (!url.startsWith("https://")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  const applications = await prisma.jobApplication.findMany({
    select: { id: true, resumePath: true },
  });

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const application of applications) {
    const legacyPath = application.resumePath;
    if (!legacyPath || isPrivateResumeKey(legacyPath)) {
      skipped += 1;
      continue;
    }

    const buffer = await readLegacyResume(legacyPath);
    if (!buffer) {
      console.warn(`[resume-migrate] 无法读取，需人工处理: ${application.id} ${legacyPath}`);
      failed += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`[dry-run] 将迁移: ${application.id} ${legacyPath}`);
      migrated += 1;
      continue;
    }

    try {
      const { key } = await uploadResumeFile(buffer);
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: { resumePath: key },
      });
      await deleteUploadedFile(legacyPath).catch(() => {});
      console.log(`[resume-migrate] 已迁移: ${application.id} -> ${key}`);
      migrated += 1;
    } catch (error) {
      console.error(`[resume-migrate] 迁移失败: ${application.id}`, error);
      failed += 1;
    }
  }

  console.log(
    `[resume-migrate] ${APPLY ? "完成" : "dry-run"}：迁移 ${migrated}，跳过 ${skipped}，失败 ${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[resume-migrate] 任务异常:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
