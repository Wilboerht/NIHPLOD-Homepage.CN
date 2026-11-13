import "./load-env";
import pg from "pg";
import { concurrentIndexes } from "../prisma/index-manifest";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("未配置 DATABASE_URL");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const trgm = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`);
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const index of concurrentIndexes) {
      if (index.method === "gin" && trgm.rowCount === 0) {
        console.warn(`[Indexes] 跳过检查（pg_trgm 未安装）: ${index.name}`);
        continue;
      }
      const result = await client.query<{ indisvalid: boolean }>(
        `SELECT i.indisvalid
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = $1`,
        [index.name]
      );
      if (result.rowCount === 0) missing.push(index.name);
      else if (!result.rows[0]?.indisvalid) invalid.push(index.name);
    }

    if (invalid.length > 0) {
      console.error(`[Indexes] 无效索引: ${invalid.join(", ")}`);
    }
    if (missing.length > 0) {
      console.error(`[Indexes] 缺失索引: ${missing.join(", ")}`);
    }
    if (invalid.length > 0 || missing.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log("[Indexes] 所有清单索引均存在且有效");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[Indexes] 检查失败:", error);
  process.exitCode = 1;
});
