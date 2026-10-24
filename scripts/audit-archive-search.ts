/**
 * 查询本地审计归档（过期清理后使用）。
 *
 * 用法：
 *   npx tsx scripts/audit-archive-search.ts --day 2026-10-23 --action delete_admin
 *   npx tsx scripts/audit-archive-search.ts --day 2026-10-23 --userId user_xxx
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const day = arg("day");
  const stream = arg("stream") ?? "audit";
  if (!day || (stream !== "audit" && stream !== "sso")) {
    console.error("用法: --day YYYY-MM-DD [--stream audit|sso] [--action X] [--userId X] [--targetId X]");
    process.exit(2);
  }
  const root = process.env.AUDIT_ARCHIVE_DIR || join(process.cwd(), "var", "audit-archive");
  const file = join(root, stream, day, "events.jsonl.gz");
  const action = arg("action");
  const userId = arg("userId");
  const targetId = arg("targetId");
  const requestId = arg("requestId");

  const rl = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let matched = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (action && row.action !== action) continue;
    if (userId && row.userId !== userId) continue;
    if (targetId && row.targetId !== targetId) continue;
    if (requestId && row.requestId !== requestId) continue;
    matched += 1;
    console.log(JSON.stringify(row));
  }
  console.error(`[audit-archive-search] ${file} 命中 ${matched} 条`);
}

main().catch((error) => {
  console.error("[audit-archive-search] 失败:", error);
  process.exit(1);
});
