/**
 * 存量简历迁移脚本。
 *
 * 用法：
 *   npx tsx scripts/migrate-resumes-private.ts            # dry-run
 *   npx tsx scripts/migrate-resumes-private.ts --apply    # 实际迁移
 *
 * 支持两类迁移：
 * 1. 公开存储 → 私有存储
 *    - /uploads/resumes/<file>.pdf 本地公开文件 → private-local 或 private-oss
 *    - https://<public-domain>/resumes/... 公开 OSS URL → private-oss
 * 2. 本地私有 → 私有 OSS（配置 ALI_OSS_PRIVATE_BUCKET 后）
 *    - private-local:resumes/<uuid>.pdf / 历史 private:resumes/<uuid>.pdf
 *
 * 迁移成功后更新 JobApplication.resumePath，并删除旧公开/本地文件。
 * 无法识别的 URL 会列出，需人工处理。
 */
import "./load-env";
import { promises as fs } from "fs";
import { resolve, sep } from "path";
import { prisma } from "@/lib/prisma";
import { isPrivateBucketConfigured } from "@/lib/ali-oss";
import {
  deleteResumeFile,
  isPrivateResumeKey,
  resolveResumeDownload,
  uploadResumeFile,
} from "@/lib/resume-files";
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
    select: { id: true, resumePath: true, resumeFileName: true },
  });

  let migratedPublic = 0;
  let migratedLocal = 0;
  let skipped = 0;
  let failed = 0;

  for (const application of applications) {
    const currentPath = application.resumePath;
    if (!currentPath) {
      skipped += 1;
      continue;
    }

    // 已经是私有 key：只在配置了私有 OSS 时尝试把本地副本迁移到 OSS
    if (isPrivateResumeKey(currentPath)) {
      if (!isPrivateBucketConfigured()) {
        skipped += 1;
        continue;
      }

      const local = await resolveResumeDownload(currentPath, application.resumeFileName ?? "resume.pdf");
      if (!local || local.kind !== "file") {
        // 已经位于 OSS，或本地文件不存在
        skipped += 1;
        continue;
      }

      if (!APPLY) {
        console.log(`[dry-run] 将迁移本地私有简历到 OSS: ${application.id} ${currentPath}`);
        migratedLocal += 1;
        continue;
      }

      try {
        const buffer = await fs.readFile(local.path);
        const { key } = await uploadResumeFile(buffer);
        await prisma.jobApplication.update({
          where: { id: application.id },
          data: { resumePath: key },
        });
        try {
          await deleteResumeFile(currentPath);
        } catch (cleanupError) {
          console.warn(
            `[resume-migrate] 已迁移但旧本地文件删除失败，需人工清理: ${application.id}`,
            cleanupError
          );
        }
        console.log(`[resume-migrate] 已迁移本地私有简历: ${application.id} -> ${key}`);
        migratedLocal += 1;
      } catch (error) {
        console.error(`[resume-migrate] 本地私有迁移失败: ${application.id}`, error);
        failed += 1;
      }
      continue;
    }

    // 公开存储 → 私有存储
    const buffer = await readLegacyResume(currentPath);
    if (!buffer) {
      console.warn(`[resume-migrate] 无法读取，需人工处理: ${application.id} ${currentPath}`);
      failed += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`[dry-run] 将迁移公开简历: ${application.id} ${currentPath}`);
      migratedPublic += 1;
      continue;
    }

    try {
      const { key } = await uploadResumeFile(buffer);
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: { resumePath: key },
      });
      const deleted = await deleteUploadedFile(currentPath).catch(() => false);
      if (!deleted) {
        console.warn(
          `[resume-migrate] 已迁移但旧公开文件删除失败，需人工清理/CDN 刷新: ${application.id}`
        );
      }
      console.log(`[resume-migrate] 已迁移公开简历: ${application.id} -> ${key}`);
      migratedPublic += 1;
    } catch (error) {
      console.error(`[resume-migrate] 公开简历迁移失败: ${application.id}`, error);
      failed += 1;
    }
  }

  console.log(
    `[resume-migrate] ${APPLY ? "完成" : "dry-run"}：` +
      `公开→私有 ${migratedPublic}，本地私有→OSS ${migratedLocal}，跳过 ${skipped}，失败 ${failed}`
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
