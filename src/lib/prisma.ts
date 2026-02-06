/**
 * Prisma 客户端单例
 * 防止在开发环境中创建多个 Prisma 实例
 * Prisma 7 需要使用 adapter 连接数据库
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 全局类型扩展
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

// 创建连接池（单例）
// 创建连接池（单例）
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // 连接池优化配置
  // 生产环境：限制最大连接数
  // 建议值：
  // 2核4G -> 10
  // 4核8G -> 20-30
  // 公式：CPU核心数 * 2 + 磁盘IO并发数
  max: process.env.DATABASE_MAX_CONNECTIONS
    ? parseInt(process.env.DATABASE_MAX_CONNECTIONS)
    : (process.env.NODE_ENV === "production" ? 20 : 10),
  // 连接空闲 30秒后释放，节省资源
  idleTimeoutMillis: 30000,
  // 获取连接等待超时 10秒，避免请求长时间卡死
  connectionTimeoutMillis: 10000,
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

// 在开发环境中缓存实例，防止热更新时创建多个连接
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export default prisma;
