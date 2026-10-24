/**
 * 一次性审计 v2 回填：
 * 1) 元数据（category/riskLevel/source/finalizedAt）
 * 2) 全量哈希链（chainSeq/prevHash/entryHash/integrityKeyVersion）
 * 3) 补齐 v2 锚点（audit + sso）
 * 4) 生成每日归档
 *
 * 必须在 Migration B（触发器）之前执行。若检测到更新触发器，脚本会拒绝运行。
 *
 * 用法：
 *   npx tsx scripts/audit-backfill-v2.ts
 */
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env.production", ".env"]) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    dotenvConfig({ path, quiet: true });
    break;
  }
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getAuditActionMeta } = await import("../src/lib/audit-registry");
  const {
    computeAuditEntryHash,
    getAuditIntegrityKeyVersion,
    AUDIT_CHAIN_VERSION,
  } = await import("../src/lib/audit-chain");
  const { anchorMissingAuditDays } = await import("../src/lib/audit-integrity");
  const { archiveAuditDay } = await import("../src/lib/audit-archive");

  if (!process.env.AUDIT_INTEGRITY_HMAC_KEY && !process.env.AUDIT_INTEGRITY_HMAC_KEYS) {
    console.warn(
      "警告：未设置 AUDIT_INTEGRITY_HMAC_KEY。开发环境会使用 fallback key；生产环境会直接报错。"
    );
  }

  const rows = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  console.log(`待回填 AuditLog：${rows.length} 条`);

  const filled = rows.filter((row) => row.chainSeq !== null && row.entryHash).length;
  if (filled === rows.length && rows.length > 0) {
    console.log("哈希链已完整回填，跳过链计算。");
  } else if (filled > 0) {
    throw new Error(`检测到部分回填（${filled}/${rows.length}），请先人工检查后再运行。`);
  }

  const keyVersion = getAuditIntegrityKeyVersion();
  if (filled !== rows.length) {
  let prevHash: string | null = null;
  let chainSeq = 0;
  const updates: Array<{
    id: string;
    category: string;
    riskLevel: string;
    source: string;
    schemaVersion: number;
    chainVersion: number;
    integrityKeyVersion: number;
    chainSeq: number;
    prevHash: string | null;
    entryHash: string;
    finalizedAt: Date | null;
  }> = [];

  for (const row of rows) {
    const meta = getAuditActionMeta(row.action);
    const source =
      row.source ??
      (row.actorType === "SYSTEM"
        ? "CRON"
        : row.actorType === "INTEGRATION"
          ? "INTEGRATION"
          : "WEB");
    chainSeq += 1;
    const entryHash = computeAuditEntryHash({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      targetType: row.targetType,
      targetLabel: row.targetLabel,
      requestId: row.requestId,
      actorType: row.actorType,
      actorEmail: row.actorEmail,
      actorName: row.actorName,
      actorRole: row.actorRole,
      authMethod: row.authMethod,
      sessionJti: row.sessionJti,
      adminId: row.adminId,
      userId: row.userId,
      category: row.category ?? meta.category,
      riskLevel: row.riskLevel ?? meta.riskLevel,
      source,
      schemaVersion: row.schemaVersion ?? 2,
      chainVersion: AUDIT_CHAIN_VERSION,
      integrityKeyVersion: keyVersion,
      chainSeq,
      prevHash,
    });
    updates.push({
      id: row.id,
      category: row.category ?? meta.category,
      riskLevel: row.riskLevel ?? meta.riskLevel,
      source,
      schemaVersion: row.schemaVersion ?? 2,
      chainVersion: AUDIT_CHAIN_VERSION,
      integrityKeyVersion: keyVersion,
      chainSeq,
      prevHash,
      entryHash,
      finalizedAt:
        row.finalizedAt ?? (row.outcome !== "PENDING" ? row.createdAt : null),
    });
    prevHash = entryHash;
  }

  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.auditLog.update({
          where: { id: item.id },
          data: {
            category: item.category,
            riskLevel: item.riskLevel,
            source: item.source,
            schemaVersion: item.schemaVersion,
            chainVersion: item.chainVersion,
            integrityKeyVersion: item.integrityKeyVersion,
            chainSeq: item.chainSeq,
            prevHash: item.prevHash,
            entryHash: item.entryHash,
            finalizedAt: item.finalizedAt,
          },
        })
      )
    );
    console.log(`  链回填 ${Math.min(i + 100, updates.length)}/${updates.length}`);
  }
  }

  console.log("补齐 v2 锚点...");
  const anchored = await anchorMissingAuditDays({ maxDays: 3650 });
  console.log(`  新增锚点 ${anchored.created.length} 个，截至 ${anchored.lastDay}`);

  console.log("生成缺失归档...");
  const anchors = await prisma.auditLogAnchor.findMany({
    where: { signatureVersion: 2 },
    orderBy: [{ day: "asc" }, { stream: "asc" }],
  });
  let archived = 0;
  for (const anchor of anchors) {
    if (anchor.archivedAt) continue;
    const day = anchor.day;
    const [year, month, date] = day.split("-").map(Number);
    const fromAt = new Date(Date.UTC(year, month - 1, date) - 8 * 60 * 60 * 1000);
    const result = await archiveAuditDay(anchor.stream as "audit" | "sso", {
      day,
      fromAt,
      toAt: new Date(fromAt.getTime() + 24 * 60 * 60 * 1000),
    });
    if (!result.verified) {
      throw new Error(`归档校验失败: ${anchor.stream}/${day}`);
    }
    archived += 1;
  }
  console.log(`  新增归档 ${archived} 个`);

  const pending = await prisma.auditLog.count({ where: { outcome: "PENDING" } });
  console.log(`回填完成。PENDING=${pending}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[audit-backfill-v2] 失败:", error);
  process.exit(1);
});
