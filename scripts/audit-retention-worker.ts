/**
 * 审计到期清理 worker。
 *
 * 由系统 cron 以 root 运行；retention 连接串放在 root-only 文件：
 *   /etc/nihplod/audit-retention.env
 *
 * 示例 crontab：
 *   * * * * * root cd /var/www/NIHPLOD-Homepage.CN && /usr/local/bin/node node_modules/.bin/tsx \
 *     scripts/audit-retention-worker.ts >> /var/log/nihplod-audit-retention.log 2>&1
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

const secureEnv = process.env.AUDIT_RETENTION_ENV_FILE || "/etc/nihplod/audit-retention.env";
if (existsSync(secureEnv)) {
  dotenvConfig({ path: secureEnv, override: true, quiet: true });
}

async function main() {
  if (process.env.AUDIT_RETENTION_ENABLED !== "true") {
    console.log("[audit-retention-worker] AUDIT_RETENTION_ENABLED != true，跳过");
    return;
  }
  if (!process.env.AUDIT_RETENTION_DATABASE_URL) {
    throw new Error("缺少 AUDIT_RETENTION_DATABASE_URL");
  }
  const { processAuditRetentionJobs } = await import("../src/lib/audit-retention-worker");
  const count = await processAuditRetentionJobs();
  if (count > 0) console.log(`[audit-retention-worker] 处理 ${count} 个任务`);
}

main().catch((error) => {
  console.error("[audit-retention-worker] 失败:", error);
  process.exit(1);
});
