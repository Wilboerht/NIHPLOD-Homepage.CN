/**
 * Prisma 客户端单例
 * 防止在开发环境中创建多个 Prisma 实例
 * Prisma 7 需要使用 adapter 连接数据库
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import { apiConsole } from "@/lib/logger";

// 全局类型扩展
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

// 创建连接池（单例）
const isLocalDb =
  process.env.DATABASE_URL?.includes("//localhost") ||
  process.env.DATABASE_URL?.includes("//127.0.0.1") ||
  process.env.DATABASE_URL?.includes("@localhost") ||
  process.env.DATABASE_URL?.includes("@127.0.0.1");
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl:
    !isLocalDb && process.env.NODE_ENV === "production"
      ? process.env.DATABASE_SSL_CA
        ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA), rejectUnauthorized: true }
        : (() => {
            throw new Error("[Prisma] 生产环境必须设置 DATABASE_SSL_CA 环境变量指向 CA 证书路径。");
          })()
      : undefined,
  max:
    process.env.NEXT_PHASE === "phase-production-build"
      ? 2
      : process.env.DATABASE_MAX_CONNECTIONS
        ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
        : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
};

const pool = globalForPrisma.pool ?? new pg.Pool(poolConfig);

// 为每个新连接设置 statement_timeout，防止慢查询耗尽连接池
pool.on("connect", async (client) => {
  try {
    await client.query("SET statement_timeout = 30000");
  } catch {
    // 连接可能在某些模式下不支持 SET，静默失败
  }
});

// 创建 adapter
const adapter = new PrismaPg(pool);

// 创建 Prisma 客户端实例
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// 在所有环境中缓存实例，防止重复创建连接池
// 注意：Next.js 构建阶段会启动多个 worker 进程，每个进程都会有自己的单例
globalForPrisma.prisma = prisma;
globalForPrisma.pool = pool;

export default prisma;

// 非构建阶段注册优雅关闭钩子，确保连接池正确释放
if (process.env.NEXT_PHASE !== "phase-production-build" && typeof process !== "undefined") {
  const gracefulShutdown = async (signal: string) => {
    apiConsole.info(`[Prisma] 收到 ${signal}，关闭连接池...`);
    try {
      await prisma.$disconnect();
      await pool.end();
    } catch (e) {
      apiConsole.error("[Prisma] 关闭连接池失败:", e);
    }
  };

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
}
