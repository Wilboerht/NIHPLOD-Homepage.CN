/**
 * 一次性回填主站 PrivacyConsent → ConsentEvent。
 *
 * 用法：
 *   npx tsx scripts/backfill-consent-events.ts          # dry-run
 *   npx tsx scripts/backfill-consent-events.ts --apply  # 写入
 *
 * 回填规则：
 * - 未撤回：写一条 GRANTED
 * - 已撤回：写 GRANTED + REVOKED
 * - 已存在同用户/协议/版本/渠道/动作/时间的记录则跳过
 */
import dotenv from "dotenv";
import { createHmac } from "crypto";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

type Project = "MAIN" | "POINTS" | "SKIN" | "KF" | "BA" | "RECRUIT" | "UNKNOWN";

function maskId(value: string): string {
  return value.length <= 8 ? "***" : `${value.slice(0, 8)}…`;
}

function projectForChannel(channel: string): Project {
  if (channel === "web") return "MAIN";
  if (channel === "wechat-mp-points") return "POINTS";
  if (channel === "wechat-mp-skin") return "SKIN";
  if (channel === "q6n4aitms0wgn2sz1nj96au5") return "SKIN";
  if (channel === "wecom-kf") return "KF";
  if (channel === "ba") return "BA";
  return "UNKNOWN";
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");
  const hmacKey = process.env.LOGIN_ATTEMPT_HMAC_KEY;
  if (!hmacKey) {
    throw new Error("缺少 LOGIN_ATTEMPT_HMAC_KEY，无法生成 subjectHash");
  }
  const subjectHash = (value: string) =>
    createHmac("sha256", hmacKey).update(value, "utf8").digest("hex");

  const apply = process.argv.includes("--apply");
  const rows = await prisma.privacyConsent.findMany({
    orderBy: { grantedAt: "asc" },
    select: {
      userId: true,
      document: true,
      version: true,
      channel: true,
      contentHash: true,
      grantedAt: true,
      revokedAt: true,
      ipHash: true,
      userAgent: true,
      evidence: true,
    },
  });

  async function createIfMissing(input: {
    userId: string;
    document: "PRIVACY" | "TERMS" | "MARKETING";
    version: string;
    channel: string;
    contentHash: string | null;
    action: "GRANTED" | "REVOKED";
    occurredAt: Date;
    ipHash: string | null;
    userAgent: string | null;
    evidence: unknown;
  }): Promise<boolean> {
    const existing = await prisma.consentEvent.findFirst({
      where: {
        userId: input.userId,
        document: input.document,
        version: input.version,
        channel: input.channel,
        action: input.action,
        occurredAt: input.occurredAt,
      },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.consentEvent.create({
      data: {
        userId: input.userId,
        subjectType: "USER",
        subjectHash: subjectHash(input.userId),
        project: projectForChannel(input.channel),
        document: input.document,
        version: input.version,
        contentHash: input.contentHash,
        action: input.action,
        channel: input.channel,
        occurredAt: input.occurredAt,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        evidence: (input.evidence ?? undefined) as never,
      },
    });
    return true;
  }

  let created = 0;
  for (const row of rows) {
    const base = {
      userId: row.userId,
      document: row.document,
      version: row.version,
      channel: row.channel,
      contentHash: row.contentHash,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
      evidence: row.evidence,
    };

    if (apply) {
      if (await createIfMissing({ ...base, action: "GRANTED", occurredAt: row.grantedAt })) {
        created += 1;
      }
      if (
        row.revokedAt &&
        (await createIfMissing({ ...base, action: "REVOKED", occurredAt: row.revokedAt }))
      ) {
        created += 1;
      }
    } else {
      console.log(
        `[dry-run] ${maskId(row.userId)} ${row.document} v${row.version} ${row.channel} ` +
          `${row.revokedAt ? "GRANTED+REVOKED" : "GRANTED"}`
      );
    }
  }

  console.log(
    apply
      ? `[backfill] 完成，新增 ${created} 条 ConsentEvent`
      : `[dry-run] 共 ${rows.length} 条 PrivacyConsent；确认后加 --apply`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[backfill] 失败:", error);
  process.exitCode = 1;
});
