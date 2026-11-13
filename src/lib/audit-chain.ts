/**
 * 审计日志哈希链。
 *
 * entryHash 覆盖「不可变信封」，不覆盖 outcome/detail/targetId/finalizedAt
 * （这些字段允许 PENDING → 终态时更新）；完整记录由每日锚点覆盖。
 */
import { createHash, createHmac } from "crypto";
import type { Prisma } from "@/generated/prisma/client";

export const AUDIT_CHAIN_VERSION = 1;

function devFallbackKey(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[AuditChain] 缺少 AUDIT_INTEGRITY_HMAC_KEY（生产环境至少 32 字符），拒绝写入审计链"
    );
  }
  return "dev-only-audit-integrity-key-32chars!!";
}

/** 支持按版本轮换密钥：AUDIT_INTEGRITY_HMAC_KEYS='{"1":"...","2":"..."}' */
export function getAuditIntegrityKey(version = getAuditIntegrityKeyVersion()): string {
  const keyring = process.env.AUDIT_INTEGRITY_HMAC_KEYS;
  if (keyring) {
    try {
      const parsed = JSON.parse(keyring) as Record<string, string>;
      const key = parsed[String(version)];
      if (key && key.length >= 32) return key;
    } catch {
      throw new Error("[AuditChain] AUDIT_INTEGRITY_HMAC_KEYS 不是合法 JSON");
    }
  }
  const key = process.env.AUDIT_INTEGRITY_HMAC_KEY;
  if (key && key.length >= 32) return key;
  return devFallbackKey();
}

export function getAuditIntegrityKeyVersion(): number {
  const raw = Number(process.env.AUDIT_INTEGRITY_HMAC_KEY_VERSION ?? 1);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  // chainSeq 从 Int 迁移为 BigInt 后必须与历史摘要保持一致：数字不带引号。
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export interface AuditDigestHasher {
  update(row: Record<string, unknown>): void;
  digest(): string;
}

export function createAuditDigestHasher(): AuditDigestHasher {
  const hash = createHash("sha256");
  let first = true;
  let finalized = false;
  return {
    update(row) {
      if (finalized) throw new Error("AUDIT_DIGEST_ALREADY_FINALIZED");
      if (!first) hash.update("\n");
      hash.update(stableStringify(row));
      first = false;
    },
    digest() {
      finalized = true;
      return hash.digest("hex");
    },
  };
}

export function computeAuditDigest(rows: Array<Record<string, unknown>>): string {
  const hasher = createAuditDigestHasher();
  for (const row of rows) hasher.update(row);
  return hasher.digest();
}

export interface AuditChainEnvelope {
  id: string;
  createdAt: Date;
  action: string;
  targetType: string;
  targetLabel?: string | null;
  requestId?: string | null;
  actorType: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  authMethod?: string | null;
  sessionJti?: string | null;
  adminId?: string | null;
  userId?: string | null;
  category?: string | null;
  riskLevel?: string | null;
  source?: string | null;
  schemaVersion?: number;
  chainVersion?: number;
  integrityKeyVersion?: number;
  chainSeq: bigint;
  prevHash: string | null;
}

export function computeAuditEntryHash(envelope: AuditChainEnvelope): string {
  const keyVersion = envelope.integrityKeyVersion ?? 1;
  const payload = stableStringify({
    id: envelope.id,
    createdAt: envelope.createdAt,
    action: envelope.action,
    targetType: envelope.targetType,
    targetLabel: envelope.targetLabel ?? null,
    requestId: envelope.requestId ?? null,
    actorType: envelope.actorType,
    actorEmail: envelope.actorEmail ?? null,
    actorName: envelope.actorName ?? null,
    actorRole: envelope.actorRole ?? null,
    authMethod: envelope.authMethod ?? null,
    sessionJti: envelope.sessionJti ?? null,
    adminId: envelope.adminId ?? null,
    userId: envelope.userId ?? null,
    category: envelope.category ?? null,
    riskLevel: envelope.riskLevel ?? null,
    source: envelope.source ?? null,
    schemaVersion: envelope.schemaVersion ?? 2,
    chainVersion: envelope.chainVersion ?? AUDIT_CHAIN_VERSION,
    integrityKeyVersion: keyVersion,
    chainSeq: envelope.chainSeq,
    prevHash: envelope.prevHash,
  });
  return createHmac("sha256", getAuditIntegrityKey(keyVersion)).update(payload).digest("hex");
}

type ChainClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/** 必须在事务内调用：通过游标行锁串行分配链序号，避免全表链尾查询。 */
export async function prepareAuditChain(
  tx: ChainClient,
  envelope: Omit<AuditChainEnvelope, "chainSeq" | "prevHash">
): Promise<Pick<AuditChainEnvelope, "chainSeq" | "prevHash"> & { entryHash: string }> {
  await tx.$executeRaw`
    INSERT INTO "AuditChainCursor" ("stream", "seq", "lastHash", "updatedAt")
    VALUES ('audit', 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT ("stream") DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ seq: bigint | number; lastHash: string | null }>>`
    SELECT "seq", "lastHash"
    FROM "AuditChainCursor"
    WHERE "stream" = 'audit'
    FOR UPDATE
  `;
  const chainSeq = BigInt(rows[0]?.seq ?? 0) + BigInt(1);
  const prevHash = rows[0]?.lastHash ?? null;
  const entryHash = computeAuditEntryHash({ ...envelope, chainSeq, prevHash });
  await tx.$executeRaw`
    UPDATE "AuditChainCursor"
    SET "seq" = ${chainSeq}, "lastHash" = ${entryHash}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "stream" = 'audit'
  `;
  return { chainSeq, prevHash, entryHash };
}
