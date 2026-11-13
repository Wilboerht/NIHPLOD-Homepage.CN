import "./load-env";
import pg from "pg";
import { concurrentIndexes } from "../prisma/index-manifest";

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCreateSql(index: (typeof concurrentIndexes)[number]): string {
  const unique = index.unique ? "UNIQUE " : "";
  const method = index.method === "gin" ? " USING gin" : "";
  const where = index.where ? ` WHERE ${index.where}` : "";
  return `CREATE ${unique}INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdent(index.name)} ON ${quoteIdent(
    index.table
  )}${method} (${index.columns})${where}`;
}

async function indexState(
  client: pg.Client,
  name: string
): Promise<{ exists: boolean; valid: boolean }> {
  const result = await client.query<{ indisvalid: boolean }>(
    `SELECT i.indisvalid
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = $1`,
    [name]
  );
  return { exists: (result.rowCount ?? 0) > 0, valid: result.rows[0]?.indisvalid ?? false };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("未配置 DATABASE_URL");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const trgm = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`);
    if (trgm.rowCount === 0) {
      console.warn("[Indexes] pg_trgm 未安装，GIN 索引将跳过；请联系 DBA 安装后重跑");
    }

    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = 0");

    for (const index of concurrentIndexes) {
      if (index.method === "gin" && trgm.rowCount === 0) continue;
      const state = await indexState(client, index.name);
      if (state.exists && state.valid) {
        console.log(`[Indexes] 已存在且有效: ${index.name}`);
        continue;
      }
      if (state.exists && !state.valid) {
        console.warn(`[Indexes] 发现无效索引，删除后重建: ${index.name}`);
        await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(index.name)}`);
      }
      const sql = buildCreateSql(index);
      console.log(`[Indexes] 创建: ${index.name}`);
      try {
        await client.query(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("pg_trgm")) {
          console.warn(`[Indexes] 跳过（pg_trgm 不可用）: ${index.name}`);
          continue;
        }
        throw error;
      }
    }

    console.log("[Indexes] 完成");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[Indexes] 失败:", error);
  process.exitCode = 1;
});
