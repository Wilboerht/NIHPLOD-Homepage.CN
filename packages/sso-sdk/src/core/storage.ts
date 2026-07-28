/**
 * Token 存储抽象层
 *
 * 默认使用 localStorage，以支持多 Tab 间自动同步 token 并避免并发刷新。
 * 对 XSS 敏感的子项目可通过 setTokenStorage() 注入更安全的自定义实现
 *（如内存存储、Service Worker 封装、或带加密的 storage）。
 *
 * 多 client 隔离：
 * - token / state / return_url 均支持按 clientId 隔离 key
 * - 不传 clientId 时使用全局 key，保持向后兼容
 */

/** Token 数据 */
export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token?: string;

  /** Token 签发时间（epoch ms），用于计算过期 */
  issued_at: number;

  /** 访问令牌实际过期时间（epoch ms）= issued_at + expires_in * 1000 */
  expires_at: number;
}

/** 存储接口 */
export interface TokenStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** 默认 localStorage/sessionStorage key 前缀 */
const STORAGE_PREFIX = "nihplod_sso_";

/** 常量 key 名称 */
const TOKEN_KEY = "token";
const VERIFIER_KEY_PREFIX = "pkce_verifier_";
const STATE_KEY = "oauth_state";
const RETURN_URL_KEY = "return_url";

function buildKey(base: string, clientId?: string): string {
  return clientId ? `${base}:${clientId}` : base;
}

/**
 * 浏览器 localStorage 实现
 */
const localStorageAdapter: TokenStorage = {
  get(key: string) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_PREFIX + key);
  },
  set(key: string, value: string) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_PREFIX + key, value);
  },
  remove(key: string) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  },
};

let _storage: TokenStorage = localStorageAdapter;

/**
 * 设置自定义存储实现
 */
export function setTokenStorage(storage: TokenStorage): void {
  _storage = storage;
}

/**
 * 获取当前存储实现
 */
export function getTokenStorage(): TokenStorage {
  return _storage;
}

// ============================================
// Token 存取
// ============================================

export function saveTokenData(data: TokenData, clientId?: string): void {
  _storage.set(buildKey(TOKEN_KEY, clientId), JSON.stringify(data));
}

export function getTokenData(clientId?: string): TokenData | null {
  const raw = _storage.get(buildKey(TOKEN_KEY, clientId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenData;
  } catch {
    return null;
  }
}

export function removeTokenData(clientId?: string): void {
  _storage.remove(buildKey(TOKEN_KEY, clientId));
}

// ============================================
// PKCE 临时数据存取
// ============================================

export function savePkceVerifier(clientId: string, verifier: string): void {
  _storage.set(VERIFIER_KEY_PREFIX + clientId, verifier);
}

export function getPkceVerifier(clientId: string): string | null {
  return _storage.get(VERIFIER_KEY_PREFIX + clientId);
}

export function removePkceVerifier(clientId: string): void {
  _storage.remove(VERIFIER_KEY_PREFIX + clientId);
}

// ============================================
// State 参数存取
// ============================================

export function saveOAuthState(state: string, clientId?: string): void {
  _storage.set(buildKey(STATE_KEY, clientId), state);
}

export function getOAuthState(clientId?: string): string | null {
  return _storage.get(buildKey(STATE_KEY, clientId));
}

export function removeOAuthState(clientId?: string): void {
  _storage.remove(buildKey(STATE_KEY, clientId));
}

// ============================================
// 返回 URL 存取
// ============================================

export function saveReturnUrl(url: string, clientId?: string): void {
  _storage.set(buildKey(RETURN_URL_KEY, clientId), url);
}

export function getReturnUrl(clientId?: string): string | null {
  return _storage.get(buildKey(RETURN_URL_KEY, clientId));
}

export function removeReturnUrl(clientId?: string): void {
  _storage.remove(buildKey(RETURN_URL_KEY, clientId));
}

// ============================================
// 清理所有 SSO 数据
// ============================================

export function clearAllSsoData(clientId?: string): void {
  if (clientId) {
    removeTokenData(clientId);
    removeOAuthState(clientId);
    removeReturnUrl(clientId);
    removePkceVerifier(clientId);
    return;
  }

  removeTokenData();
  removeOAuthState();
  removeReturnUrl();

  // 清理所有 PKCE verifier（遍历已知前缀，localStorage key 可枚举）
  if (typeof localStorage !== "undefined") {
    const prefix = STORAGE_PREFIX + VERIFIER_KEY_PREFIX;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        _storage.remove(key.slice(STORAGE_PREFIX.length));
      }
    }
  }
}

/**
 * 清理指定 clientId 列表的 PKCE verifier
 *
 * 适用于非浏览器环境或已知 clientId 场景。
 */
export function clearVerifiersForClients(clientIds: string[]): void {
  for (const clientId of clientIds) {
    _storage.remove(VERIFIER_KEY_PREFIX + clientId);
  }
}
