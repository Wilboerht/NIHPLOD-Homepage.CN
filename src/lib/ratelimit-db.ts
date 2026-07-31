/**
 * 基于 PostgreSQL 的限流实现
 *
 * 用于多实例部署场景，替代内存 LRU 限流。
 * 通过 Prisma 事务保证并发安全。
 *
 * 故障降级：当数据库不可用时，自动回退到内存 LRU 限流，
 * 避免 fail-open（放行） 也避免 fail-closed（全拦截）。
 */

import { prisma } from "./prisma";
import { LRUCache } from "lru-cache";
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
  const now = Date.now();
  const windowStart = new Date(now - options.windowMs);
  const reset = now + options.windowMs;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.rateLimitRecord.findFirst({
        where: {
          key: identifier,
          windowStart: { gte: windowStart },
        },
        orderBy: { windowStart: "desc" },
      });

      if (!record) {
        try {
          await tx.rateLimitRecord.create({
            data: {
              key: identifier,
              windowStart: new Date(now),
              count: 1,
            },
          });
        } catch (err: unknown) {
          // 并发唯一约束冲突时重试一次
          const isUniqueConflict =
            typeof err === "object" && err !== null &&
            ((err as { code?: string }).code === "P2002");
          if (isUniqueConflict) {
            const existing = await tx.rateLimitRecord.findFirst({
              where: { key: identifier, windowStart: { gte: windowStart } },
              orderBy: { windowStart: "desc" },
            });
            if (existing && existing.count >= options.maxRequests) {
              return { success: false, remaining: 0, reset, limit: options.maxRequests };
            }
            await tx.rateLimitRecord.update({
              where: { id: existing!.id },
              data: { count: (existing?.count || 0) + 1 },
            });
            return { success: true, remaining: options.maxRequests - (existing?.count || 0) - 1, reset, limit: options.maxRequests };
          }
          throw err;
        }

        return {
          success: true,
          remaining: options.maxRequests - 1,
          reset,
          limit: options.maxRequests,
        };
      }

      if (record.count >= options.maxRequests) {
        return {
          success: false,
          remaining: 0,
          reset,
          limit: options.maxRequests,
        };
      }

      await tx.rateLimitRecord.update({
        where: { id: record.id },
        data: { count: { increment: 1 }, updatedAt: new Date(now) },
      });

      return {
        success: true,
        remaining: options.maxRequests - record.count - 1,
        reset,
        limit: options.maxRequests,
      };
    });

    return result;
  } catch (error) {
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
    console.log(`[CleanupRateLimitRecords] 清理了 ${result.count} 条过期限流记录`);
    return result.count;
  } catch (error) {
    console.error("[CleanupRateLimitRecords] 清理失败:", error);
    return 0;
  }
}
