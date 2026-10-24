/**
 * 孤儿简历清理。
 *
 * 用途：数据库已删除申请，但本地 private/ 或私有 OSS 上仍残留的简历文件
 * （例如删除时 OSS 短暂不可用、进程被回收、迁移中断）。
 *
 * 用法：
 *   npx tsx scripts/cleanup-orphan-resumes.ts            # dry-run，只报告
 *   npx tsx scripts/cleanup-orphan-resumes.ts --apply    # 实际删除
 *
 * 注意：
 * - 请在低峰期执行，避免与“刚上传、尚未写库”的请求竞争；
 * - 只处理以 UUID.pdf 命名的私有简历，不触碰其他对象；
 * - OSS 未配置时只清理本地 private/resumes。
 */
import "./load-env";
import { promises as fs } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import {
  deletePrivateOSSObject,
  isPrivateBucketConfigured,
  listPrivateOSSObjectNames,
} from "@/lib/ali-oss";
import { getPrivateResumeRoot, getResumeObjectName } from "@/lib/resume-files";

const APPLY = process.argv.includes("--apply");
const OBJECT_PREFIX = "resumes/";
const UUID_PDF = /^[0-9a-f-]{36}\.pdf$/i;

async function main() {
  const applications = await prisma.jobApplication.findMany({
    select: { id: true, resumePath: true },
  });

  const referenced = new Set<string>();
  for (const application of applications) {
    const objectName = getResumeObjectName(application.resumePath);
    if (objectName) referenced.add(objectName);
  }

  let orphans = 0;
  let deleted = 0;
  let failed = 0;

  // 本地 private/resumes
  const localRoot = getPrivateResumeRoot();
  let localFiles: string[] = [];
  try {
    localFiles = await fs.readdir(localRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  for (const file of localFiles) {
    if (!UUID_PDF.test(file)) continue;
    const objectName = `${OBJECT_PREFIX}${file}`;
    if (referenced.has(objectName)) continue;
    orphans += 1;
    console.log(`[resume-orphan] 本地孤儿: ${objectName}`);
    if (!APPLY) continue;
    try {
      await fs.unlink(join(localRoot, file));
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`[resume-orphan] 删除本地失败: ${objectName}`, error);
    }
  }

  // 私有 OSS
  if (isPrivateBucketConfigured()) {
    const objects = await listPrivateOSSObjectNames(OBJECT_PREFIX);
    for (const objectName of objects) {
      const file = objectName.slice(OBJECT_PREFIX.length);
      if (!UUID_PDF.test(file)) continue;
      if (referenced.has(objectName)) continue;
      orphans += 1;
      console.log(`[resume-orphan] OSS 孤儿: ${objectName}`);
      if (!APPLY) continue;
      try {
        await deletePrivateOSSObject(objectName);
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error(`[resume-orphan] 删除 OSS 失败: ${objectName}`, error);
      }
    }
  }

  console.log(
    `[resume-orphan] ${APPLY ? "完成" : "dry-run"}：发现 ${orphans}，删除 ${deleted}，失败 ${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[resume-orphan] 任务异常:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
