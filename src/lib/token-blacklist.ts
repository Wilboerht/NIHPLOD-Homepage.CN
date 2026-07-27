/**
 * Access Token 黑名单缓存
 *
 * 当管理员封禁用户时，短期 access token（15 分钟 TTL）仍有效。
 * 通过此黑名单在 verifyUserAuth 时额外检查，消除 15 分钟窗口期。
 *
 * 设计：
 * - 内存 LRU，只存被禁用户的 userId
 * - TTL 与 access token 保持一致（15 分钟），到期自动清除
 * - 最大容量 10000 条，防止内存泄漏
 */
import { LRUCache } from "lru-cache";

const TOKEN_BLACKLIST_TTL_MS = 15 * 60 * 1000; // 15 分钟

const blacklistCache = new LRUCache<string, { reason: string; timestamp: number }>({
  max: 10000,
  ttl: TOKEN_BLACKLIST_TTL_MS,
});

// 单条 access_token 撤销（RFC 7009 token revocation）
const revokedTokenCache = new LRUCache<string, { revokedAt: number }>({
  max: 10000,
  ttl: TOKEN_BLACKLIST_TTL_MS,
});

/**
 * 将用户加入 access token 黑名单（封禁/冻结时调用）
 */
export function blacklistUserTokens(userId: string, reason: string): void {
  blacklistCache.set(userId, { reason, timestamp: Date.now() });
}

/**
 * 检查用户是否在黑名单中
 * @returns null 表示不在黑名单，否则返回封禁原因
 */
export function isTokenBlacklisted(userId: string): { reason: string } | null {
  const entry = blacklistCache.get(userId);
  if (!entry) return null;
  return { reason: entry.reason };
}

/**
 * 从黑名单中移除用户（解封时调用）
 */
export function removeFromBlacklist(userId: string): void {
  blacklistCache.delete(userId);
}

/**
 * 撤销单条 access_token（RFC 7009）
 * key 为 token 的 jti claim
 */
export function revokeAccessToken(jti: string): void {
  revokedTokenCache.set(jti, { revokedAt: Date.now() });
}

/**
 * 检查 access_token 是否被撤销
 */
export function isAccessTokenRevoked(jti: string): boolean {
  return revokedTokenCache.has(jti);
}
