/**
 * 审计保留期预览与删除审批。
 *
 * 默认不自动删除。后台 owner 发起任务后，独立 worker 使用
 * audit_retention 角色执行；执行前必须重新校验 previewHash。
 */
import { createHash, createHmac } from "crypto";
import { prisma } from "./prisma";
import { getArchiveStatus } from "./audit-archive";
import { getAuditIntegrityKey } from "./audit-chain";
import { getAuditLogRetentionDays } from "./audit";
import { getSsoAuditRetentionDays } from "./sso-audit";
import { stableStringify } from "./audit-chain";
import type { AuditRetentionJob } from "@/generated/prisma/client";

export type RetentionStream = "audit" | "sso";

export interface RetentionStreamCutoff {
  stream: RetentionStream;
  cutoff: string;
}

export interface RetentionBucket {
  stream: RetentionStream;
  day: string;
  count: number;
  bytes: number;
  holdsExcluded: number;
  eligible: number;
  archiveVerified: boolean;
  backupVerified: boolean;
}

export interface RetentionPreview {
  cutoffs: RetentionStreamCutoff[];
  buckets: RetentionBucket[];
  expectedCount: number;
  expectedBytes: number;
  holdsExcluded: number;
  previewHash: string;
  ready: boolean;
  warnings: string[];
}

export interface RetentionJobInput {
  requestedBy: string;
  requestedByEmail?: string | null;
  requestedByRole: string;
  reason: string;
  cutoffs: RetentionStreamCutoff[];
  preview: RetentionPreview;
  localOnlyAck: boolean;
  totpVerifiedAt: Date;
}

export function getAuditRetentionDays(): number {
  return getAuditLogRetentionDays();
}

export function getSsoRetentionDays(): number {
  return getSsoAuditRetentionDays();
}

export function defaultRetentionCutoffs(now = new Date()): RetentionStreamCutoff[] {
  // 以 UTC+8 当天 00:00 为基准，保证同一天内 previewHash 稳定；
  // 否则每次请求相差几秒都会导致创建任务时 previewHash 不匹配。
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const base = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      8 * 60 * 60 * 1000
  );
  const DAY_MS = 24 * 60 * 60 * 1000;
  return [
    {
      stream: "audit",
      cutoff: new Date(base.getTime() - getAuditRetentionDays() * DAY_MS).toISOString(),
    },
    {
      stream: "sso",
      cutoff: new Date(base.getTime() - getSsoRetentionDays() * DAY_MS).toISOString(),
    },
  ];
}

function dayBucketsFromRows(
  stream: RetentionStream,
  rows: Array<{ createdAt: Date; size?: number }>
): Array<{ day: string; count: number; bytes: number }> {
  const map = new Map<string, { day: string; count: number; bytes: number }>();
  for (const row of rows) {
    const shifted = new Date(row.createdAt.getTime() + 8 * 60 * 60 * 1000);
    const day = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
    const item = map.get(day) ?? { day, count: 0, bytes: 0 };
    item.count += 1;
    item.bytes += row.size ?? 512;
    map.set(day, item);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

async function loadEligibleRows(
  stream: RetentionStream,
  cutoff: Date
): Promise<Array<{ createdAt: Date; size?: number }>> {
  if (stream === "audit") {
    return prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { createdAt: true },
    });
  }
  return prisma.ssoAuditEvent.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { createdAt: true },
  });
}

function toDayMap(rows: Array<{ createdAt: Date }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of dayBucketsFromRows("audit", rows)) {
    map.set(row.day, row.count);
  }
  return map;
}

async function heldAuditRowsByDay(cutoff: Date): Promise<Map<string, number>> {
  const holds = await prisma.auditLegalHold.findMany({
    where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (holds.length === 0) return new Map();
  const conditions = holds.map((hold) => ({
    OR: [
      ...(hold.targetType && hold.targetId
        ? [{ targetType: hold.targetType, targetId: hold.targetId }]
        : []),
      ...(hold.userId ? [{ userId: hold.userId }] : []),
      ...(hold.adminId ? [{ adminId: hold.adminId }] : []),
    ],
  }));
  if (conditions.every((c) => c.OR.length === 0)) return new Map();
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { lt: cutoff }, OR: conditions },
    select: { createdAt: true },
  });
  return toDayMap(rows);
}

async function heldSsoRowsByDay(cutoff: Date): Promise<Map<string, number>> {
  const holds = await prisma.auditLegalHold.findMany({
    where: {
      active: true,
      userId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { userId: true },
  });
  const userIds = [...new Set(holds.map((h) => h.userId).filter((id): id is string => !!id))];
  if (userIds.length === 0) return new Map();
  const rows = await prisma.ssoAuditEvent.findMany({
    where: { createdAt: { lt: cutoff }, userId: { in: userIds } },
    select: { createdAt: true },
  });
  return toDayMap(rows);
}

export async function buildRetentionPreview(options?: {
  cutoffs?: RetentionStreamCutoff[];
}): Promise<RetentionPreview> {
  const cutoffs = options?.cutoffs ?? defaultRetentionCutoffs();
  const warnings: string[] = [];
  const buckets: RetentionBucket[] = [];

  for (const entry of cutoffs) {
    const cutoff = new Date(entry.cutoff);
    if (Number.isNaN(cutoff.getTime())) throw new Error("INVALID_CUTOFF");
    const rows = await loadEligibleRows(entry.stream, cutoff);
    const days = dayBucketsFromRows(entry.stream, rows);
    const heldByDay =
      entry.stream === "audit" ? await heldAuditRowsByDay(cutoff) : await heldSsoRowsByDay(cutoff);

    for (const item of days) {
      const status = await getArchiveStatus(entry.stream, item.day);
      const dayHeld = Math.min(item.count, heldByDay.get(item.day) ?? 0);
      buckets.push({
        stream: entry.stream,
        day: item.day,
        count: item.count,
        bytes: item.bytes,
        holdsExcluded: dayHeld,
        eligible: item.count - dayHeld,
        archiveVerified: status.verified,
        backupVerified: status.backupVerified,
      });
      if (!status.archived) warnings.push(`${entry.stream}/${item.day} 尚未归档`);
      else if (!status.verified) warnings.push(`${entry.stream}/${item.day} 归档校验失败`);
      else if (!status.backupVerified)
        warnings.push(`${entry.stream}/${item.day} 备份副本校验失败`);
    }
  }

  if (process.env.AUDIT_RETENTION_ALLOW_LOCAL_ONLY !== "true") {
    warnings.push("未设置 AUDIT_RETENTION_ALLOW_LOCAL_ONLY=true；worker 将拒绝执行");
  }

  const expectedCount = buckets.reduce((sum, item) => sum + item.eligible, 0);
  const expectedBytes = buckets.reduce((sum, item) => sum + item.bytes, 0);
  const holdsExcluded = buckets.reduce((sum, item) => sum + item.holdsExcluded, 0);
  const previewHash = createHash("sha256")
    .update(
      stableStringify({
        cutoffs,
        buckets: buckets.map((item) => ({
          stream: item.stream,
          day: item.day,
          eligible: item.eligible,
          count: item.count,
        })),
      })
    )
    .digest("hex");

  return {
    cutoffs,
    buckets,
    expectedCount,
    expectedBytes,
    holdsExcluded,
    previewHash,
    ready:
      expectedCount > 0 &&
      warnings.length === 0 &&
      buckets.every((b) => b.archiveVerified && b.backupVerified),
    warnings,
  };
}

function approvalKey(): string {
  const key = process.env.AUDIT_RETENTION_APPROVAL_KEY;
  if (key && key.length >= 32) return key;
  return getAuditIntegrityKey(1);
}

export function buildRetentionApprovalSignature(input: {
  id: string;
  requestedBy: string;
  requestedByRole: string;
  reason: string;
  cutoffs: RetentionStreamCutoff[];
  previewHash: string;
  expectedCount: number;
  expectedBytes: number;
  localOnlyAck: boolean;
  totpVerifiedAt: Date;
}): string {
  return createHmac("sha256", approvalKey())
    .update(
      stableStringify({
        id: input.id,
        requestedBy: input.requestedBy,
        requestedByRole: input.requestedByRole,
        reason: input.reason,
        cutoffs: input.cutoffs,
        previewHash: input.previewHash,
        expectedCount: input.expectedCount,
        expectedBytes: input.expectedBytes,
        localOnlyAck: input.localOnlyAck,
        totpVerifiedAt: input.totpVerifiedAt.toISOString(),
      })
    )
    .digest("hex");
}

export function verifyRetentionApproval(
  job: Pick<
    AuditRetentionJob,
    | "id"
    | "requestedBy"
    | "requestedByRole"
    | "reason"
    | "streams"
    | "previewHash"
    | "expectedCount"
    | "expectedBytes"
    | "localOnlyAck"
    | "totpVerifiedAt"
    | "approvalSignature"
  >
): boolean {
  const cutoffs = job.streams as unknown as RetentionStreamCutoff[];
  const expected = buildRetentionApprovalSignature({
    id: job.id,
    requestedBy: job.requestedBy,
    requestedByRole: job.requestedByRole,
    reason: job.reason,
    cutoffs,
    previewHash: job.previewHash,
    expectedCount: job.expectedCount,
    expectedBytes: job.expectedBytes,
    localOnlyAck: job.localOnlyAck,
    totpVerifiedAt: job.totpVerifiedAt,
  });
  return expected === job.approvalSignature;
}

export function parseRetentionCutoffs(streams: unknown): RetentionStreamCutoff[] {
  if (!Array.isArray(streams)) throw new Error("INVALID_STREAMS");
  return streams.map((item) => {
    const record = item as Record<string, unknown>;
    const stream = record.stream;
    const cutoff = record.cutoff;
    if (stream !== "audit" && stream !== "sso") throw new Error("INVALID_STREAM");
    if (typeof cutoff !== "string" || Number.isNaN(new Date(cutoff).getTime())) {
      throw new Error("INVALID_CUTOFF");
    }
    return { stream, cutoff };
  });
}
