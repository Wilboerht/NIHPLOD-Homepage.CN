/**
 * 基于 PostgreSQL 的限流实现
 *
 * 用于多实例部署场景，替代内存 LRU 限流。
 * 原子性：固定时间窗桶 + `INSERT ... ON CONFLICT (key, windowStart) DO UPDATE ... RETURNING`
 * 单条语句完成"取桶/自增/读取计数"，并发请求不会各自生成计数行。
 *
 * 故障降级：当数据库不可用时，自动回退到内存 LRU 限流（仅单实例语义，会记录告警）。
 */

import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { LRUCache } from "lru-cache";
import { apiConsole } from "./logger";
import type { RateLimitResult, RateLimitOptions } from "./ratelimit";

interface FallbackRecord {
  timestamps: number[];
}

const fallbackCache = new LRUCache<string, FallbackRecord>({
  max: 5000,
  ttl: 60 * 60 * 1000,
});

/**
 * 内存 LRU 降级限流（数据库不可用时的兜底方案）
 */
function fallbackRateLimit(identifier: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const reset = now + options.windowMs;

  let record = fallbackCache.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    fallbackCache.set(identifier, record);
  }

  record.timestamps = record.timestamps.filter((t) => t > windowStart);

  if (record.timestamps.length >= options.maxRequests) {
    return { success: false, remaining: 0, reset, limit: options.maxRequests };
  }

  record.timestamps.push(now);
  return {
    success: true,
    remaining: options.maxRequests - record.timestamps.length,
    reset,
    limit: options.maxRequests,
  };
}

/**
 * 数据库限流检查
 *
 * @param identifier - 唯一标识符（如 "login:192.168.1.1"）
 * @param options - 限流配置
 * @returns 限流结果
 */
export async function rateLimitDB(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const windowMs = Math.max(1, options.windowMs);
  // 固定窗口桶：同一窗口内所有请求命中同一 (key, windowStart) 行，
  // 由 ON CONFLICT 原子自增，避免"每请求一个 windowStart"导致并发重置额度
  const bucketStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketStart = new Date(bucketStartMs);
  const reset = bucketStartMs + windowMs;

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitRecord" ("id", "key", "windowStart", "count", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${identifier}, ${bucketStart}, 1, NOW(), NOW())
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitRecord"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `;

    const count = Number(rows?.[0]?.count ?? 1);
    if (count > options.maxRequests) {
      return { success: false, remaining: 0, reset, limit: options.maxRequests };
    }
    return {
      success: true,
      remaining: Math.max(0, options.maxRequests - count),
      reset,
      limit: options.maxRequests,
    };
  } catch (error) {
    // DB 不可用：降级为单实例内存限流（多实例下额度会放大，记录告警）
    console.error("[RateLimitDB] 数据库异常，降级到内存限流:", error);
    return fallbackRateLimit(identifier, options);
  }
}

/**
 * 清理过期的限流记录
 * @returns 清理的记录数
 */
export async function cleanupRateLimitRecords(): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.rateLimitRecord.deleteMany({
      where: {
        windowStart: { lt: oneHourAgo },
      },
    });
    apiConsole.info(`[CleanupRateLimitRecords] 清理了 ${result.count} 条过期限流记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupRateLimitRecords] 清理失败:", error);
    throw error;
  }
}
