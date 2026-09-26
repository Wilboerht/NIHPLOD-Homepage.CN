/**
 * Access Token 黑名单缓存（多实例安全版本）
 *
 * 当管理员封禁用户时，短期 access token（2 小时 TTL）仍有效。
 * 通过此黑名单在 verifyUserAuth / verifyOAuthAccessToken 时额外检查，消除 2 小时窗口期。
 *
 * 后端实现由 token-blacklist-store.ts 统一管理：
 * - 默认 Memory（单实例 LRU），兼容旧行为。
 * - 生产环境设置 TOKEN_BLACKLIST_STORAGE=database 使用 Prisma/PostgreSQL，
 *   多实例/容器部署时共享撤销状态。
 */
import { tokenBlacklistStore } from "./token-blacklist-store";

/**
 * 将用户加入 access token 黑名单（封禁/冻结时调用）
 */
export async function blacklistUserTokens(userId: string, reason: string): Promise<void> {
  await tokenBlacklistStore.blacklistUser(userId, reason);
}

/**
 * 将管理员加入 token 黑名单（禁用/删除时调用）
 * 默认 24 小时 TTL，与 admin JWT 过期时间一致
 */
export async function blacklistAdminTokens(
  adminId: string,
  reason: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  await tokenBlacklistStore.blacklistUser(adminId, reason, ttlMs);
}

/**
 * 检查用户是否在黑名单中
 * @returns null 表示不在黑名单，否则返回封禁原因
 */
export async function isTokenBlacklisted(userId: string): Promise<{ reason: string } | null> {
  return tokenBlacklistStore.isUserBlacklisted(userId);
}

/**
 * 从黑名单中移除用户（解封时调用）
 */
export async function removeFromBlacklist(userId: string): Promise<void> {
  await tokenBlacklistStore.removeUserBlacklist(userId);
}

/**
 * 撤销单条 access_token（RFC 7009）
 * key 为 token 的 jti claim
 *
 * @param expiresAtMs - token 的真实过期时间（毫秒时间戳）。OAuth client 可配置
 *   access token 最长 24h，必须传入 exp 生成的黑名单 TTL，否则固定 2h 会在
 *   黑名单过期后让仍有效的 token 重新可用；省略时回退默认 2h。
 */
export async function revokeAccessToken(jti: string, expiresAtMs?: number): Promise<void> {
  await tokenBlacklistStore.revokeAccessToken(jti, expiresAtMs);
}

/**
 * 检查 access_token 是否被撤销
 */
export async function isAccessTokenRevoked(jti: string): Promise<boolean> {
  return tokenBlacklistStore.isAccessTokenRevoked(jti);
}

// 同步兼容导出（仅在确认单实例内存模式时使用）
export { tokenBlacklistStore };
