/**
 * Token 黑名单存储抽象层
 *
 * 支持两种后端：
 * - Memory（默认）：单实例 LRU，兼容旧行为。
 * - Database（TOKEN_BLACKLIST_STORAGE=database）：基于 Prisma/PostgreSQL，
 *   多实例/容器部署时共享撤销状态。
 *
 * 设计要点：
 * - 所有查询只读；写入通过 Prisma upsert 实现。
 * - 过期记录由数据库自身 TTL 清理或业务定时清理；这里不主动删除，
 *   但查询时跳过已过期的记录。
 * - 内存缓存作为数据库不可用的 fallback，避免硬依赖 Redis。
 */
import { LRUCache } from "lru-cache";
import { prisma } from "./prisma";

const ACCESS_TOKEN_BLACKLIST_TTL_MS = 15 * 60 * 1000; // 15 分钟，与 access token 一致
const USER_BLACKLIST_TTL_MS = 15 * 60 * 1000; // 15 分钟

export type BlacklistEntryType = "access_token" | "user";

export interface TokenBlacklistStore {
  revokeAccessToken(jti: string, expiresAtMs?: number): Promise<void>;
  isAccessTokenRevoked(jti: string): Promise<boolean>;
  blacklistUser(userId: string, reason: string, expiresAtMs?: number): Promise<void>;
  isUserBlacklisted(userId: string): Promise<{ reason: string } | null>;
  removeUserBlacklist(userId: string): Promise<void>;
}

class MemoryTokenBlacklistStore implements TokenBlacklistStore {
  private userCache = new LRUCache<string, { reason: string; timestamp: number }>({
    max: 10000,
    ttl: USER_BLACKLIST_TTL_MS,
  });

  private tokenCache = new LRUCache<string, { revokedAt: number }>({
    max: 10000,
    ttl: ACCESS_TOKEN_BLACKLIST_TTL_MS,
  });

  async revokeAccessToken(jti: string): Promise<void> {
    this.tokenCache.set(jti, { revokedAt: Date.now() });
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    return this.tokenCache.has(jti);
  }

  async blacklistUser(userId: string, reason: string): Promise<void> {
    this.userCache.set(userId, { reason, timestamp: Date.now() });
  }

  async isUserBlacklisted(userId: string): Promise<{ reason: string } | null> {
    const entry = this.userCache.get(userId);
    if (!entry) return null;
    return { reason: entry.reason };
  }

  async removeUserBlacklist(userId: string): Promise<void> {
    this.userCache.delete(userId);
  }
}

class DatabaseTokenBlacklistStore implements TokenBlacklistStore {
  async revokeAccessToken(jti: string, expiresAtMs = Date.now() + ACCESS_TOKEN_BLACKLIST_TTL_MS): Promise<void> {
    const key = `at:${jti}`;
    await prisma.tokenBlacklist.upsert({
      where: { key },
      create: {
        type: "access_token",
        key,
        expiresAt: new Date(expiresAtMs),
      },
      update: {
        expiresAt: new Date(expiresAtMs),
      },
    });
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    const entry = await prisma.tokenBlacklist.findUnique({
      where: { key: `at:${jti}` },
    });
    if (!entry) return false;
    if (entry.expiresAt < new Date()) {
      // 过期记录理论上应被清理，但这里保守处理
      return false;
    }
    return entry.type === "access_token";
  }

  async blacklistUser(
    userId: string,
    reason: string,
    expiresAtMs = Date.now() + USER_BLACKLIST_TTL_MS
  ): Promise<void> {
    const key = `user:${userId}`;
    await prisma.tokenBlacklist.upsert({
      where: { key },
      create: {
        type: "user",
        key,
        reason,
        expiresAt: new Date(expiresAtMs),
      },
      update: {
        reason,
        expiresAt: new Date(expiresAtMs),
      },
    });
  }

  async isUserBlacklisted(userId: string): Promise<{ reason: string } | null> {
    const entry = await prisma.tokenBlacklist.findUnique({
      where: { key: `user:${userId}` },
    });
    if (!entry || entry.expiresAt < new Date() || entry.type !== "user") {
      return null;
    }
    return { reason: entry.reason ?? "用户已被拉黑" };
  }

  async removeUserBlacklist(userId: string): Promise<void> {
    await prisma.tokenBlacklist.deleteMany({
      where: { type: "user", key: `user:${userId}` },
    });
  }
}

function createStore(): TokenBlacklistStore {
  if (process.env.TOKEN_BLACKLIST_STORAGE === "database") {
    return new DatabaseTokenBlacklistStore();
  }
  return new MemoryTokenBlacklistStore();
}

export const tokenBlacklistStore: TokenBlacklistStore = createStore();
