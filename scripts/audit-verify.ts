/**
 * 校验审计完整性（哈希链 + 锚点 + 归档）。
 *
 * 用法：
 *   npx tsx scripts/audit-verify.ts --day 2026-10-23
 *   npx tsx scripts/audit-verify.ts --from 2026-10-01 --to 2026-10-24
 *   npx tsx scripts/audit-verify.ts --day 2026-10-23 --stream sso
 */
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env.production", ".env"]) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, date) + amount * 24 * 60 * 60 * 1000);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate()
  ).padStart(2, "0")}`;
}

async function main() {
  const { verifyAuditDay } = await import("../src/lib/audit-integrity");
  const streamArg = arg("stream") ?? "all";
  const streams: Array<"audit" | "sso"> =
    streamArg === "audit" || streamArg === "sso" ? [streamArg] : ["audit", "sso"];
  const day = arg("day");
  const from = arg("from");
  const to = arg("to");
  if (!day && (!from || !to)) {
    console.error("用法: --day YYYY-MM-DD 或 --from YYYY-MM-DD --to YYYY-MM-DD");
    process.exit(2);
  }

  const days: string[] = [];
  if (day) days.push(day);
  else {
    let cursor = from!;
    let guard = 0;
    while (cursor <= to! && guard < 3650) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }

  let failed = 0;
  for (const item of days) {
    for (const stream of streams) {
      const result = await verifyAuditDay(stream, item);
      const ok = result.verified;
      console.log(
        `${ok ? "OK " : "FAIL"} ${stream}/${item} count=${result.count} archive=${result.archiveVerified} backup=${result.backupVerified}${result.error ? ` error=${result.error}` : ""}`
      );
      if (!ok) failed += 1;
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("[audit-verify] 失败:", error);
  process.exit(1);
});
