/**
 * 离职管理员账号保留与匿名化。
 *
 * - 软删除后保留 ADMIN_RETENTION_DAYS（默认 365 天），期间 owner 可排查/审计
 * - 到期后匿名化姓名、密码、TOTP、权限等 PII/凭证；保留 Admin 行与 adminId，
 *   因为 AuditLog.adminId 是 Restrict 外键，且历史审计需要可追溯
 * - 邮箱在软删除时已替换为 tombstone，匿名化只归档遗留的真实邮箱（历史数据）
 */
import prisma from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { adminTombstoneEmail, getAdminRetentionDays, isAdminTombstoneEmail } from "@/lib/admin-email";

export interface AnonymizeResult {
  scanned: number;
  anonymized: number;
}

export async function anonymizeDeletedAdmins(limit = 50): Promise<AnonymizeResult> {
  const retentionDays = getAdminRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.admin.findMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
      anonymizedAt: null,
    },
    select: { id: true, email: true, name: true, deletedAt: true },
    orderBy: { deletedAt: "asc" },
    take: limit,
  });

  let anonymized = 0;
  for (const candidate of candidates) {
    const now = new Date();
    try {
      const done = await prisma.$transaction(async (tx) => {
        // CAS：并发 worker 只有一个能把 anonymizedAt 从 null 写掉
        const updated = await tx.admin.updateMany({
          where: {
            id: candidate.id,
            anonymizedAt: null,
            deletedAt: { not: null, lte: cutoff },
          },
          data: {
            name: "已删除管理员",
            email: adminTombstoneEmail(candidate.id),
            // 不可用于登录的占位值；实际登录已被 deletedAt/status 拦截
            password: "!",
            totpSecret: null,
            totpEnabled: false,
            totpEnabledAt: null,
            totpResetRequired: false,
            totpBackupCodes: null,
            permissions: [],
            status: "DISABLED",
            anonymizedAt: now,
          },
        });
        if (updated.count === 0) return false;

        // 兼容本次改造前已软删除、仍保留真实邮箱的历史数据
        if (!isAdminTombstoneEmail(candidate.email)) {
          await tx.adminEmailHistory.create({
            data: {
              adminId: candidate.id,
              email: candidate.email,
              changedBy: "system",
              reason: "anonymized",
            },
          });
        }
        return true;
      });

      if (!done) continue;
      anonymized += 1;

      await createAuditLog({
        action: "admin_anonymized",
        targetType: "admin",
        targetId: candidate.id,
        targetLabel: candidate.name,
        detail: {
          retentionDays,
          deletedAt: candidate.deletedAt?.toISOString() ?? null,
          anonymizedAt: now.toISOString(),
        },
        actorType: "SYSTEM",
        authMethod: "system",
      });
    } catch (error) {
      apiConsole.error(`[AdminRetention] 匿名化管理员 ${candidate.id} 失败:`, error);
    }
  }

  return { scanned: candidates.length, anonymized };
}
