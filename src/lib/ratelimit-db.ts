/**
 * 基于 PostgreSQL 的限流实现
 *
 * 用于多实例部署场景，替代内存 LRU 限流。
 * 通过 Prisma 事务保证并发安全。
 */

import { prisma } from "./prisma";
import type { RateLimitResult, RateLimitOptions } from "./ratelimit";

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
      // 1. 查找当前窗口内的记录
      const record = await tx.rateLimitRecord.findFirst({
        where: {
          key: identifier,
          windowStart: { gte: windowStart },
        },
        orderBy: { windowStart: "desc" },
      });

      if (!record) {
        // 2. 没有记录或已过期，创建新窗口
        await tx.rateLimitRecord.create({
          data: {
            key: identifier,
            windowStart: new Date(now),
            count: 1,
          },
        });

        return {
          success: true,
          remaining: options.maxRequests - 1,
          reset,
          limit: options.maxRequests,
        };
      }

      // 3. 检查是否超过限制
      if (record.count >= options.maxRequests) {
        return {
          success: false,
          remaining: 0,
          reset,
          limit: options.maxRequests,
        };
      }

      // 4. 增加计数
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
    console.error("[RateLimitDB] 限流检查失败:", error);
    // 数据库异常时放行，避免阻塞正常请求
    return {
      success: true,
      remaining: 0,
      reset,
      limit: options.maxRequests,
    };
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
