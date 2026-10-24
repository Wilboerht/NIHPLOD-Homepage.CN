/**
 * 审计导出任务。
 *
 * Web 路由只创建任务；worker（in-process cron 或独立脚本）分批写文件，
 * 生成 sha256，完成后写 `audit_log_export` 审计记录。
 */
import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, readFile, unlink } from "fs/promises";
import { join } from "path";
import { once } from "events";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import {
  buildAuditWhere,
  createAuditLogStrict,
  type AuditLogQueryOptions,
} from "./audit";
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_TYPE_LABELS } from "./audit-labels";
import { maskAuditDetail, maskAuditText, redactSensitiveAuditDetail } from "./audit-sanitize";
import { maskIdentifier, maskIp } from "./mask-phone";
import { escapeCSV } from "./csv";


export type ExportFormat = "csv" | "jsonl";
export type ExportStream = "audit" | "sso";

export interface AuditExportFilters extends Omit<AuditLogQueryOptions, "startDate" | "endDate"> {
  startDate?: string;
  endDate?: string;
  canViewSensitive?: boolean;
}

export interface SsoExportFilters {
  event?: string;
  clientId?: string;
  userId?: string;
  success?: boolean;
  requestId?: string;
  startDate?: string;
  endDate?: string;
  canViewSensitive?: boolean;
}

export interface CreateAuditExportInput {
  adminId: string;
  adminEmail?: string | null;
  adminName?: string | null;
  stream: ExportStream;
  format: ExportFormat;
  filters: AuditExportFilters | SsoExportFilters;
}

function getExportRoot(): string {
  return process.env.AUDIT_EXPORT_DIR || join(process.cwd(), "var", "audit-exports");
}

function assertExportPath(filePath: string): void {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/public/") || normalized.endsWith("/public")) {
    throw new Error("[AuditExport] 导出目录不能位于 public/ 下");
  }
}

export async function createAuditExportJob(input: CreateAuditExportInput) {
  return prisma.auditExportJob.create({
    data: {
      adminId: input.adminId,
      adminEmail: input.adminEmail ?? null,
      adminName: input.adminName ?? null,
      stream: input.stream,
      format: input.format,
      filters: input.filters as object,
      status: "QUEUED",
    },
  });
}

function buildCsvHeader(): string[] {
  return [
    "时间",
    "操作者类型",
    "操作人",
    "操作者邮箱",
    "操作",
    "结果",
    "风险",
    "类别",
    "目标类型",
    "目标ID",
    "目标名称",
    "请求ID",
    "认证方式",
    "IP地址",
    "详情",
    "链序号",
    "entryHash",
  ];
}

function csvRow(values: unknown[]): string {
  return values.map((value) => escapeCSV(value === null || value === undefined ? "" : String(value))).join(",");
}

function sanitizeAuditRow(
  row: Record<string, unknown>,
  canViewSensitive: boolean
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {
    ...row,
    detail: redactSensitiveAuditDetail(row.detail),
  };
  if (canViewSensitive) return scrubbed;
  return {
    ...scrubbed,
    targetLabel: scrubbed.targetLabel ? maskAuditText(String(scrubbed.targetLabel)) : null,
    detail: maskAuditDetail(scrubbed.detail),
    ipAddress: scrubbed.ipAddress ? maskIp(String(scrubbed.ipAddress)) : null,
    userAgent: null,
    actorEmail: scrubbed.actorEmail ? maskIdentifier(String(scrubbed.actorEmail)) : null,
  };
}

function sanitizeSsoRow(
  row: Record<string, unknown>,
  canViewSensitive: boolean
): Record<string, unknown> {
  if (canViewSensitive) {
    return { ...row, detail: redactSensitiveAuditDetail(row.detail) };
  }
  return {
    ...row,
    userId: row.userId ? maskIdentifier(String(row.userId)) : null,
    ip: row.ip ? maskIp(String(row.ip)) : null,
    userAgent: null,
    detail: maskAuditDetail(row.detail),
  };
}

function toAuditQuery(filters: AuditExportFilters): AuditLogQueryOptions {
  const rawLegalHold = (filters as { legalHold?: unknown }).legalHold;
  return {
    ...filters,
    legalHold:
      rawLegalHold === undefined
        ? undefined
        : rawLegalHold === true || rawLegalHold === "true",
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    canViewSensitive: undefined,
  } as AuditLogQueryOptions;
}

async function writeAuditCsv(
  filePath: string,
  filters: AuditExportFilters,
  canViewSensitive: boolean,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<{ count: number; total: number }> {
  const out = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  const query = toAuditQuery(filters);
  const where = buildAuditWhere(query);
  const total = await prisma.auditLog.count({ where });
  let processed = 0;
  let cursor: { createdAt: Date; id: string } | null = null;

  try {
    out.write(`\uFEFF${buildCsvHeader().join(",")}\n`);
    for (;;) {
      const pageWhere: Prisma.AuditLogWhereInput = cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              },
            ],
          }
        : where;
      const rows = await prisma.auditLog.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 1000,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const safe = sanitizeAuditRow(row as unknown as Record<string, unknown>, canViewSensitive);
        const actor = safe.actorName || safe.actorEmail || safe.actorType || "";
        const line = csvRow([
          row.createdAt.toISOString(),
          row.actorType,
          actor,
          safe.actorEmail,
          AUDIT_ACTION_LABELS[row.action] ?? row.action,
          row.outcome,
          row.riskLevel,
          row.category,
          AUDIT_TARGET_TYPE_LABELS[row.targetType] ?? row.targetType,
          row.targetId,
          safe.targetLabel,
          row.requestId,
          row.authMethod,
          safe.ipAddress,
          JSON.stringify(safe.detail ?? null),
          row.chainSeq,
          row.entryHash,
        ]);
        if (!out.write(`${line}\n`)) await once(out, "drain");
      }
      processed += rows.length;
      await onProgress(processed, total);
      const last = rows.at(-1)!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < 1000) break;
    }
  } finally {
    out.end();
    await once(out, "finish");
  }
  return { count: processed, total };
}

async function writeAuditJsonl(
  filePath: string,
  filters: AuditExportFilters,
  canViewSensitive: boolean,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<{ count: number; total: number }> {
  const out = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  const query = toAuditQuery(filters);
  const where = buildAuditWhere(query);
  const total = await prisma.auditLog.count({ where });
  let processed = 0;
  let cursor: { createdAt: Date; id: string } | null = null;

  try {
    for (;;) {
      const pageWhere: Prisma.AuditLogWhereInput = cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              },
            ],
          }
        : where;
      const rows = await prisma.auditLog.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 1000,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const safe = sanitizeAuditRow(row as unknown as Record<string, unknown>, canViewSensitive);
        if (!out.write(`${JSON.stringify(safe)}\n`)) await once(out, "drain");
      }
      processed += rows.length;
      await onProgress(processed, total);
      const last = rows.at(-1)!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (rows.length < 1000) break;
    }
  } finally {
    out.end();
    await once(out, "finish");
  }
  return { count: processed, total };
}

function buildSsoWhere(filters: SsoExportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.event) where.event = filters.event;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.success !== undefined) where.success = filters.success;
  if (filters.requestId) where.requestId = filters.requestId;
  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) createdAt.lte = new Date(filters.endDate);
    where.createdAt = createdAt;
  }
  return where;
}

async function writeSsoFile(
  filePath: string,
  format: ExportFormat,
  filters: SsoExportFilters,
  canViewSensitive: boolean,
  onProgress: (processed: number, total: number) => Promise<void>
): Promise<{ count: number; total: number }> {
  const out = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  const where = buildSsoWhere(filters);
  const total = await prisma.ssoAuditEvent.count({ where: where as never });
  let processed = 0;
  let skip = 0;
  try {
    if (format === "csv") {
      out.write(
        `\uFEFF${["时间", "事件", "结果", "用户ID", "客户端", "IP", "UA", "请求ID", "详情"]
          .map(escapeCSV)
          .join(",")}\n`
      );
    }
    for (;;) {
      const rows = await prisma.ssoAuditEvent.findMany({
        where: where as never,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take: 1000,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const safe = sanitizeSsoRow(row as unknown as Record<string, unknown>, canViewSensitive);
        if (format === "csv") {
          const line = csvRow([
            row.createdAt.toISOString(),
            row.event,
            row.success ? "SUCCESS" : "FAILURE",
            safe.userId,
            row.clientName || row.clientId,
            safe.ip,
            safe.userAgent,
            row.requestId,
            JSON.stringify(safe.detail ?? null),
          ]);
          if (!out.write(`${line}\n`)) await once(out, "drain");
        } else if (!out.write(`${JSON.stringify(safe)}\n`)) {
          await once(out, "drain");
        }
      }
      processed += rows.length;
      await onProgress(processed, total);
      skip += rows.length;
      if (rows.length < 1000) break;
    }
  } finally {
    out.end();
    await once(out, "finish");
  }
  return { count: processed, total };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const content = await readFile(filePath);
  hash.update(content);
  return hash.digest("hex");
}

async function processOneJob(jobId: string): Promise<void> {
  const claimed = await prisma.auditExportJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const job = await prisma.auditExportJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const filters = job.filters as unknown as AuditExportFilters | SsoExportFilters;
  const canViewSensitive = Boolean(
    (filters as AuditExportFilters).canViewSensitive === true
  );
  const format = (job.format === "jsonl" ? "jsonl" : "csv") as ExportFormat;
  const root = getExportRoot();
  const filePath = join(root, `${job.id}.${format}`);
  assertExportPath(filePath);

  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const onProgress = async (processed: number, total: number) => {
      await prisma.auditExportJob.update({
        where: { id: job.id },
        data: { processedRows: processed, totalRows: total },
      });
    };
    const result =
      job.stream === "sso"
        ? await writeSsoFile(
            filePath,
            format,
            filters as SsoExportFilters,
            canViewSensitive,
            onProgress
          )
        : format === "jsonl"
          ? await writeAuditJsonl(
              filePath,
              filters as AuditExportFilters,
              canViewSensitive,
              onProgress
            )
          : await writeAuditCsv(
              filePath,
              filters as AuditExportFilters,
              canViewSensitive,
              onProgress
            );
    const sha256 = await sha256File(filePath);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await createAuditLogStrict({
      action: "audit_log_export",
      targetType: "system",
      outcome: "SUCCESS",
      actorType: "SYSTEM",
      source: "CRON",
      detail: {
        phase: "completed",
        jobId: job.id,
        stream: job.stream,
        format,
        filters,
        exportedCount: result.count,
        truncated: result.count < result.total,
        sha256,
        requestedBy: job.adminId,
        requestedByEmail: job.adminEmail,
      },
    });

    await prisma.auditExportJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        filePath,
        sha256,
        processedRows: result.count,
        totalRows: result.total,
        expiresAt,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    apiConsole.error("[AuditExport] 导出失败:", error);
    await prisma.auditExportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN",
        finishedAt: new Date(),
      },
    });
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  }
}

export async function processAuditExportJobs(limit = 3): Promise<number> {
  const jobs = await prisma.auditExportJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const job of jobs) {
    await processOneJob(job.id);
  }
  return jobs.length;
}

export async function expireAuditExportJobs(): Promise<number> {
  const now = new Date();
  const expired = await prisma.auditExportJob.findMany({
    where: { status: "SUCCEEDED", expiresAt: { lt: now } },
    select: { id: true, filePath: true },
  });
  for (const job of expired) {
    if (job.filePath) {
      try {
        await unlink(job.filePath);
      } catch {
        // ignore
      }
    }
  }
  if (expired.length === 0) return 0;
  const result = await prisma.auditExportJob.updateMany({
    where: { id: { in: expired.map((job) => job.id) } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export function getAuditExportFilePath(filePath: string): string {
  assertExportPath(filePath);
  return filePath;
}


