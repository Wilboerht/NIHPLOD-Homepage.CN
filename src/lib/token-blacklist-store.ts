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
 * - PostgreSQL 没有 TTL 机制，过期记录由 cron-tasks.ts 的
 *   "Cleanup Expired Token Blacklist Records" 任务每小时物理删除；
 *   这里不主动删除，但查询时跳过已过期的记录。
 * - 内存缓存作为数据库不可用的 fallback，避免硬依赖 Redis。
 */
import { LRUCache } from "lru-cache";
import { prisma } from "./prisma";

const ACCESS_TOKEN_BLACKLIST_TTL_MS = 2 * 60 * 60 * 1000; // 2 小时，与 access token 一致
const USER_BLACKLIST_TTL_MS = 2 * 60 * 60 * 1000; // 2 小时，覆盖 access token 剩余有效期窗口

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

  async revokeAccessToken(jti: string, expiresAtMs?: number): Promise<void> {
    // 遵循调用方给出的真实过期时间（OAuth client 可配置 access token 最长 24h，
    // 固定 2h 会导致 TTL > 2h 的 token 在黑名单过期后重新生效）；未给出时用默认 2h
    if (expiresAtMs !== undefined) {
      const ttl = expiresAtMs - Date.now();
      if (ttl <= 0) {
        // 已过期的 token 无需拉黑（也不得回退成默认 TTL）
        this.tokenCache.delete(jti);
        return;
      }
      this.tokenCache.set(jti, { revokedAt: Date.now() }, { ttl });
      return;
    }
    this.tokenCache.set(jti, { revokedAt: Date.now() });
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    // get() 对过期条目返回 undefined，has() 对过期条目仍返回 true
    return this.tokenCache.get(jti) !== undefined;
  }

  async blacklistUser(userId: string, reason: string, expiresAtMs?: number): Promise<void> {
    // 与数据库实现同口径：管理端黑名单 TTL（默认 24h）不应被内存实现压缩成 2h
    if (expiresAtMs !== undefined) {
      const ttl = expiresAtMs - Date.now();
      if (ttl <= 0) {
        this.userCache.delete(userId);
        return;
      }
      this.userCache.set(userId, { reason, timestamp: Date.now() }, { ttl });
      return;
    }
    this.userCache.set(userId, { reason, timestamp: Date.now() });
  }

  async isUserBlacklisted(userId: string): Promise<{ reason: string } | null> {
    // get() 对过期条目返回 undefined，has() 对过期条目仍返回 true
    const entry = this.userCache.get(userId);
    if (!entry) return null;
    return { reason: entry.reason };
  }

  async removeUserBlacklist(userId: string): Promise<void> {
    this.userCache.delete(userId);
  }
}

class DatabaseTokenBlacklistStore implements TokenBlacklistStore {
  async revokeAccessToken(
    jti: string,
    expiresAtMs = Date.now() + ACCESS_TOKEN_BLACKLIST_TTL_MS
  ): Promise<void> {
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
  if (process.env.TOKEN_BLACKLIST_STORAGE === "memory") {
    return new MemoryTokenBlacklistStore();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[TokenBlacklist] 生产环境必须设置 TOKEN_BLACKLIST_STORAGE=database，" +
        "多实例部署时内存黑名单不共享，封禁/撤销状态会不一致。" +
        "若仅单实例部署，请设置 TOKEN_BLACKLIST_STORAGE=memory 以显式允许。"
    );
  }
  return new MemoryTokenBlacklistStore();
}

export const tokenBlacklistStore: TokenBlacklistStore = createStore();
