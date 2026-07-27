/**
 * Token 存储抽象层
 *
 * 默认使用 sessionStorage（非 localStorage），防止 XSS 持久化窃取。
 * 支持注入自定义实现（如 React Native AsyncStorage、Node.js 文件存储）。
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

/**
 * 浏览器 sessionStorage 实现
 */
const sessionStorageAdapter: TokenStorage = {
  get(key: string) {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(STORAGE_PREFIX + key);
  },
  set(key: string, value: string) {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(STORAGE_PREFIX + key, value);
  },
  remove(key: string) {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  },
};

let _storage: TokenStorage = sessionStorageAdapter;

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

export function saveTokenData(data: TokenData): void {
  _storage.set(TOKEN_KEY, JSON.stringify(data));
}

export function getTokenData(): TokenData | null {
  const raw = _storage.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenData;
  } catch {
    return null;
  }
}

export function removeTokenData(): void {
  _storage.remove(TOKEN_KEY);
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

export function saveOAuthState(state: string): void {
  _storage.set(STATE_KEY, state);
}

export function getOAuthState(): string | null {
  return _storage.get(STATE_KEY);
}

export function removeOAuthState(): void {
  _storage.remove(STATE_KEY);
}

// ============================================
// 返回 URL 存取
// ============================================

export function saveReturnUrl(url: string): void {
  _storage.set(RETURN_URL_KEY, url);
}

export function getReturnUrl(): string | null {
  return _storage.get(RETURN_URL_KEY);
}

export function removeReturnUrl(): void {
  _storage.remove(RETURN_URL_KEY);
}

// ============================================
// 清理所有 SSO 数据
// ============================================

export function clearAllSsoData(): void {
  removeTokenData();
  removeOAuthState();
  removeReturnUrl();

  // 清理所有 PKCE verifier（遍历已知前缀，sessionStorage key 可枚举）
  if (typeof sessionStorage !== "undefined") {
    const prefix = STORAGE_PREFIX + VERIFIER_KEY_PREFIX;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) {
        _storage.remove(key.slice(STORAGE_PREFIX.length));
      }
    }
  } else {
    // 非浏览器环境：回退到尝试清空已知 clientIds 的 key
    // 调用方可使用 clearAllVerifiersForClients() 辅助函数
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
