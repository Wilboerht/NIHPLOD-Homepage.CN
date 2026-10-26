/**
 * 审计本地归档。
 *
 * 目录结构：
 *   <AUDIT_ARCHIVE_DIR>/<stream>/YYYY-MM-DD/events.jsonl.gz
 *   <AUDIT_ARCHIVE_DIR>/<stream>/YYYY-MM-DD/manifest.json
 *
 * 本地磁盘不是真正 WORM；这里提供：
 * - 私有目录（public 之外）
 * - 排他创建 + 0600 文件
 * - gzip + sha256 + manifest
 * - 可选同盘备份目录
 * - 与每日锚点/HMAC 签名互相校验
 */
import { createHash, createHmac } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { access, chmod, cp, mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip, createGzip } from "zlib";
import readline from "readline";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import {
  computeAuditDigest,
  getAuditIntegrityKey,
  getAuditIntegrityKeyVersion,
  stableStringify,
} from "./audit-chain";

export type AuditStream = "audit" | "sso";

export interface ArchiveDayRange {
  day: string;
  fromAt: Date;
  toAt: Date;
}

export interface ArchiveManifest {
  version: 1;
  stream: AuditStream;
  day: string;
  fromAt: string;
  toAt: string;
  count: number;
  digest: string;
  signature: string;
  signatureVersion: number;
  keyVersion: number;
  prevAnchorHash: string | null;
  sha256: string;
  createdAt: string;
  eventFile: string;
  signatureIncludesFile?: boolean;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getAuditArchiveRoot(): string {
  return process.env.AUDIT_ARCHIVE_DIR || join(process.cwd(), "var", "audit-archive");
}

export function getAuditArchiveBackupRoot(): string | null {
  return process.env.AUDIT_ARCHIVE_BACKUP_DIR || join(process.cwd(), "var", "audit-archive-backup");
}

function assertSafeRoot(root: string): void {
  const normalized = root.replace(/\\/g, "/");
  if (!normalized || normalized.includes("\u0000")) {
    throw new Error("[AuditArchive] 归档目录不合法");
  }
  if (normalized.includes("/public/") || normalized.endsWith("/public")) {
    throw new Error("[AuditArchive] 归档目录不能位于 public/ 下");
  }
}

function dayDir(root: string, stream: AuditStream, day: string): string {
  if (!DAY_RE.test(day)) throw new Error(`[AuditArchive] 非法日期: ${day}`);
  return join(root, stream, day);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function* auditRows(
  day: ArchiveDayRange,
  pageSize = 1000
): AsyncGenerator<Record<string, unknown>> {
  let skip = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { gte: day.fromAt, lt: day.toAt } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        action: true,
        targetType: true,
        targetId: true,
        targetLabel: true,
        detail: true,
        outcome: true,
        requestId: true,
        actorType: true,
        actorEmail: true,
        actorName: true,
        actorRole: true,
        authMethod: true,
        sessionJti: true,
        legalHold: true,
        ipAddress: true,
        userAgent: true,
        adminId: true,
        userId: true,
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
      },
    });
    if (rows.length === 0) return;
    for (const row of rows) {
      yield row as unknown as Record<string, unknown>;
    }
    if (rows.length < pageSize) return;
    skip += pageSize;
  }
}

async function* ssoRows(
  day: ArchiveDayRange,
  pageSize = 1000
): AsyncGenerator<Record<string, unknown>> {
  let skip = 0;
  for (;;) {
    const rows = await prisma.ssoAuditEvent.findMany({
      where: { createdAt: { gte: day.fromAt, lt: day.toAt } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
    });
    if (rows.length === 0) return;
    for (const row of rows) {
      yield row as unknown as Record<string, unknown>;
    }
    if (rows.length < pageSize) return;
    skip += pageSize;
  }
}

function eventRows(stream: AuditStream, day: ArchiveDayRange) {
  return stream === "audit" ? auditRows(day) : ssoRows(day);
}

function buildManifest(input: {
  stream: AuditStream;
  day: ArchiveDayRange;
  count: number;
  digest: string;
  signature: string;
  signatureVersion: number;
  keyVersion: number;
  prevAnchorHash: string | null;
  sha256: string;
}): ArchiveManifest {
  return {
    version: 1,
    stream: input.stream,
    day: input.day.day,
    fromAt: input.day.fromAt.toISOString(),
    toAt: input.day.toAt.toISOString(),
    count: input.count,
    digest: input.digest,
    signature: createHmac("sha256", getAuditIntegrityKey(input.keyVersion))
      .update(
        `${input.prevAnchorHash ?? ""}:${input.digest}:${input.count}:${input.stream}:${input.day.day}:${input.sha256}:events.jsonl.gz`
      )
      .digest("hex"),
    signatureVersion: input.signatureVersion,
    keyVersion: input.keyVersion,
    prevAnchorHash: input.prevAnchorHash,
    sha256: input.sha256,
    createdAt: new Date().toISOString(),
    eventFile: "events.jsonl.gz",
    signatureIncludesFile: true,
  };
}

async function writeEventsFile(
  filePath: string,
  rows: AsyncIterable<Record<string, unknown>>
): Promise<{ count: number; digest: string }> {
  const digest = createHash("sha256");
  let count = 0;
  async function* lines() {
    for await (const row of rows) {
      if (count > 0) digest.update("\n");
      digest.update(stableStringify(row));
      count += 1;
      yield `${JSON.stringify(row)}\n`;
    }
  }
  await pipeline(
    Readable.from(lines()),
    createGzip({ level: 9 }),
    createWriteStream(filePath, { flags: "wx", mode: 0o600 })
  );
  await chmod(filePath, 0o600);
  return { count, digest: digest.digest("hex") };
}

async function readEventsDigest(filePath: string): Promise<{ count: number; digest: string }> {
  const rows: Record<string, unknown>[] = [];
  const reader = readline.createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    if (line.trim()) rows.push(JSON.parse(line) as Record<string, unknown>);
  }
  return { count: rows.length, digest: computeAuditDigest(rows) };
}

async function readManifest(
  root: string,
  stream: AuditStream,
  day: string
): Promise<ArchiveManifest | null> {
  const path = join(dayDir(root, stream, day), "manifest.json");
  if (!(await pathExists(path))) return null;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as ArchiveManifest;
}

export interface ArchiveDayResult {
  stream: AuditStream;
  day: string;
  created: boolean;
  verified: boolean;
  sha256: string;
  count: number;
  objectKey: string;
  backupPath?: string;
}

/**
 * 归档一天；已存在且校验通过时直接返回（幂等）。
 */
export async function archiveAuditDay(
  stream: AuditStream,
  day: ArchiveDayRange
): Promise<ArchiveDayResult> {
  const root = getAuditArchiveRoot();
  assertSafeRoot(root);
  const anchor = await prisma.auditLogAnchor.findFirst({
    where: { stream, day: day.day, signatureVersion: 2 },
    orderBy: { createdAt: "desc" },
  });
  if (!anchor) {
    throw new Error(`[AuditArchive] 缺少 v2 锚点，拒绝归档: ${stream}/${day.day}`);
  }

  const dir = dayDir(root, stream, day.day);
  const eventPath = join(dir, "events.jsonl.gz");
  const manifestPath = join(dir, "manifest.json");
  const objectKey = `${stream}/${day.day}/events.jsonl.gz`;
  let created = false;

  const existing = await readManifest(root, stream, day.day);
  if (existing) {
    const verified = await verifyArchiveDay(stream, day.day);
    if (!verified) {
      throw new Error(`[AuditArchive] 已存在的归档校验失败: ${stream}/${day.day}`);
    }
    const backupRoot = getAuditArchiveBackupRoot();
    let backupPath: string | undefined;
    if (backupRoot) {
      assertSafeRoot(backupRoot);
      const backupDir = dayDir(backupRoot, stream, day.day);
      backupPath = join(backupDir, "events.jsonl.gz");
      if (!(await verifyArchiveBackup(stream, day.day))) {
        await ensureDir(backupDir);
        await cp(eventPath, backupPath, { force: true });
        await cp(manifestPath, join(backupDir, "manifest.json"), { force: true });
        await chmod(backupPath, 0o600);
      }
    }
    if (!anchor.archivedAt || anchor.archiveSha256 !== existing.sha256) {
      await prisma.auditLogAnchor.update({
        where: { id: anchor.id },
        data: {
          archivedAt: anchor.archivedAt ?? new Date(),
          archiveSha256: existing.sha256,
          verifyStatus: "VERIFIED",
          verifiedAt: new Date(),
          objectKey,
        },
      });
    }
    return {
      stream,
      day: day.day,
      created: false,
      verified,
      sha256: existing.sha256,
      count: existing.count,
      objectKey,
      backupPath,
    };
  }

  await ensureDir(dir);
  if (await pathExists(eventPath)) {
    throw new Error(`[AuditArchive] 事件文件已存在但缺少 manifest: ${eventPath}`);
  }
  const archived = await writeEventsFile(eventPath, eventRows(stream, day));
  if (archived.count !== anchor.count || archived.digest !== anchor.digest) {
    await unlink(eventPath);
    throw new Error(`[AuditArchive] 归档内容与锚点不一致: ${stream}/${day.day}`);
  }
  const sha256 = await hashFile(eventPath);
  const manifest = buildManifest({
    stream,
    day,
    count: anchor.count,
    digest: anchor.digest,
    signature: anchor.signature,
    signatureVersion: anchor.signatureVersion,
    keyVersion: anchor.keyVersion,
    prevAnchorHash: anchor.prevAnchorHash,
    sha256,
  });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(manifestPath, 0o600);
  created = true;

  const backupRoot = getAuditArchiveBackupRoot();
  let backupPath: string | undefined;
  if (backupRoot) {
    assertSafeRoot(backupRoot);
    const backupDir = dayDir(backupRoot, stream, day.day);
    await ensureDir(backupDir);
    backupPath = join(backupDir, "events.jsonl.gz");
    await cp(eventPath, backupPath, { force: true });
    await cp(manifestPath, join(backupDir, "manifest.json"), { force: true });
    await chmod(backupPath, 0o600);
  }

  await prisma.auditLogAnchor.update({
    where: { id: anchor.id },
    data: {
      archivedAt: new Date(),
      archiveSha256: sha256,
      verifyStatus: "VERIFIED",
      verifiedAt: new Date(),
      objectKey,
    },
  });

  apiConsole.info(
    `[AuditArchive] 已归档 ${stream}/${day.day}: ${anchor.count} 条, sha256=${sha256.slice(0, 12)}…`
  );
  return {
    stream,
    day: day.day,
    created,
    verified: true,
    sha256,
    count: anchor.count,
    objectKey,
    backupPath,
  };
}

export async function verifyArchiveDay(stream: AuditStream, day: string): Promise<boolean> {
  const root = getAuditArchiveRoot();
  const manifest = await readManifest(root, stream, day);
  if (!manifest) return false;
  const dir = dayDir(root, stream, day);
  const eventPath = join(dir, manifest.eventFile || "events.jsonl.gz");
  if (!(await pathExists(eventPath))) return false;
  const sha256 = await hashFile(eventPath);
  if (sha256 !== manifest.sha256) return false;
  const archived = await readEventsDigest(eventPath);
  if (archived.count !== manifest.count || archived.digest !== manifest.digest) return false;

  const filePayload = manifest.signatureIncludesFile ? `:${sha256}:${manifest.eventFile}` : "";
  const payload = `${manifest.prevAnchorHash ?? ""}:${manifest.digest}:${manifest.count}:${manifest.stream}:${manifest.day}${filePayload}`;
  const expected = createHmac("sha256", getAuditIntegrityKey(manifest.keyVersion))
    .update(payload)
    .digest("hex");
  return expected === manifest.signature;
}

export async function verifyArchiveBackup(stream: AuditStream, day: string): Promise<boolean> {
  const backupRoot = getAuditArchiveBackupRoot();
  if (!backupRoot) return false;
  assertSafeRoot(backupRoot);
  const manifest = await readManifest(backupRoot, stream, day);
  if (!manifest) return false;
  const eventPath = join(dayDir(backupRoot, stream, day), manifest.eventFile || "events.jsonl.gz");
  if (!(await pathExists(eventPath))) return false;
  const archived = await readEventsDigest(eventPath);
  return (
    archived.count === manifest.count &&
    archived.digest === manifest.digest &&
    (await hashFile(eventPath)) === manifest.sha256
  );
}

export async function getArchiveStatus(
  stream: AuditStream,
  day: string
): Promise<{
  archived: boolean;
  verified: boolean;
  backupVerified: boolean;
  sha256: string | null;
}> {
  const manifest = await readManifest(getAuditArchiveRoot(), stream, day);
  if (!manifest) return { archived: false, verified: false, backupVerified: false, sha256: null };
  return {
    archived: true,
    verified: await verifyArchiveDay(stream, day),
    backupVerified: await verifyArchiveBackup(stream, day),
    sha256: manifest.sha256,
  };
}

/** 当前归档根与备份根，供健康检查/UI 展示。 */
export function getArchiveConfig() {
  return {
    root: getAuditArchiveRoot(),
    backupRoot: getAuditArchiveBackupRoot(),
    keyVersion: getAuditIntegrityKeyVersion(),
  };
}
