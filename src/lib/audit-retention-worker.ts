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

async function deleteAuditStream(
  client: pg.Client,
  cutoff: Date,
  onProgress: (deleted: number) => Promise<void>
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const result = await client.query(
      `DELETE FROM "AuditLog" AS a
       WHERE a."id" IN (
         SELECT t."id" FROM "AuditLog" AS t
         WHERE t."createdAt" < ($1::timestamptz AT TIME ZONE 'UTC') AND ${auditHoldExclusionSql()}
         LIMIT $2
       )`,
      [cutoff, BATCH_SIZE]
    );
    const count = result.rowCount ?? 0;
    deleted += count;
    await onProgress(deleted);
    if (count < BATCH_SIZE) break;
  }
  return deleted;
}

async function deleteSsoStream(
  client: pg.Client,
  cutoff: Date,
  onProgress: (deleted: number) => Promise<void>
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const result = await client.query(
      `DELETE FROM "SsoAuditEvent" AS a
       WHERE a."id" IN (
         SELECT t."id" FROM "SsoAuditEvent" AS t
         WHERE t."createdAt" < ($1::timestamptz AT TIME ZONE 'UTC') AND ${ssoHoldExclusionSql()}
         LIMIT $2
       )`,
      [cutoff, BATCH_SIZE]
    );
    const count = result.rowCount ?? 0;
    deleted += count;
    await onProgress(deleted);
    if (count < BATCH_SIZE) break;
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
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('AuditLog:chain'))`);
  const last = await client.query<{ chainSeq: number | null; entryHash: string | null }>(
    `SELECT "chainSeq", "entryHash" FROM "AuditLog"
     WHERE "chainSeq" IS NOT NULL ORDER BY "chainSeq" DESC LIMIT 1`
  );
  const chainSeq = (last.rows[0]?.chainSeq ?? 0) + 1;
  const prevHash = last.rows[0]?.entryHash ?? null;
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
      chainSeq,
      prevHash,
      entryHash,
      now.toISOString(),
      now.toISOString(),
    ]
  );
}

async function processOne(jobId: string): Promise<void> {
  const claimed = await prisma.auditRetentionJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const job = await prisma.auditRetentionJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const fail = async (error: string) => {
    await prisma.auditRetentionJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: error.slice(0, 2000), finishedAt: new Date() },
    });
    apiConsole.error(`[AuditRetention] job ${job.id} 失败:`, error);
  };

  try {
    if (job.expiresAt.getTime() < Date.now()) {
      await prisma.auditRetentionJob.update({
        where: { id: job.id },
        data: { status: "EXPIRED", finishedAt: new Date() },
      });
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
    if (preview.previewHash !== job.previewHash) return fail("预览已变化，请重新预览");
    if (!preview.ready) return fail(`预览未就绪: ${preview.warnings.join("; ")}`);
    if (preview.expectedCount !== job.expectedCount) return fail("可删数量变化");

    const client = new pg.Client({
      connectionString: retentionConnectionString(),
      options: "-c timezone=UTC",
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '300000'");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('AuditRetention:worker'))`);

      let deleted = 0;
      const updateProgress = async (next: number) => {
        const total = deleted + next;
        const bytes = Math.round(job.expectedBytes * (total / Math.max(1, job.expectedCount)));
        await client.query(
          `UPDATE "AuditRetentionJob" SET "deletedCount" = $1, "deletedBytes" = $2 WHERE "id" = $3`,
          [total, bytes, job.id]
        );
      };

      for (const entry of cutoffs) {
        const cutoff = new Date(entry.cutoff);
        const before = deleted;
        if (entry.stream === "audit") {
          deleted += await deleteAuditStream(client, cutoff, async (n) => {
            await updateProgress(n - (deleted - before));
          });
        } else {
          deleted += await deleteSsoStream(client, cutoff, async (n) => {
            await updateProgress(n - (deleted - before));
          });
        }
      }

      const deletedBytes = Math.round(
        job.expectedBytes * (deleted / Math.max(1, job.expectedCount))
      );
      const holdsExcluded = Math.max(0, job.expectedCount - deleted);
      const archiveManifests = preview.buckets.map((bucket) => ({
        stream: bucket.stream,
        day: bucket.day,
        eligible: bucket.eligible,
        archiveVerified: bucket.archiveVerified,
        backupVerified: bucket.backupVerified,
      }));

      await insertRetentionSummary(client, {
        id: job.id,
        requestedBy: job.requestedBy,
        reason: job.reason,
        deletedCount: deleted,
        deletedBytes,
        holdsExcluded,
        cutoffs,
      });

      await client.query(
        `UPDATE "AuditRetentionJob"
         SET "status" = 'SUCCEEDED', "deletedCount" = $1, "deletedBytes" = $2,
             "holdsExcluded" = $3, "archiveManifests" = $4::jsonb,
             "finishedAt" = (now() AT TIME ZONE 'UTC')
         WHERE "id" = $5`,
        [deleted, deletedBytes, holdsExcluded, JSON.stringify(archiveManifests), job.id]
      );
      await client.query("COMMIT");
      apiConsole.info(
        `[AuditRetention] job ${job.id} 完成: 删除 ${deleted} 条，hold 排除 ${holdsExcluded} 条`
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await client.end().catch(() => {});
    }
  } catch (error) {
    await fail(error instanceof Error ? error.message : String(error));
  }
}

export async function processAuditRetentionJobs(): Promise<number> {
  const now = new Date();
  await prisma.auditRetentionJob.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", finishedAt: now },
  });
  const jobs = await prisma.auditRetentionJob.findMany({
    where: { status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    take: JOB_LIMIT,
    select: { id: true },
  });
  for (const job of jobs) {
    await processOne(job.id);
  }
  return jobs.length;
}
