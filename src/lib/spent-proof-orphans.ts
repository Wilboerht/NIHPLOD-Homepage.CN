/**
 * 清理未被任何消费补录申请引用的本地私有凭证文件。
 *
 * 场景：
 * - 用户/客服上传凭证后未提交，或提交被待审上限/重复订单拦截；
 * - 文件只存在于 private/spent-adjustments/<userId>/<uuid>.webp，不会自动回收。
 *
 * 安全边界：
 * - 只扫描 `<privateRoot>/spent-adjustments/<userId>/<uuid>.webp` 这一种结构；
 * - 只删除「未被任何申请 images 引用」且 mtime 超过阈值的文件；
 * - 私有 OSS key 不在此处处理（由 OSS 生命周期策略负责）。
 */
import { promises as fs } from "fs";
import { resolve, sep } from "path";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

const OBJECT_PREFIX = "spent-adjustments";
const LOCAL_KEY_PREFIX = "private-local:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_DIR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const DEFAULT_ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function defaultSpentProofRoot(): string {
  return resolve(process.cwd(), "private", OBJECT_PREFIX);
}

export interface OrphanSpentProofScan {
  candidates: string[];
  scanned: number;
  referenced: number;
}

/**
 * 只读扫描，返回可清理的对象名（相对 private/spent-adjustments 的路径）。
 */
export async function findOrphanSpentProofs(params: {
  rootDir?: string;
  /** 申请表中出现的完整 image key（private-local:spent-adjustments/...） */
  referencedKeys: Iterable<string>;
  olderThanMs: number;
  now?: number;
}): Promise<OrphanSpentProofScan> {
  const rootDir = params.rootDir ?? defaultSpentProofRoot();
  const now = params.now ?? Date.now();

  const referenced = new Set<string>();
  for (const key of params.referencedKeys) {
    if (!key.startsWith(LOCAL_KEY_PREFIX)) continue;
    const objectName = key.slice(LOCAL_KEY_PREFIX.length);
    if (!objectName.startsWith(`${OBJECT_PREFIX}/`)) continue;
    referenced.add(objectName);
  }

  let userDirs;
  try {
    userDirs = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { candidates: [], scanned: 0, referenced: referenced.size };
    }
    throw error;
  }

  const candidates: string[] = [];
  let scanned = 0;

  for (const userDir of userDirs) {
    if (!userDir.isDirectory() || !USER_DIR_PATTERN.test(userDir.name)) continue;
    const userDirPath = resolve(rootDir, userDir.name);
    if (!userDirPath.startsWith(`${rootDir}${sep}`)) continue;

    let files;
    try {
      files = await fs.readdir(userDirPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".webp")) continue;
      const uuid = file.name.slice(0, -".webp".length);
      if (!UUID_PATTERN.test(uuid)) continue;

      scanned += 1;
      const objectName = `${OBJECT_PREFIX}/${userDir.name}/${file.name}`;
      if (referenced.has(objectName)) continue;

      const filePath = resolve(userDirPath, file.name);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (now - stat.mtimeMs < params.olderThanMs) continue;
      candidates.push(objectName);
    }
  }

  return { candidates, scanned, referenced: referenced.size };
}

export interface OrphanSpentProofPurgeResult {
  apply: boolean;
  rootDir: string;
  scanned: number;
  referenced: number;
  candidates: number;
  deleted: number;
  errors: number;
}

/**
 * 执行清理。apply=false 时仅返回统计（dry-run）。
 * 单文件删除失败只计数并记录日志，不中断其余文件。
 */
export async function purgeOrphanSpentProofs(options?: {
  apply?: boolean;
  olderThanMs?: number;
  rootDir?: string;
  now?: number;
}): Promise<OrphanSpentProofPurgeResult> {
  const apply = options?.apply ?? false;
  const olderThanMs = options?.olderThanMs ?? DEFAULT_ORPHAN_TTL_MS;
  const rootDir = options?.rootDir ?? defaultSpentProofRoot();

  const applications = await prisma.spentAdjustmentApplication.findMany({
    select: { images: true },
  });
  const referencedKeys = applications.flatMap((application) => application.images);

  const scan = await findOrphanSpentProofs({
    rootDir,
    referencedKeys,
    olderThanMs,
    now: options?.now,
  });

  let deleted = 0;
  let errors = 0;
  if (apply) {
    for (const objectName of scan.candidates) {
      const filePath = resolve(rootDir, objectName.slice(OBJECT_PREFIX.length + 1));
      if (!filePath.startsWith(`${rootDir}${sep}`)) {
        errors += 1;
        continue;
      }
      try {
        await fs.unlink(filePath);
        deleted += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          deleted += 1;
          continue;
        }
        errors += 1;
        apiConsole.warn("[SpentProofOrphans] 删除失败:", { objectName, error });
      }
    }
  }

  if (apply && (deleted > 0 || errors > 0)) {
    await createAuditLog({
      action: "spent_proof_orphan_purge",
      targetType: "system",
      actorType: "SYSTEM",
      source: "SYSTEM",
      detail: {
        rootDir,
        scanned: scan.scanned,
        referenced: scan.referenced,
        candidates: scan.candidates.length,
        deleted,
        errors,
        olderThanMs,
      },
    });
  }

  return {
    apply,
    rootDir,
    scanned: scan.scanned,
    referenced: scan.referenced,
    candidates: scan.candidates.length,
    deleted,
    errors,
  };
}
