/**
 * 审计日志完整性锚点。
 *
 * 每日按 UTC+8 计算前一日审计记录的规范化摘要并 HMAC 签名，写入
 * AuditLogAnchor。正式环境还应把签名摘要/归档写入私有无锁 OSS（Object Lock）；
 * 未配置归档存储时，清理任务保持 fail-closed，不物理删除审计记录。
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface AuditDayRange {
  day: string;
  fromAt: Date;
  toAt: Date;
}

/** 以 UTC+8 自然日计算 [00:00, 次日 00:00) */
export function getUtc8DayRange(date = new Date()): AuditDayRange {
  const shifted = new Date(date.getTime() + UTC8_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const dayOfMonth = shifted.getUTCDate();
  const fromAt = new Date(Date.UTC(year, month, dayOfMonth) - UTC8_OFFSET_MS);
  return {
    day: `${year}-${String(month + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`,
    fromAt,
    toAt: new Date(fromAt.getTime() + DAY_MS),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function getIntegrityKey(): string {
  const key = process.env.AUDIT_INTEGRITY_HMAC_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      "[AuditIntegrity] 缺少 AUDIT_INTEGRITY_HMAC_KEY（至少 32 字符），无法生成审计摘要"
    );
  }
  return key;
}

function computeDigest(
  logs: Array<Record<string, unknown>>
): { digest: string; signature: string; count: number; payload: string } {
  const payload = logs
    .map((log) =>
      stableStringify({
        id: log.id,
        createdAt: log.createdAt,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        targetLabel: log.targetLabel,
        outcome: log.outcome,
        requestId: log.requestId,
        actorType: log.actorType,
        actorEmail: log.actorEmail,
        actorName: log.actorName,
        actorRole: log.actorRole,
        authMethod: log.authMethod,
        sessionJti: log.sessionJti,
        adminId: log.adminId,
        userId: log.userId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        detail: log.detail,
      })
    )
    .join("\n");
  const digest = createHash("sha256").update(payload).digest("hex");
  const signature = createHmac("sha256", getIntegrityKey())
    .update(`${digest}:${logs.length}`)
    .digest("hex");
  return { digest, signature, count: logs.length, payload };
}

export async function anchorAuditLogsForDay(
  dayRange: AuditDayRange = getUtc8DayRange(new Date(Date.now() - DAY_MS))
): Promise<{ day: string; count: number; digest: string; signature: string }> {
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: dayRange.fromAt, lt: dayRange.toAt } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      action: true,
      targetType: true,
      targetId: true,
      targetLabel: true,
      outcome: true,
      requestId: true,
      actorType: true,
      actorEmail: true,
      actorName: true,
      actorRole: true,
      authMethod: true,
      sessionJti: true,
      adminId: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      detail: true,
    },
  });

  const computed = computeDigest(logs as unknown as Array<Record<string, unknown>>);
  const existing = await prisma.auditLogAnchor.findUnique({
    where: { day: dayRange.day },
  });

  if (existing) {
    if (existing.digest !== computed.digest || existing.count !== computed.count) {
      throw new Error(`[AuditIntegrity] 审计摘要不一致，可能存在篡改: ${dayRange.day}`);
    }
    return {
      day: existing.day,
      count: existing.count,
      digest: existing.digest,
      signature: existing.signature,
    };
  }

  const anchor = await prisma.auditLogAnchor.create({
    data: {
      day: dayRange.day,
      fromAt: dayRange.fromAt,
      toAt: dayRange.toAt,
      count: computed.count,
      digest: computed.digest,
      signature: computed.signature,
    },
  });
  apiConsole.info(
    `[AuditIntegrity] 审计摘要已生成: ${anchor.day} (${anchor.count} 条, ${anchor.digest.slice(0, 12)}…)`
  );
  return {
    day: anchor.day,
    count: anchor.count,
    digest: anchor.digest,
    signature: anchor.signature,
  };
}

export async function verifyAuditLogAnchor(day: string): Promise<boolean> {
  const anchor = await prisma.auditLogAnchor.findUnique({ where: { day } });
  if (!anchor) return false;

  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: anchor.fromAt, lt: anchor.toAt } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      action: true,
      targetType: true,
      targetId: true,
      targetLabel: true,
      outcome: true,
      requestId: true,
      actorType: true,
      actorEmail: true,
      actorName: true,
      actorRole: true,
      authMethod: true,
      sessionJti: true,
      adminId: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      detail: true,
    },
  });

  const computed = computeDigest(logs as unknown as Array<Record<string, unknown>>);
  if (computed.count !== anchor.count || computed.digest !== anchor.digest) {
    return false;
  }

  const expected = Buffer.from(anchor.signature, "hex");
  const actual = Buffer.from(computed.signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 归档存储是否就绪；未就绪时清理任务不得删除审计记录。 */
export function isAuditArchiveReady(): boolean {
  return (
    process.env.AUDIT_ARCHIVE_READY === "true" &&
    Boolean(process.env.AUDIT_ARCHIVE_BUCKET || process.env.ALI_OSS_PRIVATE_BUCKET)
  );
}
