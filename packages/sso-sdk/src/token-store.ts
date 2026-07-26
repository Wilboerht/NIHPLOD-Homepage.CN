/**
 * Token 存储接口与实现
 *
 * 提供内存和文件两种 Token 存储方式。
 * Token 过期前 60 秒自动触发刷新，并发刷新使用互斥锁防止重复请求。
 */
import { createHash } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ============================================
// Types
// ============================================

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp (ms)
  idToken?: string;
  scope?: string;
}

export interface TokenStore {
  get(key: string): Promise<TokenData | null>;
  set(key: string, data: TokenData): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ============================================
// InMemoryTokenStore
// ============================================

export class InMemoryTokenStore implements TokenStore {
  private store = new Map<string, TokenData>();

  async get(key: string): Promise<TokenData | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, data: TokenData): Promise<void> {
    this.store.set(key, data);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

// ============================================
// FileTokenStore（可选）
// ============================================

export class FileTokenStore implements TokenStore {
  private filePath: string;
  private cache: Map<string, TokenData>;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.cache = new Map();
    this.loadSync();
  }

  private loadSync(): void {
    try {
      const fs = require("fs");
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const data = JSON.parse(raw);
        for (const [key, value] of Object.entries(data)) {
          this.cache.set(key, value as TokenData);
        }
      }
    } catch {
      // 文件不存在或解析失败，使用空缓存
    }
  }

  private saveSync(): void {
    try {
      const fs = require("fs");
      const dir = require("path").dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: Record<string, TokenData> = {};
      for (const [key, value] of this.cache) {
        data[key] = value;
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // 写入失败静默处理
    }
  }

  async get(key: string): Promise<TokenData | null> {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, data: TokenData): Promise<void> {
    this.cache.set(key, data);
    this.saveSync();
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.saveSync();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.saveSync();
  }
}

// ============================================
// Token 刷新互斥锁
// ============================================

export class RefreshMutex {
  private locks = new Map<string, Promise<TokenData | null>>();

  /**
   * 确保同一 key 的刷新操作只执行一次。
   * 并发调用时，后续调用等待首次刷新完成并共享结果。
   */
  async acquire(
    key: string,
    refreshFn: () => Promise<TokenData | null>
  ): Promise<TokenData | null> {
    const existing = this.locks.get(key);
    if (existing) {
      return existing;
    }

    const promise = refreshFn().finally(() => {
      this.locks.delete(key);
    });

    this.locks.set(key, promise);
    return promise;
  }
}

// ============================================
// Token 自动刷新管理器
// ============================================

export interface AutoRefreshOptions {
  /** 提前多少毫秒触发刷新（默认 60000 = 60 秒） */
  refreshAheadMs?: number;
  /** 刷新回调：用 refreshToken 换取新的 token 对 */
  refreshFn: (refreshToken: string) => Promise<TokenData | null>;
  /** Token 存储 */
  store: TokenStore;
  /** 存储 key */
  key?: string;
  /** Token 刷新后回调 */
  onRefreshed?: (data: TokenData) => void;
  /** Token 刷新失败回调 */
  onRefreshFailed?: (error: Error) => void;
}

export class AutoRefreshManager {
  private refreshAheadMs: number;
  private refreshFn: (refreshToken: string) => Promise<TokenData | null>;
  private store: TokenStore;
  private key: string;
  private onRefreshed?: (data: TokenData) => void;
  private onRefreshFailed?: (error: Error) => void;
  private mutex = new RefreshMutex();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AutoRefreshOptions) {
    this.refreshAheadMs = options.refreshAheadMs ?? 60_000;
    this.refreshFn = options.refreshFn;
    this.store = options.store;
    this.key = options.key ?? "default";
    this.onRefreshed = options.onRefreshed;
    this.onRefreshFailed = options.onRefreshFailed;
  }

  /** 开始自动刷新调度 */
  async start(): Promise<void> {
    const token = await this.store.get(this.key);
    if (token) {
      this.scheduleRefresh(token);
    }
  }

  /** 停止自动刷新 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 更新 token 并重新调度 */
  async updateToken(data: TokenData): Promise<void> {
    await this.store.set(this.key, data);
    this.scheduleRefresh(data);
  }

  private scheduleRefresh(token: TokenData): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const now = Date.now();
    const refreshAt = token.expiresAt - this.refreshAheadMs;
    const delay = Math.max(0, refreshAt - now);

    this.timer = setTimeout(async () => {
      try {
        const newToken = await this.mutex.acquire(this.key, () =>
          this.refreshFn(token.refreshToken)
        );
        if (newToken) {
          await this.store.set(this.key, newToken);
          this.onRefreshed?.(newToken);
          this.scheduleRefresh(newToken);
        }
      } catch (error) {
        this.onRefreshFailed?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, delay);
  }
}
