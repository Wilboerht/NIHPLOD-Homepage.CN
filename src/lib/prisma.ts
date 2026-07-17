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
const isLocalDb = process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1");
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // 生产环境强制开启 SSL 以确保与云数据库握手稳健
  // 本地数据库 (localhost/127.0.0.1)  exempt，因为通常不启用 SSL
  // 安全建议：通过 DATABASE_SSL_CA 环境变量指定 CA 证书路径，避免 rejectUnauthorized: false 的中间人风险
  // 阿里云 RDS: 下载 CA 证书并设置 DATABASE_SSL_CA=/path/to/rds-ca.pem
  ssl:
    !isLocalDb && process.env.NODE_ENV === "production"
      ? process.env.DATABASE_SSL_CA
        ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA) }
        : { rejectUnauthorized: false }
      : undefined,
  // 连接池优化配置：在构建阶段会有高并发的 DB 请求
  max: process.env.NEXT_PHASE === "phase-production-build"
    ? 2
    : process.env.DATABASE_MAX_CONNECTIONS
      ? parseInt(process.env.DATABASE_MAX_CONNECTIONS)
      : 10, // 降低默认连接数，防止构建时并行进程过载导致数据库连接被服务端断开
  // 连接空闲 30秒后释放，节省资源
  idleTimeoutMillis: 30000,
  // 获取连接等待超时 30秒，避免请求长时间卡死
  connectionTimeoutMillis: 30000,
  // 语句执行超时 30秒，防止慢查询耗尽连接池
  statement_timeout: 30000,
};

const pool =
  globalForPrisma.pool ??
  new pg.Pool(poolConfig);

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
    console.log(`[Prisma] 收到 ${signal}，关闭连接池...`);
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

