/**
 * 审计到期清理 worker。
 *
 * 由独立系统 cron 调用，使用 AUDIT_RETENTION_DATABASE_URL（audit_retention 角色）
 * 执行 DELETE；Web 进程不持有该连接串。
 */
import { randomUUID } from "crypto";
import pg from "pg";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import {
  buildRetentionPreview,
  parseRetentionCutoffs,
  verifyRetentionApproval,
  type RetentionStreamCutoff,
} from "./audit-retention";
import { computeAuditEntryHash, getAuditIntegrityKeyVersion } from "./audit-chain";
import { parseUtc8DateBoundary } from "./timezone";
import { notifyAuditRetentionResult } from "./admin-alert";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;
const JOB_LIMIT = 3;

function retentionConnectionString(): string {
  const url = process.env.AUDIT_RETENTION_DATABASE_URL;
  if (!url) {
    throw new Error("[AuditRetention] 未配置 AUDIT_RETENTION_DATABASE_URL");
  }
  return url;
}

function auditHoldExclusionSql(): string {
  return `NOT EXISTS (
    SELECT 1 FROM "AuditLegalHold" h
    WHERE h."active" = true
      AND (h."expiresAt" IS NULL OR h."expiresAt" > (now() AT TIME ZONE 'UTC'))
      AND (
        (h."targetType" IS NOT NULL AND h."targetId" IS NOT NULL
          AND h."targetType" = t."targetType" AND h."targetId" = t."targetId")
        OR (h."userId" IS NOT NULL AND h."userId" = t."userId")
        OR (h."adminId" IS NOT NULL AND h."adminId" = t."adminId")
      )
  )`;
}

function ssoHoldExclusionSql(): string {
  return `NOT EXISTS (
    SELECT 1 FROM "AuditLegalHold" h
    WHERE h."active" = true
      AND (h."expiresAt" IS NULL OR h."expiresAt" > (now() AT TIME ZONE 'UTC'))
      AND h."userId" IS NOT NULL
      AND h."userId" = t."userId"
  )`;
}

interface RetentionDayRange {
  fromAt: Date;
  toAt: Date;
}

function toDayRanges(days: readonly string[]): RetentionDayRange[] {
  return days
    .map((day) => {
      const fromAt = parseUtc8DateBoundary(day, false);
      return fromAt ? { fromAt, toAt: new Date(fromAt.getTime() + DAY_MS) } : null;
    })
    .filter((range): range is RetentionDayRange => range !== null);
}

async function deleteAuditStream(
  client: pg.Client,
  ranges: readonly RetentionDayRange[],
  onBatch: (batchCount: number) => Promise<void>
): Promise<number> {
  let deleted = 0;
  for (const range of ranges) {
    for (;;) {
      const result = await client.query(
        `DELETE FROM "AuditLog" AS a
         WHERE a."id" IN (
           SELECT t."id" FROM "AuditLog" AS t
           WHERE t."createdAt" >= ($1::timestamptz AT TIME ZONE 'UTC')
             AND t."createdAt" < ($2::timestamptz AT TIME ZONE 'UTC')
             AND ${auditHoldExclusionSql()}
           LIMIT $3
         )`,
        [range.fromAt, range.toAt, BATCH_SIZE]
      );
      const count = result.rowCount ?? 0;
      deleted += count;
      await onBatch(count);
      if (count < BATCH_SIZE) break;
    }
  }
  return deleted;
}

async function deleteSsoStream(
  client: pg.Client,
  ranges: readonly RetentionDayRange[],
  onBatch: (batchCount: number) => Promise<void>
): Promise<number> {
  let deleted = 0;
  for (const range of ranges) {
    for (;;) {
      const result = await client.query(
        `DELETE FROM "SsoAuditEvent" AS a
         WHERE a."id" IN (
           SELECT t."id" FROM "SsoAuditEvent" AS t
           WHERE t."createdAt" >= ($1::timestamptz AT TIME ZONE 'UTC')
             AND t."createdAt" < ($2::timestamptz AT TIME ZONE 'UTC')
             AND ${ssoHoldExclusionSql()}
           LIMIT $3
         )`,
        [range.fromAt, range.toAt, BATCH_SIZE]
      );
      const count = result.rowCount ?? 0;
      deleted += count;
      await onBatch(count);
      if (count < BATCH_SIZE) break;
    }
  }
  return deleted;
}

async function insertRetentionSummary(
  client: pg.Client,
  job: {
    id: string;
    requestedBy: string;
    reason: string;
    deletedCount: number;
    deletedBytes: number;
    holdsExcluded: number;
    cutoffs: RetentionStreamCutoff[];
  }
): Promise<void> {
  // 独立事务：即使外部分批删除已提交，摘要审计也必须在链锁内原子追加。
  await client.query("BEGIN");
  try {
    await insertRetentionSummaryRows(client, job);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function insertRetentionSummaryRows(
  client: pg.Client,
  job: {
    id: string;
    requestedBy: string;
    reason: string;
    deletedCount: number;
    deletedBytes: number;
    holdsExcluded: number;
    cutoffs: RetentionStreamCutoff[];
  }
): Promise<void> {
  await client.query(
    `INSERT INTO "AuditChainCursor" ("stream", "seq", "lastHash", "updatedAt")
     VALUES ('audit', 0, NULL, (now() AT TIME ZONE 'UTC'))
     ON CONFLICT ("stream") DO NOTHING`
  );
  const cursor = await client.query<{ seq: string | number; lastHash: string | null }>(
    `SELECT "seq", "lastHash" FROM "AuditChainCursor" WHERE "stream" = 'audit' FOR UPDATE`
  );
  const chainSeq = BigInt(cursor.rows[0]?.seq ?? 0) + BigInt(1);
  const prevHash = cursor.rows[0]?.lastHash ?? null;
  const id = randomUUID();
  const createdAt = new Date();
  const keyVersion = getAuditIntegrityKeyVersion();
  const entryHash = computeAuditEntryHash({
    id,
    createdAt,
    action: "audit_retention_execute",
    targetType: "audit_retention",
    targetLabel: job.id,
    requestId: null,
    actorType: "SYSTEM",
    actorEmail: null,
    actorName: null,
    actorRole: null,
    authMethod: "retention_worker",
    sessionJti: null,
    adminId: null,
    userId: null,
    category: "system",
    riskLevel: "HIGH",
    source: "CRON",
    schemaVersion: 2,
    chainVersion: 1,
    integrityKeyVersion: keyVersion,
    chainSeq,
    prevHash,
  });
  const detail = {
    phase: "executed",
    jobId: job.id,
    requestedBy: job.requestedBy,
    reason: job.reason,
    cutoffs: job.cutoffs,
    deletedCount: job.deletedCount,
    deletedBytes: job.deletedBytes,
    holdsExcluded: job.holdsExcluded,
  };
  const now = createdAt;
  await client.query(
    `INSERT INTO "AuditLog" (
      "id", "action", "targetType", "targetId", "targetLabel", "detail", "outcome",
      "requestId", "actorType", "actorEmail", "actorName", "actorRole", "authMethod",
      "sessionJti", "legalHold", "ipAddress", "userAgent", "adminId", "userId",
      "category", "riskLevel", "source", "reason", "schemaVersion", "chainVersion",
      "integrityKeyVersion", "chainSeq", "prevHash", "entryHash", "finalizedAt", "createdAt"
    ) VALUES (
      $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
      $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::timestamp,$31::timestamp
    )`,
    [
      id,
      "audit_retention_execute",
      "audit_retention",
      job.id,
      job.id,
      JSON.stringify(detail),
      "SUCCESS",
      null,
      "SYSTEM",
      null,
      null,
      null,
      "retention_worker",
      null,
      false,
      null,
      null,
      null,
      null,
      "system",
      "HIGH",
      "CRON",
      job.reason,
      2,
      1,
      keyVersion,
      chainSeq.toString(),
      prevHash,
      entryHash,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  await client.query(
    `UPDATE "AuditChainCursor"
     SET "seq" = $1, "lastHash" = $2, "updatedAt" = (now() AT TIME ZONE 'UTC')
     WHERE "stream" = 'audit'`,
    [chainSeq.toString(), entryHash]
  );
}

interface RetentionProgress {
  completedBuckets: string[];
  deletedCount: number;
  deletedBytes: number;
  holdsExcluded: number;
}

function readRetentionProgress(value: unknown): RetentionProgress {
  if (!value || typeof value !== "object") {
    return { completedBuckets: [], deletedCount: 0, deletedBytes: 0, holdsExcluded: 0 };
  }
  const record = value as Record<string, unknown>;
  return {
    completedBuckets: Array.isArray(record.completedBuckets)
      ? record.completedBuckets.filter((item): item is string => typeof item === "string")
      : [],
    deletedCount:
      typeof record.deletedCount === "number" && Number.isFinite(record.deletedCount)
        ? Math.max(0, Math.floor(record.deletedCount))
        : 0,
    deletedBytes:
      typeof record.deletedBytes === "number" && Number.isFinite(record.deletedBytes)
        ? Math.max(0, Math.floor(record.deletedBytes))
        : 0,
    holdsExcluded:
      typeof record.holdsExcluded === "number" && Number.isFinite(record.holdsExcluded)
        ? Math.max(0, Math.floor(record.holdsExcluded))
        : 0,
  };
}

function retryDelayMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60 * 1000;
}

async function processOne(jobId: string): Promise<void> {
  const job = await prisma.auditRetentionJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const now = new Date();
  const canClaim =
    (job.status === "PENDING" && job.expiresAt > now) ||
    (job.status === "FAILED" &&
      job.nextRetryAt !== null &&
      job.nextRetryAt <= now &&
      job.attempts < job.maxAttempts);
  if (!canClaim) return;

  const leaseToken = randomUUID();
  const claimed = await prisma.auditRetentionJob.updateMany({
    where:
      job.status === "FAILED"
        ? { id: job.id, status: "FAILED", nextRetryAt: { lte: now } }
        : { id: job.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      startedAt: job.startedAt ?? now,
      leaseToken,
      heartbeatAt: now,
      attempts: { increment: 1 },
      nextRetryAt: null,
      error: null,
    },
  });
  if (claimed.count === 0) return;

  const heartbeatTimer = setInterval(() => {
    void prisma.auditRetentionJob
      .updateMany({
        where: { id: job.id, status: "RUNNING", leaseToken },
        data: { heartbeatAt: new Date() },
      })
      .catch((error) => apiConsole.warn("[AuditRetention] 心跳更新失败:", error));
  }, 60 * 1000);
  heartbeatTimer.unref?.();

  const finish = async (
    status: "PENDING" | "FAILED" | "EXPIRED" | "SUCCEEDED",
    data: {
      error?: string | null;
      finishedAt?: Date | null;
      nextRetryAt?: Date | null;
    }
  ): Promise<boolean> => {
    const updated = await prisma.auditRetentionJob.updateMany({
      where: { id: job.id, status: "RUNNING", leaseToken },
      data: { status, ...data, leaseToken: null, heartbeatAt: null },
    });
    return updated.count > 0;
  };

  const fail = async (error: string) => {
    const attempts = job.attempts + 1;
    const retryable = attempts < job.maxAttempts;
    const nextRetryAt = retryable ? new Date(Date.now() + retryDelayMs(attempts)) : null;
    await finish(retryable ? "PENDING" : "FAILED", {
      error: error.slice(0, 2000),
      finishedAt: retryable ? null : new Date(),
      nextRetryAt,
    });
    apiConsole.error(
      `[AuditRetention] job ${job.id} ${retryable ? "失败，将重试" : "最终失败"}:`,
      error
    );
    if (!retryable) {
      notifyAuditRetentionResult({ jobId: job.id, status: "FAILED", error });
    }
  };

  try {
    if (job.expiresAt.getTime() < Date.now()) {
      await finish("EXPIRED", { finishedAt: new Date() });
      return;
    }
    if (process.env.AUDIT_RETENTION_ENABLED !== "true") {
      return fail("AUDIT_RETENTION_ENABLED 未开启");
    }
    if (process.env.AUDIT_RETENTION_ALLOW_LOCAL_ONLY !== "true") {
      return fail("未确认 AUDIT_RETENTION_ALLOW_LOCAL_ONLY");
    }
    if (job.requestedByRole !== "owner") return fail("仅 owner 可执行");
    const requester = await prisma.admin.findFirst({
      where: { id: job.requestedBy, deletedAt: null },
      select: { role: true, status: true },
    });
    if (!requester || requester.status !== "ACTIVE" || requester.role !== "owner") {
      return fail("审批人权限已失效，已取消执行任务");
    }
    if (!verifyRetentionApproval(job)) return fail("审批签名无效");

    const cutoffs = parseRetentionCutoffs(job.streams);
    const preview = await buildRetentionPreview({ cutoffs });
    const progress = readRetentionProgress(job.progress);
    const resuming = progress.deletedCount > 0 || progress.completedBuckets.length > 0;

    if (!resuming) {
      if (preview.previewHash !== job.previewHash) return fail("预览已变化，请重新预览");
      if (!preview.ready) return fail(`预览未就绪: ${preview.warnings.join("; ")}`);
      if (preview.expectedCount !== job.expectedCount) return fail("可删数量变化");
      progress.holdsExcluded = preview.holdsExcluded;
    } else {
      if (!preview.ready) return fail(`预览未就绪: ${preview.warnings.join("; ")}`);
      if (preview.holdsExcluded !== progress.holdsExcluded) {
        return fail("冻结保留数量已变化，请重新预览");
      }
      const remaining = job.expectedCount - progress.deletedCount;
      if (preview.expectedCount > remaining + BATCH_SIZE * 2) {
        return fail("可删数量增加，请重新预览");
      }
      // 进程可能在提交删除后、写入进度前崩溃；以数据库实际剩余量为准修正进度。
      progress.deletedCount = Math.max(
        progress.deletedCount,
        job.expectedCount - preview.expectedCount
      );
    }

    const completed = new Set(progress.completedBuckets);
    const client = new pg.Client({
      connectionString: retentionConnectionString(),
      options: "-c timezone=UTC",
    });
    await client.connect();
    try {
      await client.query("SET statement_timeout = '300000'");
      await client.query(`SELECT pg_advisory_lock(hashtext('AuditRetention:worker'))`);

      let deleted = progress.deletedCount;
      const updateProgress = async () => {
        progress.deletedCount = deleted;
        progress.deletedBytes = Math.round(
          job.expectedBytes * (deleted / Math.max(1, job.expectedCount))
        );
        progress.completedBuckets = [...completed].sort();
        const updated = await client.query(
          `UPDATE "AuditRetentionJob"
           SET "deletedCount" = $1, "deletedBytes" = $2, "progress" = $3::jsonb,
               "heartbeatAt" = (now() AT TIME ZONE 'UTC')
           WHERE "id" = $4 AND "status" = 'RUNNING' AND "leaseToken" = $5`,
          [deleted, progress.deletedBytes, JSON.stringify(progress), job.id, leaseToken]
        );
        if (updated.rowCount === 0) {
          throw new Error("执行租约已丢失，停止清理");
        }
      };

      for (const entry of cutoffs) {
        const buckets = preview.buckets
          .filter(
            (bucket) =>
              bucket.stream === entry.stream &&
              bucket.eligible > 0 &&
              bucket.archiveVerified &&
              bucket.backupVerified
          )
          .sort((a, b) => a.day.localeCompare(b.day));
        for (const bucket of buckets) {
          const key = `${bucket.stream}:${bucket.day}`;
          if (completed.has(key)) continue;
          const [range] = toDayRanges([bucket.day]);
          if (!range) continue;
          const onBatch = async (batchCount: number) => {
            deleted += batchCount;
            await updateProgress();
          };
          if (entry.stream === "audit") {
            await deleteAuditStream(client, [range], onBatch);
          } else {
            await deleteSsoStream(client, [range], onBatch);
          }
          completed.add(key);
          await updateProgress();
        }
      }

      const deletedBytes = Math.round(
        job.expectedBytes * (deleted / Math.max(1, job.expectedCount))
      );
      const holdsExcluded = preview.holdsExcluded;
      const archiveManifests = preview.buckets.map((bucket) => ({
        stream: bucket.stream,
        day: bucket.day,
        eligible: bucket.eligible,
        archiveVerified: bucket.archiveVerified,
        backupVerified: bucket.backupVerified,
      }));

      const existingSummary = await prisma.auditLog.findFirst({
        where: { action: "audit_retention_execute", targetId: job.id },
        select: { id: true },
      });
      if (!existingSummary) {
        await insertRetentionSummary(client, {
          id: job.id,
          requestedBy: job.requestedBy,
          reason: job.reason,
          deletedCount: deleted,
          deletedBytes,
          holdsExcluded,
          cutoffs,
        });
      }

      await client.query("BEGIN");
      const completedJob = await client.query(
        `UPDATE "AuditRetentionJob"
         SET "status" = 'SUCCEEDED', "deletedCount" = $1, "deletedBytes" = $2,
             "holdsExcluded" = $3, "archiveManifests" = $4::jsonb,
             "progress" = $5::jsonb, "finishedAt" = (now() AT TIME ZONE 'UTC'),
             "leaseToken" = NULL, "heartbeatAt" = NULL, "nextRetryAt" = NULL
         WHERE "id" = $6 AND "status" = 'RUNNING' AND "leaseToken" = $7`,
        [
          deleted,
          deletedBytes,
          holdsExcluded,
          JSON.stringify(archiveManifests),
          JSON.stringify(progress),
          job.id,
          leaseToken,
        ]
      );
      if (completedJob.rowCount === 0) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error("执行租约已丢失，清理结果未提交");
      }
      await client.query("COMMIT");
      apiConsole.info(
        `[AuditRetention] job ${job.id} 完成: 删除 ${deleted} 条，hold 排除 ${holdsExcluded} 条`
      );
      notifyAuditRetentionResult({ jobId: job.id, status: "SUCCEEDED", deletedCount: deleted });
    } finally {
      await client
        .query(`SELECT pg_advisory_unlock(hashtext('AuditRetention:worker'))`)
        .catch(() => {});
      await client.end().catch(() => {});
    }
  } catch (error) {
    await fail(error instanceof Error ? error.message : String(error));
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function processAuditRetentionJobs(): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  const stale = await prisma.auditRetentionJob.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { heartbeatAt: { lt: staleBefore } },
        { heartbeatAt: null, startedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true, attempts: true, maxAttempts: true },
  });
  for (const job of stale) {
    const retryable = job.attempts < job.maxAttempts;
    await prisma.auditRetentionJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: retryable
        ? {
            status: "PENDING",
            error: "执行超时或进程中断，任务将自动重试",
            nextRetryAt: now,
            leaseToken: null,
            heartbeatAt: null,
            finishedAt: null,
          }
        : {
            status: "FAILED",
            error: "执行超时或进程中断，已达到最大重试次数",
            finishedAt: now,
            nextRetryAt: null,
            leaseToken: null,
            heartbeatAt: null,
          },
    });
    if (!retryable) {
      notifyAuditRetentionResult({
        jobId: job.id,
        status: "FAILED",
        error: "执行超时或进程中断，已达到最大重试次数",
      });
    }
  }

  await prisma.auditRetentionJob.updateMany({
    where: {
      OR: [
        { status: "PENDING", expiresAt: { lt: now } },
        { status: "FAILED", expiresAt: { lt: now } },
      ],
    },
    data: { status: "EXPIRED", finishedAt: now, leaseToken: null, heartbeatAt: null },
  });

  const candidates = await prisma.auditRetentionJob.findMany({
    where: {
      expiresAt: { gt: now },
      OR: [{ status: "PENDING" }, { status: "FAILED", nextRetryAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: JOB_LIMIT * 3,
    select: { id: true, status: true, attempts: true, maxAttempts: true },
  });
  const jobs = candidates
    .filter((job) => job.status === "PENDING" || job.attempts < job.maxAttempts)
    .slice(0, JOB_LIMIT);
  for (const job of jobs) {
    await processOne(job.id);
  }
  return jobs.length;
}
