/**
 * 管理员邮箱生命周期辅助。
 *
 * 软删除时把原邮箱归档到 AdminEmailHistory，并把 Admin.email 换成不可投递的
 * tombstone 地址，从而释放原邮箱给后续管理员复用；审计仍通过 adminId 归因。
 */

const TOMBSTONE_DOMAIN = "deleted.invalid";

export function adminTombstoneEmail(adminId: string): string {
  return `deleted+${adminId}@${TOMBSTONE_DOMAIN}`;
}

export function isAdminTombstoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${TOMBSTONE_DOMAIN}`);
}

/** 离职管理员匿名化保留天数（默认 365，范围 90-3650） */
export function getAdminRetentionDays(): number {
  const raw = Number(process.env.ADMIN_RETENTION_DAYS ?? 365);
  if (!Number.isFinite(raw)) return 365;
  return Math.min(Math.max(Math.trunc(raw), 90), 3650);
}

/** 邮箱复用冷却天数（默认 90，范围 0-3650；0 表示允许立即复用） */
export function getAdminEmailReuseCooldownDays(): number {
  const raw = Number(process.env.ADMIN_EMAIL_REUSE_COOLDOWN_DAYS ?? 90);
  if (!Number.isFinite(raw)) return 90;
  return Math.min(Math.max(Math.trunc(raw), 0), 3650);
}

export function adminEmailReuseCutoff(now = new Date()): Date {
  return new Date(now.getTime() - getAdminEmailReuseCooldownDays() * 24 * 60 * 60 * 1000);
}
