/**
 * Token 存储抽象层
 *
 * 分两类存储：
 * - Token 数据：默认使用内存存储，Public Client 浏览器中 refresh_token 不落盘，
 *   XSS 无法窃取长期凭证。对需要多 Tab 共享 token 或 BFF/Confidential Client 场景，
 *   可通过 setTokenStorage() 注入 localStorage 实现（如 createSecureStorage({ persist: true })）。
 * - 临时数据（PKCE verifier / state / returnUrl / popup nonce）：必须跨整页重定向存活
 *   （login() 会 302 跳转到 SSO 中心再回来），因此默认写入 sessionStorage；
 *   SSR 等无 sessionStorage 环境自动降级为内存 Map。
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
const LOGOUT_STATE_KEY = "logout_state";

function buildKey(base: string, clientId?: string): string {
  return clientId ? `${base}:${clientId}` : base;
}

/**
 * 内存存储适配器（Public Client 浏览器默认）
 *
 * 安全优势：
 * - refresh_token 不落盘，XSS 无法窃取长期凭证。
 * - 页面刷新后用户需重新授权，符合纯前端 Public Client 的安全模型。
 *
 * 代价：多 Tab 间不会自动同步 token；SDK 内部已用锁机制避免并发刷新。
 */
function createMemoryStorageAdapter(): TokenStorage {
  const store = new Map<string, string>();
  return {
    get(key: string) {
      return store.get(key) ?? null;
    },
    set(key: string, value: string) {
      store.set(key, value);
    },
    remove(key: string) {
      store.delete(key);
    },
  };
}

const memoryStorageAdapter = createMemoryStorageAdapter();

/**
 * 浏览器 localStorage 实现
 *
 * 适用于：
 * - Next.js BFF / Confidential Client（refresh_token 不直接暴露给浏览器）。
 * - 需要多 Tab 共享 token 的场景。
 *
 * 注意：Public Client 在浏览器中直接存储 refresh_token 会增加 XSS 风险，
 * 建议改用内存存储或 Service Worker 封装。
 */
const localStorageAdapter: TokenStorage = {
  get(key: string) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_PREFIX + key);
  },
  set(key: string, value: string) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (err) {
      // QuotaExceededError 等写入失败不应中断登录流程
      console.warn(
        `[SSO SDK] localStorage 写入失败（${err instanceof Error ? err.name : String(err)}），数据未持久化`
      );
    }
  },
  remove(key: string) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  },
};

/**
 * 浏览器 sessionStorage 实现（临时数据专用）
 *
 * PKCE verifier / state / returnUrl / popup nonce 必须跨整页重定向存活
 * （login() 跳转到 SSO 中心后回调页面仍需读取），不能放模块级内存；
 * sessionStorage 在整页跳转后保留，且随标签页关闭自动清除，恰好匹配其生命周期。
 * SSR / 隐私模式写入失败时降级为内存 Map，保证不抛异常。
 */
function createSessionStorageAdapter(): TokenStorage {
  const fallback = new Map<string, string>();
  return {
    get(key: string) {
      if (typeof sessionStorage !== "undefined") {
        return sessionStorage.getItem(STORAGE_PREFIX + key) ?? fallback.get(key) ?? null;
      }
      return fallback.get(key) ?? null;
    },
    set(key: string, value: string) {
      if (typeof sessionStorage === "undefined") {
        fallback.set(key, value);
        return;
      }
      try {
        sessionStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        // 隐私模式等场景写入失败时降级到内存
        fallback.set(key, value);
      }
    },
    remove(key: string) {
      fallback.delete(key);
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    },
  };
}

/** 临时数据存储（跨整页重定向存活），独立于 token 存储，不受 setTokenStorage() 影响 */
const _transient: TokenStorage = createSessionStorageAdapter();

/**
 * 创建存储实现
 *
 * @param options.persist 是否持久化到 localStorage。默认 false（内存存储）。
 *   ⚠️ 安全警告：persist=true 会将 refresh_token 明文写入 localStorage，
 *   任何 XSS 均可在不被检测的情况下读取。仅在 BFF/Confidential Client
 *   且 refresh_token 不直接暴露给浏览器的场景下使用。
 *   - Confidential/BFF 子项目可设为 true。
 *   - Public Client 在浏览器中应保持 false（默认）。
 */
export function createSecureStorage(options: { persist?: boolean } = {}): TokenStorage {
  return options.persist ? localStorageAdapter : memoryStorageAdapter;
}

let _storage: TokenStorage = memoryStorageAdapter;

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
    // 过期不物理删除：refresh_token 通常比 access_token 长寿，
    // 删除会同时丢弃 refresh_token 使刷新路径失效。
    // 是否过期由调用方依据 expires_at 判断（isAuthenticated / getUserInfo 等）。
    return JSON.parse(raw) as TokenData;
  } catch {
    return null;
  }
}

export function removeTokenData(clientId?: string): void {
  _storage.remove(buildKey(TOKEN_KEY, clientId));
}

// ============================================
// PKCE 临时数据存取（transient：sessionStorage，跨整页重定向存活）
// ============================================

export function savePkceVerifier(clientId: string, verifier: string): void {
  _transient.set(VERIFIER_KEY_PREFIX + clientId, verifier);
}

export function getPkceVerifier(clientId: string): string | null {
  return _transient.get(VERIFIER_KEY_PREFIX + clientId);
}

export function removePkceVerifier(clientId: string): void {
  _transient.remove(VERIFIER_KEY_PREFIX + clientId);
}

// ============================================
// State 参数存取（transient）
// ============================================

export function saveOAuthState(state: string, clientId?: string): void {
  _transient.set(buildKey(STATE_KEY, clientId), state);
}

export function getOAuthState(clientId?: string): string | null {
  return _transient.get(buildKey(STATE_KEY, clientId));
}

export function removeOAuthState(clientId?: string): void {
  _transient.remove(buildKey(STATE_KEY, clientId));
}

// ============================================
// Logout State 存取（transient，RP-Initiated Logout CSRF 防护）
// ============================================

export function saveLogoutState(state: string, clientId?: string): void {
  _transient.set(buildKey(LOGOUT_STATE_KEY, clientId), state);
}

export function getLogoutState(clientId?: string): string | null {
  return _transient.get(buildKey(LOGOUT_STATE_KEY, clientId));
}

export function removeLogoutState(clientId?: string): void {
  _transient.remove(buildKey(LOGOUT_STATE_KEY, clientId));
}

// ============================================
// 返回 URL 存取（transient）
// ============================================
export function saveReturnUrl(url: string, clientId?: string): void {
  _transient.set(buildKey(RETURN_URL_KEY, clientId), url);
}

export function getReturnUrl(clientId?: string): string | null {
  return _transient.get(buildKey(RETURN_URL_KEY, clientId));
}

export function removeReturnUrl(clientId?: string): void {
  _transient.remove(buildKey(RETURN_URL_KEY, clientId));
}

// ============================================
// 清理所有 SSO 数据
// ============================================

export function clearAllSsoData(clientId?: string): void {
  if (clientId) {
    removeTokenData(clientId);
    removeOAuthState(clientId);
    removeReturnUrl(clientId);
    removeLogoutState(clientId);
    removePkceVerifier(clientId);
    // popup nonce 复用 verifier key 空间（`${clientId}_popup_nonce`）
    removePkceVerifier(`${clientId}_popup_nonce`);
    return;
  }

  removeTokenData();
  removeOAuthState();
  removeReturnUrl();
  removeLogoutState();

  // 清理所有 PKCE verifier：当前版本存于 sessionStorage，同时清 localStorage 中可能的旧版本残留
  const prefix = STORAGE_PREFIX + VERIFIER_KEY_PREFIX;
  const stores = [
    typeof sessionStorage !== "undefined" ? sessionStorage : null,
    typeof localStorage !== "undefined" ? localStorage : null,
  ];
  for (const store of stores) {
    if (!store) continue;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) {
      _transient.remove(key.slice(STORAGE_PREFIX.length));
      store.removeItem(key);
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
    _transient.remove(VERIFIER_KEY_PREFIX + clientId);
  }
}
