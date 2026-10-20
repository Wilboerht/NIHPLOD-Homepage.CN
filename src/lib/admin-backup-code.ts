import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyBackupCode } from "@/lib/totp";

type AdminBackupCodeDb = Pick<Prisma.TransactionClient, "admin">;

export type ConsumeAdminBackupCodeResult =
  { ok: true; remainingCodes: string[] } | { ok: false; reason: "invalid" | "conflict" };

/**
 * 原子消费管理员备用码：
 * - 先按原始 JSON 校验码是否命中；
 * - 再用 CAS（where totpBackupCodes = 原始 JSON）写回剩余码；
 * - 只有 count=1 才视为消费成功，避免并发重放。
 */
export async function consumeAdminBackupCode(
  adminId: string,
  code: string,
  storedCodes: string | null,
  db: AdminBackupCodeDb = prisma
): Promise<ConsumeAdminBackupCodeResult> {
  if (!storedCodes) return { ok: false, reason: "invalid" };

  const backupResult = verifyBackupCode(code, storedCodes);
  if (!backupResult) return { ok: false, reason: "invalid" };

  const updated = await db.admin.updateMany({
    where: { id: adminId, totpBackupCodes: storedCodes },
    data: { totpBackupCodes: JSON.stringify(backupResult.remainingCodes) },
  });

  if (updated.count !== 1) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true, remainingCodes: backupResult.remainingCodes };
}
