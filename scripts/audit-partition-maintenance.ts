import "./load-env";
import pg from "pg";

function readAhead(): number {
  const raw = Number(
    process.argv.find((arg) => arg.startsWith("--create-ahead="))?.split("=")[1] ?? 3
  );
  return Number.isInteger(raw) && raw > 0 && raw <= 36 ? raw : 3;
}

function monthName(date: Date): string {
  return `AuditLog_${date.getUTCFullYear()}_${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("未配置 DATABASE_URL");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const partitioned = await client.query(
      `SELECT 1 FROM pg_partitioned_table pt
       JOIN pg_class c ON c.oid = pt.partrelid
       WHERE c.relname = 'AuditLog' LIMIT 1`
    );
    if (partitioned.rowCount === 0) {
      throw new Error('"AuditLog" 尚未分区，请先执行分区迁移');
    }

    await client.query("SET TIME ZONE 'UTC'");
    const ahead = readAhead();
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let offset = 0; offset <= ahead; offset += 1) {
      const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
      const name = monthName(from);
      console.log(
        `[Partitions] ${name}: ${from.toISOString().slice(0, 10)} ~ ${to
          .toISOString()
          .slice(0, 10)}`
      );
      if (process.argv.includes("--plan")) continue;
      const fromLiteral = from.toISOString().slice(0, 19).replace("T", " ");
      const toLiteral = to.toISOString().slice(0, 19).replace("T", " ");
      await client.query(
        `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "AuditLog" FOR VALUES FROM ('${fromLiteral}') TO ('${toLiteral}')`
      );
    }
    if (process.argv.includes("--plan")) {
      console.log("[Partitions] 仅计划模式，未执行 DDL");
    } else {
      console.log("[Partitions] 已完成");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[Partitions] 失败:", error);
  process.exitCode = 1;
});
