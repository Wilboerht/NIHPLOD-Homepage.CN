/**
 * SDK 降级策略
 *
 * 主站不可用时（连续 3 次请求失败），使用本地缓存的 id_token claims
 * 维持用户基本信息展示（TTL 5 分钟）。
 */

// ============================================
// Types
// ============================================

export interface DegradationCacheEntry {
  /** 缓存的 id_token claims */
  claims: Record<string, unknown>;
  /** 缓存时间戳 */
  cachedAt: number;
  /** 缓存有效期（毫秒） */
  ttlMs: number;
}

export interface DegradationOptions {
  /** 触发降级的连续失败次数（默认 3） */
  failureThreshold?: number;
  /** 降级缓存 TTL（默认 5 分钟） */
  cacheTtlMs?: number;
  /** 进入降级模式回调 */
  onEnterDegraded?: () => void;
  /** 退出降级模式回调 */
  onExitDegraded?: () => void;
}

// ============================================
// DegradationManager
// ============================================

export class DegradationManager {
  private failureThreshold: number;
  private cacheTtlMs: number;
  private onEnterDegraded?: () => void;
  private onExitDegraded?: () => void;

  private consecutiveFailures = 0;
  private isDegraded = false;
  private cachedClaims: Record<string, unknown> | null = null;
  private cachedAt = 0;

  constructor(options: DegradationOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000; // 5 分钟
    this.onEnterDegraded = options.onEnterDegraded;
    this.onExitDegraded = options.onExitDegraded;
  }

  /** 记录一次请求成功，重置失败计数 */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.isDegraded) {
      this.isDegraded = false;
      this.onExitDegraded?.();
    }
  }

  /** 记录一次请求失败，达到阈值后进入降级模式 */
  recordFailure(): boolean {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold && !this.isDegraded) {
      this.isDegraded = true;
      this.onEnterDegraded?.();
      return true;
    }
    return false;
  }

  /** 缓存 id_token claims 用于降级展示 */
  cacheIdTokenClaims(claims: Record<string, unknown>): void {
    this.cachedClaims = claims;
    this.cachedAt = Date.now();
  }

  /** 获取缓存的 claims（降级模式下使用） */
  getCachedClaims(): Record<string, unknown> | null {
    if (!this.cachedClaims) return null;
    if (Date.now() - this.cachedAt > this.cacheTtlMs) {
      this.cachedClaims = null;
      return null;
    }
    return this.cachedClaims;
  }

  /** 是否处于降级模式 */
  get degraded(): boolean {
    return this.isDegraded;
  }

  /** 连续失败次数 */
  get failures(): number {
    return this.consecutiveFailures;
  }

  /** 重置所有状态 */
  reset(): void {
    this.consecutiveFailures = 0;
    this.isDegraded = false;
    this.cachedClaims = null;
    this.cachedAt = 0;
  }
}
