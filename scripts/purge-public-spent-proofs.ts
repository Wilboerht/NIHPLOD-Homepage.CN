/**
 * 清理消费补录的公开凭证（历史 /uploads/spent-adjustments/...）。
 *
 * 用法：
 *   npx tsx scripts/purge-public-spent-proofs.ts            # dry-run
 *   npx tsx scripts/purge-public-spent-proofs.ts --apply    # 删除文件并清理 DB 引用
 *
 * 安全边界：
 * - 只处理 /uploads/spent-adjustments/ 前缀；
 * - 文件路径必须落在 public/uploads/spent-adjustments 内；
 * - 删除文件成功（或文件本就不存在）后才从 images 数组移除；
 * - 不删除其他 /uploads/ 文件，也不删除申请记录本身。
 */
import "./load-env";
import { promises as fs } from "fs";
import { resolve, sep } from "path";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const APPLY = process.argv.includes("--apply");
const PUBLIC_ROOT = resolve(process.cwd(), "public");
const PROOF_ROOT = resolve(PUBLIC_ROOT, "uploads", "spent-adjustments");
const PUBLIC_PREFIX = "/uploads/spent-adjustments/";

function resolvePublicProofPath(url: string): string | null {
  if (!url.startsWith(PUBLIC_PREFIX)) return null;
  const localPath = resolve(PUBLIC_ROOT, url.replace(/^\/+/, ""));
  if (!localPath.startsWith(`${PROOF_ROOT}${sep}`)) return null;
  return localPath;
}

async function main() {
  const applications = await prisma.spentAdjustmentApplication.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, userId: true, status: true, images: true },
  });

  let touchedApplications = 0;
  let removedImages = 0;
  let missingFiles = 0;
  let failed = 0;

  for (const application of applications) {
    const publicImages = application.images.filter((image) => image.startsWith(PUBLIC_PREFIX));
    if (publicImages.length === 0) continue;

    const remaining = [...application.images];
    let appChanged = false;
    let appRemoved = 0;

    for (const image of publicImages) {
      const localPath = resolvePublicProofPath(image);
      if (!localPath) {
        apiConsole.warn(`[spent-proof-purge] 非法路径，跳过: ${application.id} ${image}`);
        failed += 1;
        continue;
      }

      let exists = true;
      try {
        await fs.access(localPath);
      } catch {
        exists = false;
        missingFiles += 1;
      }

      if (!APPLY) {
        console.log(
          `[dry-run] ${exists ? "将删除" : "文件已缺失，将清理引用"}: ${application.id} (${application.status}) ${image}`
        );
        removedImages += 1;
        appChanged = true;
        continue;
      }

      if (exists) {
        try {
          const stat = await fs.stat(localPath);
          await fs.unlink(localPath);
          console.log(
            `[spent-proof-purge] 已删除: ${application.id} ${image} (${stat.size} bytes)`
          );
        } catch (error) {
          apiConsole.error(
            `[spent-proof-purge] 删除失败，保留 DB 引用: ${application.id} ${image}`,
            error
          );
          failed += 1;
          continue;
        }
      } else {
        console.log(`[spent-proof-purge] 文件已缺失，清理 DB 引用: ${application.id} ${image}`);
      }

      const index = remaining.indexOf(image);
      if (index >= 0) remaining.splice(index, 1);
      removedImages += 1;
      appRemoved += 1;
      appChanged = true;
    }

    if (!APPLY || !appChanged) continue;

    try {
      await prisma.spentAdjustmentApplication.update({
        where: { id: application.id },
        data: { images: remaining },
      });
      touchedApplications += 1;

      await createAuditLog({
        action: "spent_proof_public_purge",
        targetType: "spent_adjustment",
        targetId: application.id,
        actorType: "SYSTEM",
        source: "SYSTEM",
        reason: "清理公开消费凭证",
        detail: {
          userId: application.userId,
          status: application.status,
          removed: appRemoved,
          failed: publicImages.length - appRemoved,
          remaining: remaining.length,
        },
      });
    } catch (error) {
      apiConsole.error(`[spent-proof-purge] 更新申请失败: ${application.id}`, error);
      failed += 1;
    }
  }

  if (APPLY) {
    // 仅在目录为空时移除，避免误删其他未登记文件
    try {
      const entries = await fs.readdir(PROOF_ROOT);
      if (entries.length === 0) await fs.rmdir(PROOF_ROOT);
    } catch {
      // 目录不存在或非空，忽略
    }
  }

  console.log(
    `[spent-proof-purge] ${APPLY ? "完成" : "dry-run"}：` +
      `申请 ${touchedApplications}，凭证引用 ${removedImages}，缺失文件 ${missingFiles}，失败 ${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[spent-proof-purge] 任务异常:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
