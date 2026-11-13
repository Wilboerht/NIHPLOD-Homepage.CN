/**
 * 审计完整性锚点 v2。
 *
 * - 每日按 UTC+8 对 AuditLog / SsoAuditEvent 分别计算规范化摘要；
 * - v2 签名包含 prevAnchorHash，形成锚点链；
 * - 归档 manifest 与锚点互相校验；
 * - 支持缺失日期补锚与单日验证。
 */
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import {
  createAuditDigestHasher,
  getAuditIntegrityKey,
  getAuditIntegrityKeyVersion,
} from "./audit-chain";
import { verifyArchiveBackup, verifyArchiveDay, type AuditStream } from "./audit-archive";

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface AuditDayRange {
  day: string;
  fromAt: Date;
  toAt: Date;
}

export interface AnchorResult {
  stream: AuditStream;
  day: string;
  count: number;
  digest: string;
  signature: string;
  signatureVersion: number;
  keyVersion: number;
  prevAnchorHash: string | null;
}

export interface VerifyAuditDayResult {
  stream: AuditStream;
  day: string;
  verified: boolean;
  count: number;
  digest: string;
  signatureVersion: number;
  keyVersion: number;
  archiveVerified: boolean;
  backupVerified: boolean;
  error?: string;
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

function formatDay(base: Date): string {
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate()
  ).padStart(2, "0")}`;
}

function previousUtc8Day(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return formatDay(new Date(Date.UTC(year, month - 1, date) - DAY_MS));
}

function addDaysUtc8(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return formatDay(new Date(Date.UTC(year, month - 1, date) + amount * DAY_MS));
}

function auditSelect() {
  return {
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
    category: true,
    riskLevel: true,
    source: true,
    reason: true,
    schemaVersion: true,
    chainVersion: true,
    integrityKeyVersion: true,
    chainSeq: true,
    prevHash: true,
    entryHash: true,
    finalizedAt: true,
  } as const;
}

function ssoSelect() {
  return {
    id: true,
    event: true,
    userId: true,
    clientId: true,
    clientName: true,
    ip: true,
    userAgent: true,
    detail: true,
    success: true,
    tenantId: true,
    requestId: true,
    createdAt: true,
  } as const;
}

async function digestStreamRows(
  stream: AuditStream,
  day: AuditDayRange,
  pageSize = 1000
): Promise<{ count: number; digest: string }> {
  const hasher = createAuditDigestHasher();
  let count = 0;
  let cursor: { createdAt: Date; id: string } | null = null;

  for (;;) {
    const baseWhere = { createdAt: { gte: day.fromAt, lt: day.toAt } };
    if (stream === "audit") {
      const rows = (await prisma.auditLog.findMany({
        where: cursor
          ? {
              createdAt: { gte: day.fromAt, lt: day.toAt },
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : baseWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: pageSize,
        select: auditSelect(),
      })) as Array<{ createdAt: Date; id: string } & Record<string, unknown>>;
      if (rows.length === 0) break;
      for (const row of rows) {
        hasher.update(row as unknown as Record<string, unknown>);
        count += 1;
      }
      const last = rows[rows.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < pageSize) break;
    } else {
      const rows = (await prisma.ssoAuditEvent.findMany({
        where: cursor
          ? {
              createdAt: { gte: day.fromAt, lt: day.toAt },
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : baseWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: pageSize,
        select: ssoSelect(),
      })) as Array<{ createdAt: Date; id: string } & Record<string, unknown>>;
      if (rows.length === 0) break;
      for (const row of rows) {
        hasher.update(row as unknown as Record<string, unknown>);
        count += 1;
      }
      const last = rows[rows.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < pageSize) break;
    }
  }

  return { count, digest: hasher.digest() };
}

function signaturePayload(input: {
  stream: AuditStream;
  day: string;
  count: number;
  digest: string;
  prevAnchorHash: string | null;
}): string {
  return `${input.prevAnchorHash ?? ""}:${input.digest}:${input.count}:${input.stream}:${input.day}`;
}

function computeAnchorSignature(input: {
  stream: AuditStream;
  day: string;
  count: number;
  digest: string;
  prevAnchorHash: string | null;
  keyVersion: number;
  signatureVersion: number;
}): string {
  const key = getAuditIntegrityKey(input.keyVersion);
  if (input.signatureVersion === 1) {
    return createHmac("sha256", key).update(`${input.digest}:${input.count}`).digest("hex");
  }
  return createHmac("sha256", key)
    .update(
      signaturePayload({
        stream: input.stream,
        day: input.day,
        count: input.count,
        digest: input.digest,
        prevAnchorHash: input.prevAnchorHash,
      })
    )
    .digest("hex");
}

/** 生成/复用某流某日的 v2 锚点。 */
export async function anchorAuditStreamForDay(
  stream: AuditStream,
  dayRange: AuditDayRange = getUtc8DayRange(new Date(Date.now() - DAY_MS))
): Promise<AnchorResult> {
  const { digest, count } = await digestStreamRows(stream, dayRange);

  const existing = await prisma.auditLogAnchor.findFirst({
    where: { stream, day: dayRange.day, signatureVersion: 2 },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.digest !== digest || existing.count !== count) {
      throw new Error(`[AuditIntegrity] 审计摘要不一致，可能存在篡改: ${stream}/${dayRange.day}`);
    }
    return {
      stream,
      day: existing.day,
      count: existing.count,
      digest: existing.digest,
      signature: existing.signature,
      signatureVersion: existing.signatureVersion,
      keyVersion: existing.keyVersion,
      prevAnchorHash: existing.prevAnchorHash,
    };
  }

  const previous = await prisma.auditLogAnchor.findFirst({
    where: { stream, signatureVersion: 2, day: { lt: dayRange.day } },
    orderBy: { day: "desc" },
  });
  const prevAnchorHash = previous?.digest ?? null;
  const keyVersion = getAuditIntegrityKeyVersion();
  const signature = computeAnchorSignature({
    stream,
    day: dayRange.day,
    count,
    digest,
    prevAnchorHash,
    keyVersion,
    signatureVersion: 2,
  });

  const anchor = await prisma.auditLogAnchor.create({
    data: {
      stream,
      signatureVersion: 2,
      keyVersion,
      day: dayRange.day,
      fromAt: dayRange.fromAt,
      toAt: dayRange.toAt,
      count,
      digest,
      signature,
      prevAnchorHash,
      verifyStatus: "PENDING",
    },
  });

  apiConsole.info(
    `[AuditIntegrity] v2 锚点已生成: ${stream}/${anchor.day} (${anchor.count} 条, ${anchor.digest.slice(0, 12)}…)`
  );
  return {
    stream,
    day: anchor.day,
    count: anchor.count,
    digest: anchor.digest,
    signature: anchor.signature,
    signatureVersion: anchor.signatureVersion,
    keyVersion: anchor.keyVersion,
    prevAnchorHash: anchor.prevAnchorHash,
  };
}

/** 兼容旧调用：同时锚定审计与 SSO 两条流。 */
export async function anchorAuditLogsForDay(
  dayRange: AuditDayRange = getUtc8DayRange(new Date(Date.now() - DAY_MS))
) {
  const audit = await anchorAuditStreamForDay("audit", dayRange);
  const sso = await anchorAuditStreamForDay("sso", dayRange);
  return {
    day: audit.day,
    count: audit.count,
    digest: audit.digest,
    signature: audit.signature,
    audit,
    sso,
  };
}

/** 补齐从最早数据到昨天的缺失 v2 锚点。 */
export async function anchorMissingAuditDays(options: { maxDays?: number } = {}) {
  const maxDays = Math.min(Math.max(options.maxDays ?? 400, 1), 3650);
  const yesterday = getUtc8DayRange(new Date(Date.now() - DAY_MS)).day;
  const created: AnchorResult[] = [];

  const earliestAudit = await prisma.auditLog.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const earliestSso = await prisma.ssoAuditEvent.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const streams: Array<{ stream: AuditStream; earliest: Date | undefined }> = [
    { stream: "audit", earliest: earliestAudit?.createdAt },
    { stream: "sso", earliest: earliestSso?.createdAt },
  ];

  for (const { stream, earliest } of streams) {
    if (!earliest) continue;
    // 一次性读取已有锚点日期，避免“已存在日期也消耗 maxDays”导致永远补不到更晚的缺口。
    const existingAnchors = await prisma.auditLogAnchor.findMany({
      where: { stream, signatureVersion: 2, day: { lte: yesterday } },
      select: { day: true },
    });
    const existingDays = new Set(existingAnchors.map((anchor) => anchor.day));
    let day = getUtc8DayRange(earliest).day;
    let createdCount = 0;
    while (day <= yesterday && createdCount < maxDays) {
      if (!existingDays.has(day)) {
        const [year, month, date] = day.split("-").map(Number);
        const fromAt = new Date(Date.UTC(year, month - 1, date) - UTC8_OFFSET_MS);
        created.push(
          await anchorAuditStreamForDay(stream, {
            day,
            fromAt,
            toAt: new Date(fromAt.getTime() + DAY_MS),
          })
        );
        createdCount += 1;
      }
      day = addDaysUtc8(day, 1);
    }
  }
  return { created, lastDay: yesterday };
}

/**
 * 校验锚点链连续性：当前锚点的 prevAnchorHash 必须等于前一日锚点的 digest，
 * 且前一日锚点必须实际存在。单日签名校验无法发现“删除中间锚点/日志”的篡改。
 */
async function verifyAnchorChain(anchor: {
  stream: string;
  day: string;
  signatureVersion: number;
  prevAnchorHash: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (anchor.signatureVersion !== 2) return { ok: true };
  const previous = await prisma.auditLogAnchor.findFirst({
    where: {
      stream: anchor.stream,
      signatureVersion: 2,
      day: { lt: anchor.day },
    },
    orderBy: { day: "desc" },
    select: { day: true, digest: true },
  });
  if (!previous) {
    return anchor.prevAnchorHash ? { ok: false, error: "ANCHOR_CHAIN_PREV_MISSING" } : { ok: true };
  }
  // 防御异常/测试替身返回当前锚点自身；生产查询带 day < 条件不会命中。
  if (previous.day >= anchor.day) return { ok: true };
  if (anchor.prevAnchorHash !== previous.digest) {
    return { ok: false, error: "ANCHOR_CHAIN_HASH_MISMATCH" };
  }
  const expectedPreviousDay = previousUtc8Day(anchor.day);
  if (previous.day !== expectedPreviousDay) {
    return { ok: false, error: `ANCHOR_CHAIN_DAY_GAP:${previous.day}` };
  }
  return { ok: true };
}

/** 验证某流某日：摘要 + 签名 + 链连续性 + 归档/备份。 */
export async function verifyAuditDay(
  stream: AuditStream,
  day: string
): Promise<VerifyAuditDayResult> {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) {
    return {
      stream,
      day,
      verified: false,
      count: 0,
      digest: "",
      signatureVersion: 0,
      keyVersion: 0,
      archiveVerified: false,
      backupVerified: false,
      error: "INVALID_DAY",
    };
  }
  const fromAt = new Date(Date.UTC(year, month - 1, date) - UTC8_OFFSET_MS);
  const dayRange: AuditDayRange = { day, fromAt, toAt: new Date(fromAt.getTime() + DAY_MS) };

  const anchor = await prisma.auditLogAnchor.findFirst({
    where: { stream, day },
    orderBy: [{ signatureVersion: "desc" }, { createdAt: "desc" }],
  });
  if (!anchor) {
    return {
      stream,
      day,
      verified: false,
      count: 0,
      digest: "",
      signatureVersion: 0,
      keyVersion: 0,
      archiveVerified: false,
      backupVerified: false,
      error: "ANCHOR_NOT_FOUND",
    };
  }

  // 无论是否已归档，都先验证数据库锚点签名，避免归档分支跳过锚点完整性。
  const expectedSignature = computeAnchorSignature({
    stream,
    day,
    count: anchor.count,
    digest: anchor.digest,
    prevAnchorHash: anchor.prevAnchorHash,
    keyVersion: anchor.keyVersion,
    signatureVersion: anchor.signatureVersion,
  });
  if (expectedSignature !== anchor.signature) {
    return {
      stream,
      day,
      verified: false,
      count: anchor.count,
      digest: anchor.digest,
      signatureVersion: anchor.signatureVersion,
      keyVersion: anchor.keyVersion,
      archiveVerified: false,
      backupVerified: false,
      error: "ANCHOR_SIGNATURE_INVALID",
    };
  }

  const chain = await verifyAnchorChain({
    stream,
    day: anchor.day,
    signatureVersion: anchor.signatureVersion,
    prevAnchorHash: anchor.prevAnchorHash,
  });
  if (!chain.ok) {
    return {
      stream,
      day,
      verified: false,
      count: anchor.count,
      digest: anchor.digest,
      signatureVersion: anchor.signatureVersion,
      keyVersion: anchor.keyVersion,
      archiveVerified: false,
      backupVerified: false,
      error: chain.error,
    };
  }

  if (anchor.archivedAt) {
    const archiveVerified = await verifyArchiveDay(stream, day);
    const backupVerified = await verifyArchiveBackup(stream, day);
    return {
      stream,
      day,
      verified: archiveVerified,
      count: anchor.count,
      digest: anchor.digest,
      signatureVersion: anchor.signatureVersion,
      keyVersion: anchor.keyVersion,
      archiveVerified,
      backupVerified,
      error: archiveVerified ? undefined : "ARCHIVE_VERIFICATION_FAILED",
    };
  }

  const { digest, count } = await digestStreamRows(stream, dayRange);
  if (digest !== anchor.digest || count !== anchor.count) {
    return {
      stream,
      day,
      verified: false,
      count,
      digest,
      signatureVersion: anchor.signatureVersion,
      keyVersion: anchor.keyVersion,
      archiveVerified: false,
      backupVerified: false,
      error: "DIGEST_MISMATCH",
    };
  }

  const expected = computeAnchorSignature({
    stream,
    day,
    count: anchor.count,
    digest,
    prevAnchorHash: anchor.prevAnchorHash,
    keyVersion: anchor.keyVersion,
    signatureVersion: anchor.signatureVersion,
  });
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(anchor.signature, "hex");
  const signatureOk =
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);

  const archiveVerified = await verifyArchiveDay(stream, day);
  const backupVerified = await verifyArchiveBackup(stream, day);

  return {
    stream,
    day,
    verified: signatureOk,
    count,
    digest,
    signatureVersion: anchor.signatureVersion,
    keyVersion: anchor.keyVersion,
    archiveVerified,
    backupVerified,
    ...(signatureOk ? {} : { error: "SIGNATURE_MISMATCH" }),
  };
}

/** 兼容旧测试/调用：验证审计流。 */
export async function verifyAuditLogAnchor(day: string): Promise<boolean> {
  const result = await verifyAuditDay("audit", day);
  return result.verified;
}

export interface RecentAuditVerifyResult {
  day: string;
  results: VerifyAuditDayResult[];
  failed: VerifyAuditDayResult[];
}

/** 校验昨日（UTC+8）两个审计流的摘要、签名与归档/备份 */
export async function verifyRecentAuditDays(now = new Date()): Promise<RecentAuditVerifyResult> {
  const day = getUtc8DayRange(new Date(now.getTime() - DAY_MS)).day;
  const results = await Promise.all([verifyAuditDay("audit", day), verifyAuditDay("sso", day)]);
  return {
    day,
    results,
    failed: results.filter(
      (result) => !result.verified || (result.archiveVerified && !result.backupVerified)
    ),
  };
}

export { previousUtc8Day };
