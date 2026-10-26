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
  if (typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function computeAuditDigest(rows: Array<Record<string, unknown>>): string {
  const payload = rows.map((row) => stableStringify(row)).join("\n");
  return createHash("sha256").update(payload).digest("hex");
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
  chainSeq: number;
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

type ChainClient = Pick<Prisma.TransactionClient, "$queryRaw" | "auditLog">;

/** 必须在事务内调用：串行化链尾读取与插入。 */
export async function prepareAuditChain(
  tx: ChainClient,
  envelope: Omit<AuditChainEnvelope, "chainSeq" | "prevHash">
): Promise<Pick<AuditChainEnvelope, "chainSeq" | "prevHash"> & { entryHash: string }> {
  // pg_advisory_xact_lock 返回 void；用常量包一层，避免 Prisma 反序列化 void 失败。
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM (SELECT pg_advisory_xact_lock(hashtext('AuditLog:chain'))) AS audit_chain_lock
  `;
  const last = await tx.auditLog.findFirst({
    where: { chainSeq: { not: null } },
    orderBy: { chainSeq: "desc" },
    select: { chainSeq: true, entryHash: true },
  });
  const chainSeq = (last?.chainSeq ?? 0) + 1;
  const prevHash = last?.entryHash ?? null;
  const entryHash = computeAuditEntryHash({ ...envelope, chainSeq, prevHash });
  return { chainSeq, prevHash, entryHash };
}
