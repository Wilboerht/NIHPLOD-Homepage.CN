// src/core/errors.ts
function mapOAuthErrorToSsoCode(oauthError, context = "token_exchange") {
  switch (oauthError) {
    case "invalid_grant":
      return context === "refresh" ? "session_expired" : "authorization_code_expired";
    case "invalid_client":
      return "client_disabled";
    case "access_denied":
      return "user_denied_authorization";
    case "server_error":
      return "sso_server_error";
    case "rate_limited":
      return "rate_limited";
    case "invalid_scope":
    case "invalid_request":
    case "unauthorized_client":
    case "unsupported_grant_type":
    default:
      return "token_request_failed";
  }
}
var SsoError = class extends Error {
  constructor(code, description, cause) {
    super(`[SSO SDK] ${code}: ${description}`);
    this.name = "SsoError";
    this.code = code;
    this.description = description;
    this.cause = cause;
  }
};
var OAuthError = class extends Error {
  constructor(code, description, uri) {
    super(`[OAuth] ${code}: ${description}`);
    this.name = "OAuthError";
    this.code = code;
    this.description = description;
    this.uri = uri;
  }
};

// src/core/pkce.ts
var VALID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
function generateRandomString(length) {
  const mask = 198;
  let result = "";
  while (result.length < length) {
    const chunkSize = Math.min(length * 2, 256);
    const array = new Uint8Array(chunkSize);
    crypto.getRandomValues(array);
    for (let i = 0; i < chunkSize && result.length < length; i++) {
      if (array[i] >= mask) continue;
      result += VALID_CHARS[array[i] % VALID_CHARS.length];
    }
  }
  return result;
}
function generateCodeVerifier(length = 64) {
  if (length < 43 || length > 128) {
    throw new Error("code_verifier length must be between 43 and 128");
  }
  return generateRandomString(length);
}
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateState() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// src/core/storage.ts
var STORAGE_PREFIX = "nihplod_sso_";
var TOKEN_KEY = "token";
var VERIFIER_KEY_PREFIX = "pkce_verifier_";
var STATE_KEY = "oauth_state";
var RETURN_URL_KEY = "return_url";
var LOGOUT_STATE_KEY = "logout_state";
function buildKey(base, clientId) {
  return clientId ? `${base}:${clientId}` : base;
}
function createMemoryStorageAdapter() {
  const store = /* @__PURE__ */ new Map();
  return {
    get(key) {
      return store.get(key) ?? null;
    },
    set(key, value) {
      store.set(key, value);
    },
    remove(key) {
      store.delete(key);
    }
  };
}
var memoryStorageAdapter = createMemoryStorageAdapter();
var localStorageAdapter = {
  get(key) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_PREFIX + key);
  },
  set(key, value) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (err) {
      console.warn(
        `[SSO SDK] localStorage \u5199\u5165\u5931\u8D25\uFF08${err instanceof Error ? err.name : String(err)}\uFF09\uFF0C\u6570\u636E\u672A\u6301\u4E45\u5316`
      );
    }
  },
  remove(key) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  }
};
function createSessionStorageAdapter() {
  const fallback = /* @__PURE__ */ new Map();
  return {
    get(key) {
      if (typeof sessionStorage !== "undefined") {
        return sessionStorage.getItem(STORAGE_PREFIX + key) ?? fallback.get(key) ?? null;
      }
      return fallback.get(key) ?? null;
    },
    set(key, value) {
      if (typeof sessionStorage === "undefined") {
        fallback.set(key, value);
        return;
      }
      try {
        sessionStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      fallback.delete(key);
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    }
  };
}
var _transient = createSessionStorageAdapter();
function createSecureStorage(options = {}) {
  return options.persist ? localStorageAdapter : createSessionStorageAdapter();
}
var _storage = createSessionStorageAdapter();
function setTokenStorage(storage) {
  _storage = storage;
}
function getTokenStorage() {
  return _storage;
}
function saveTokenData(data, clientId) {
  _storage.set(buildKey(TOKEN_KEY, clientId), JSON.stringify(data));
}
function getTokenData(clientId) {
  const raw = _storage.get(buildKey(TOKEN_KEY, clientId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function removeTokenData(clientId) {
  _storage.remove(buildKey(TOKEN_KEY, clientId));
}
function savePkceVerifier(clientId, verifier) {
  _transient.set(VERIFIER_KEY_PREFIX + clientId, verifier);
}
function getPkceVerifier(clientId) {
  return _transient.get(VERIFIER_KEY_PREFIX + clientId);
}
function removePkceVerifier(clientId) {
  _transient.remove(VERIFIER_KEY_PREFIX + clientId);
}
function saveOAuthState(state, clientId) {
  _transient.set(buildKey(STATE_KEY, clientId), state);
}
function getOAuthState(clientId) {
  return _transient.get(buildKey(STATE_KEY, clientId));
}
function removeOAuthState(clientId) {
  _transient.remove(buildKey(STATE_KEY, clientId));
}
function saveLogoutState(state, clientId) {
  _transient.set(buildKey(LOGOUT_STATE_KEY, clientId), state);
}
function getLogoutState(clientId) {
  return _transient.get(buildKey(LOGOUT_STATE_KEY, clientId));
}
function removeLogoutState(clientId) {
  _transient.remove(buildKey(LOGOUT_STATE_KEY, clientId));
}
function saveReturnUrl(url, clientId) {
  _transient.set(buildKey(RETURN_URL_KEY, clientId), url);
}
function getReturnUrl(clientId) {
  return _transient.get(buildKey(RETURN_URL_KEY, clientId));
}
function removeReturnUrl(clientId) {
  _transient.remove(buildKey(RETURN_URL_KEY, clientId));
}
function clearAllSsoData(clientId) {
  if (clientId) {
    removeTokenData(clientId);
    removeOAuthState(clientId);
    removeReturnUrl(clientId);
    removeLogoutState(clientId);
    removePkceVerifier(clientId);
    removePkceVerifier(`${clientId}_popup_nonce`);
    return;
  }
  removeTokenData();
  removeOAuthState();
  removeReturnUrl();
  removeLogoutState();
  const prefix = STORAGE_PREFIX + VERIFIER_KEY_PREFIX;
  const stores = [
    typeof sessionStorage !== "undefined" ? sessionStorage : null,
    typeof localStorage !== "undefined" ? localStorage : null
  ];
  for (const store of stores) {
    if (!store) continue;
    const keys = [];
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
function clearVerifiersForClients(clientIds) {
  for (const clientId of clientIds) {
    _transient.remove(VERIFIER_KEY_PREFIX + clientId);
  }
}

// src/core/security.ts
function isTrustedReturnUrl(url, currentOrigin) {
  if (!url) return false;
  if (url.includes("\\")) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).origin === currentOrigin;
  } catch {
    return false;
  }
}
function timingSafeEqualString(a, b) {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ba.length === 0 || bb.length === 0) return ba.length === bb.length;
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= ba[i % ba.length] ^ bb[i % bb.length];
  }
  return diff === 0;
}

// src/core/id-token.ts
var _crypto = typeof crypto !== "undefined" && crypto.subtle ? crypto : null;
function getCrypto() {
  return _crypto ?? null;
}
function base64UrlDecode(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function decodeJwtHeader(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[0]));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function normalizeIssuer(url) {
  return url.replace(/\/+$/, "");
}
var cachedJwks = null;
var cachedDiscovery = null;
var JWKS_CACHE_TTL_MS = 5 * 60 * 1e3;
async function fetchDiscoveryDoc(baseUrl) {
  const now = Date.now();
  if (cachedDiscovery && cachedDiscovery.baseUrl === baseUrl && now - cachedDiscovery.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedDiscovery.doc;
  }
  try {
    const res = await fetch(`${baseUrl}/api/oauth/.well-known/openid-configuration`);
    const doc = res.ok ? await res.json() : null;
    cachedDiscovery = { baseUrl, doc, fetchedAt: now };
    return doc;
  } catch {
    cachedDiscovery = { baseUrl, doc: null, fetchedAt: now };
    return null;
  }
}
async function fetchJwks(baseUrl, options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cachedJwks && cachedJwks.baseUrl === baseUrl && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.jwks;
  }
  const discovery = await fetchDiscoveryDoc(baseUrl);
  const jwksUri = discovery?.jwks_uri || `${baseUrl}/api/oauth/jwks`;
  try {
    const res = await fetch(jwksUri, options.forceRefresh ? { cache: "no-cache" } : void 0);
    if (!res.ok) return null;
    const jwks = await res.json();
    cachedJwks = { baseUrl, jwks, fetchedAt: now };
    return jwks;
  } catch {
    return null;
  }
}
async function verifyRs256Signature(token, jwk) {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!signature || !jwk.n || !jwk.e) return false;
    const c = getCrypto();
    if (!c) return false;
    const cryptoKey = await c.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: false },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = base64UrlDecode(signature);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await c.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes,
      data
    );
  } catch {
    return false;
  }
}
async function computeAtHash(accessToken) {
  const c = getCrypto();
  if (!c) return "";
  const hash = await c.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  const bytes = new Uint8Array(hash);
  const half = bytes.slice(0, bytes.length / 2);
  let binary = "";
  for (const b of half) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function validateIdToken(idToken, accessToken, expectedIssuer, expectedClientId, options = {}) {
  const { rejectHs256WhenRs256Available = true } = options;
  const header = decodeJwtHeader(idToken);
  if (!header) {
    throw new SsoError("id_token_invalid", "ID Token \u683C\u5F0F\u9519\u8BEF");
  }
  const alg = header.alg;
  if (typeof alg !== "string" || alg !== "RS256" && alg !== "HS256") {
    throw new SsoError("id_token_unsupported_alg", `\u4E0D\u652F\u6301\u7684 ID Token \u7B7E\u540D\u7B97\u6CD5: ${alg}`);
  }
  const baseUrl = normalizeIssuer(expectedIssuer);
  const discovery = await fetchDiscoveryDoc(baseUrl);
  const normalizedIssuer = normalizeIssuer(discovery?.issuer || baseUrl);
  if (alg === "RS256") {
    const jwks = await fetchJwks(baseUrl);
    if (!jwks) {
      throw new SsoError("id_token_invalid_signature", "\u65E0\u6CD5\u83B7\u53D6 JWKS \u9A8C\u8BC1 ID Token \u7B7E\u540D");
    }
    const kid = typeof header.kid === "string" ? header.kid : void 0;
    const matchCandidates = (set) => set.keys.filter(
      (k) => k.kty === "RSA" && k.alg === "RS256" && k.use === "sig" && (kid ? k.kid === kid : true)
    );
    const verifyAny = async (keys) => {
      for (const key of keys) {
        if (await verifyRs256Signature(idToken, key)) return true;
      }
      return false;
    };
    let candidates = matchCandidates(jwks);
    let validSig = candidates.length > 0 ? await verifyAny(candidates) : false;
    if (candidates.length === 0 || !validSig) {
      const freshJwks = await fetchJwks(baseUrl, { forceRefresh: true });
      if (freshJwks) {
        candidates = matchCandidates(freshJwks);
        validSig = candidates.length > 0 ? await verifyAny(candidates) : false;
      }
    }
    if (candidates.length === 0) {
      throw new SsoError("id_token_invalid_signature", "JWKS \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684 RS256 \u516C\u94A5");
    }
    if (!validSig) {
      throw new SsoError("id_token_invalid_signature", "ID Token \u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25");
    }
  }
  if (alg === "HS256") {
    if (rejectHs256WhenRs256Available) {
      const jwks = await fetchJwks(baseUrl);
      const hasRs256 = jwks?.keys?.some((k) => k.alg === "RS256" && k.use === "sig");
      if (hasRs256) {
        throw new SsoError("id_token_unsupported_alg", "SSO \u4E2D\u5FC3\u5DF2\u914D\u7F6E RS256\uFF0C\u62D2\u7EDD HS256 ID Token");
      }
    }
    throw new SsoError(
      "id_token_hs256_unsupported",
      "ID Token \u4F7F\u7528 HS256 \u5BF9\u79F0\u7B7E\u540D\uFF0CSDK \u65E0\u6CD5\u5B89\u5168\u9A8C\u8BC1\u3002\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u5728 SSO \u4E3B\u7AD9\u914D\u7F6E RS256 \u5BC6\u94A5\u5BF9\uFF08JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY\uFF09\u540E\u91CD\u65B0\u7B7E\u53D1\u3002"
    );
  }
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    throw new SsoError("id_token_invalid", "ID Token payload \u89E3\u6790\u5931\u8D25");
  }
  const tokenIssuer = typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new SsoError("id_token_issuer_mismatch", "ID Token issuer \u4E0D\u5339\u914D");
  }
  const aud = payload.aud;
  const audList = Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : [];
  if (!audList.includes(expectedClientId)) {
    throw new SsoError("id_token_audience_mismatch", "ID Token audience \u4E0D\u5339\u914D");
  }
  if (audList.length > 1 && payload.azp !== expectedClientId) {
    throw new SsoError("id_token_audience_mismatch", "ID Token \u591A audience \u65F6 azp \u5FC5\u987B\u4E3A\u5F53\u524D client");
  }
  if (typeof payload.exp !== "number") {
    throw new SsoError("id_token_invalid", "ID Token \u7F3A\u5C11 exp \u58F0\u660E");
  }
  if (Date.now() >= payload.exp * 1e3 + 6e4) {
    throw new SsoError("id_token_expired", "ID Token \u5DF2\u8FC7\u671F");
  }
  if (typeof payload.iat === "number" && payload.iat * 1e3 > Date.now() + 6e4) {
    throw new SsoError("id_token_invalid", "ID Token iat \u5728\u672A\u6765\uFF0C\u7591\u4F3C\u4F2A\u9020\u6216\u65F6\u949F\u5F02\u5E38");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new SsoError("id_token_missing_sub", "ID Token \u7F3A\u5C11 sub");
  }
  if (typeof payload.at_hash === "string" && payload.at_hash) {
    const actual = await computeAtHash(accessToken);
    if (!timingSafeEqualString(actual, payload.at_hash)) {
      throw new SsoError("id_token_at_hash_mismatch", "ID Token at_hash \u4E0D\u5339\u914D");
    }
  }
  return { sub: payload.sub };
}

// src/core/SsoClient.ts
var _SsoClient = class _SsoClient {
  constructor(config) {
    this._discovery = null;
    this._discoveryFetchedAt = 0;
    this._refreshLock = null;
    if (!config.clientId) throw new SsoError("invalid_config", "clientId \u4E0D\u80FD\u4E3A\u7A7A");
    if (!config.redirectUri) throw new SsoError("invalid_config", "redirectUri \u4E0D\u80FD\u4E3A\u7A7A");
    if (!config.ssoBaseUrl) throw new SsoError("invalid_config", "ssoBaseUrl \u4E0D\u80FD\u4E3A\u7A7A");
    const base = config.ssoBaseUrl.replace(/\/+$/, "");
    this.config = { ...config, ssoBaseUrl: base };
  }
  // ============================================
  // 内部方法
  // ============================================
  /**
   * 获取 OIDC Discovery 文档（带缓存 + 超时）
   *
   * 缓存 5 分钟，超时 10 秒。
   * 失败时返回 null（上层调用方回退到硬编码默认端点）。
   */
  async _getDiscovery() {
    const now = Date.now();
    if (this._discovery && now - this._discoveryFetchedAt < _SsoClient.DISCOVERY_TTL_MS) {
      return this._discovery;
    }
    const url = `${this.config.ssoBaseUrl}/api/oauth/.well-known/openid-configuration`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        _SsoClient.DISCOVERY_TIMEOUT_MS
      );
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        console.warn(
          `[SSO SDK] OIDC Discovery \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}, \u56DE\u9000\u5230\u9ED8\u8BA4\u7AEF\u70B9`
        );
        return null;
      }
      this._discovery = await res.json();
      this._discoveryFetchedAt = now;
      return this._discovery;
    } catch (err) {
      console.warn(
        `[SSO SDK] OIDC Discovery \u8BF7\u6C42\u5F02\u5E38: ${err instanceof Error ? err.message : String(err)}, \u56DE\u9000\u5230\u9ED8\u8BA4\u7AEF\u70B9`
      );
      return this._discovery || null;
    }
  }
  /** 获取 authorize 端点 URL（优先 Discovery，回退默认） */
  async _getAuthorizeEndpoint() {
    const d = await this._getDiscovery();
    if (d) return d.authorization_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/authorize`;
  }
  /** 获取 token 端点 URL（优先 Discovery，回退默认） */
  async _getTokenEndpoint() {
    const d = await this._getDiscovery();
    if (d) return d.token_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/token`;
  }
  /** 获取 userinfo 端点 URL（优先 Discovery，回退默认） */
  async _getUserinfoEndpoint() {
    const d = await this._getDiscovery();
    if (d) return d.userinfo_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/userinfo`;
  }
  /**
   * 开放重定向防护：仅保存相对路径或与当前页面同源的 returnUrl，
   * 其余（如 https://evil.com）忽略并告警，防止回调后跳转到钓鱼站点。
   */
  _saveReturnUrlIfTrusted(returnUrl) {
    if (isTrustedReturnUrl(returnUrl, window.location.origin)) {
      saveReturnUrl(returnUrl, this.config.clientId);
    } else {
      console.warn(`[SSO SDK] returnUrl \u672A\u901A\u8FC7\u540C\u6E90\u6821\u9A8C\uFF0C\u5DF2\u5FFD\u7565: ${returnUrl}`);
    }
  }
  // ============================================
  // 公共 API
  // ============================================
  /**
   * 发起 SSO 登录
   *
   * 生成 PKCE code_verifier/code_challenge 和 state 参数，
   * 构建 authorize URL，通过 302 跳转到 SSO 登录页。
   *
   * @param returnUrl - 登录成功后的返回地址（可选，保存到 sessionStorage；
   *   仅允许相对路径或同源绝对 URL，否则忽略并告警）
   *
   * ⚠️ 不要与 getLoginUrl() 混用：两者都会重新生成并覆盖 sessionStorage 中的
   * state / PKCE verifier，先调用的那次授权流程将因 state 不匹配而失败。
   * 同一次登录只使用其中一个入口。
   */
  async login(returnUrl) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    if (returnUrl) {
      this._saveReturnUrlIfTrusted(returnUrl);
    }
    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    window.location.href = `${authorizeEndpoint}?${params.toString()}`;
  }
  /**
   * 构建登录 URL（不跳转，返回 URL 字符串）
   *
   * 适用于需要手动处理跳转的场景。
   *
   * ⚠️ 不要与 login() 混用：两者都会重新生成并覆盖 sessionStorage 中的
   * state / PKCE verifier，先调用的那次授权流程将因 state 不匹配而失败。
   * 同一次登录只使用其中一个入口。
   */
  async getLoginUrl(returnUrl) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    if (returnUrl) this._saveReturnUrlIfTrusted(returnUrl);
    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    return `${authorizeEndpoint}?${params.toString()}`;
  }
  /**
   * 弹窗模式 SSO 登录
   *
   * 打开一个小窗口进行登录，认证完成后窗口自动关闭，
   * 主页面不丢失状态（适用于 SPA 中需要保持表单/浏览上下文的场景）。
   *
   * 流程：
   * 1. window.open() 打开授权 URL 到弹窗
   * 2. 用户在弹窗中完成登录
   * 3. 弹窗加载 CallbackPage 时检测到 window.opener，通过 postMessage 回传回调 URL
   * 4. 主页面收到消息后调用 handleCallback() 交换 token
   * 5. 弹窗自动关闭
   *
   * @param options - 弹窗配置
   * @param options.returnUrl - 登录成功后的返回地址
   * @param options.width - 弹窗宽度（默认 480）
   * @param options.height - 弹窗高度（默认 640）
   * @returns TokenData
   *
   * @example
   * ```typescript
   * const client = new SsoClient({ clientId: "xxx", redirectUri: "https://myapp.com/callback", ssoBaseUrl: "https://nihplod.cn" });
   * try {
   *   const tokenData = await client.loginPopup({ returnUrl: "/dashboard" });
   *   console.log("登录成功", tokenData);
   * } catch (err) {
   *   if (err instanceof SsoError && err.code === "popup_blocked") {
   *     // 弹窗被拦截，回退到同页重定向
   *     await client.login("/dashboard");
   *   }
   * }
   * ```
   */
  async loginPopup(options = {}) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    const popupNonce = generateState();
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    savePkceVerifier(`${this.config.clientId}_popup_nonce`, popupNonce);
    if (options.returnUrl) {
      this._saveReturnUrlIfTrusted(options.returnUrl);
    }
    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    params.set("popup_nonce", popupNonce);
    const width = options.width || 480;
    const height = options.height || 640;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const popupFeatures = [
      `width=${width}`,
      `height=${height}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      "resizable=yes",
      "scrollbars=yes",
      "status=yes"
    ].join(",");
    const popup = window.open(
      `${authorizeEndpoint}?${params.toString()}`,
      "nihplod_sso_popup",
      popupFeatures
    );
    if (!popup) {
      removePkceVerifier(this.config.clientId);
      removeOAuthState(this.config.clientId);
      removePkceVerifier(`${this.config.clientId}_popup_nonce`);
      throw new SsoError(
        "popup_blocked",
        "\u5F39\u7A97\u88AB\u6D4F\u89C8\u5668\u62E6\u622A\uFF0C\u8BF7\u5141\u8BB8\u5F39\u7A97\u540E\u91CD\u8BD5"
      );
    }
    const redirectUriOrigin = new URL(this.config.redirectUri).origin;
    try {
      popup.focus();
      return await new Promise((resolve, reject) => {
        let completed = false;
        const handleMessage = (event) => {
          if (completed) return;
          if (event.origin !== redirectUriOrigin) return;
          if (!event.data || event.data.type !== "nihplod_sso_popup_callback") return;
          if (!event.data.callbackUrl) return;
          const savedNonce = getPkceVerifier(`${this.config.clientId}_popup_nonce`);
          if (!savedNonce || !timingSafeEqualString(event.data.nonce ?? "", savedNonce)) return;
          removePkceVerifier(`${this.config.clientId}_popup_nonce`);
          completed = true;
          cleanup();
          if (popup && !popup.closed) {
            popup.close();
          }
          this.handleCallback(event.data.callbackUrl).then(resolve).catch(reject);
        };
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            if (!completed) {
              completed = true;
              cleanup();
              reject(
                new SsoError(
                  "popup_closed",
                  "\u767B\u5F55\u7A97\u53E3\u5DF2\u5173\u95ED"
                )
              );
            }
          }
        }, 500);
        const cleanup = () => {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          removePkceVerifier(`${this.config.clientId}_popup_nonce`);
        };
        window.addEventListener("message", handleMessage);
      });
    } catch (err) {
      removePkceVerifier(this.config.clientId);
      removeOAuthState(this.config.clientId);
      removePkceVerifier(`${this.config.clientId}_popup_nonce`);
      throw err;
    }
  }
  /**
   * 处理 OAuth 回调
   *
   * 解析回调 URL，校验 state 参数，用授权码交换 token。
   * 成功后 token 自动保存到 token 存储（默认 sessionStorage，可通过 setTokenStorage 定制）。
   *
   * @param callbackUrl - 完整的回调 URL（window.location.href）
   * @returns TokenData 或 null
   */
  async handleCallback(callbackUrl) {
    const url = new URL(callbackUrl);
    const params = url.searchParams;
    const error = params.get("error");
    if (error) {
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      const desc = params.get("error_description") || error;
      throw new SsoError(mapOAuthErrorToSsoCode(error), `\u6388\u6743\u5931\u8D25: ${desc}`);
    }
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code) {
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      throw new SsoError("token_request_failed", "\u56DE\u8C03 URL \u4E2D\u7F3A\u5C11 authorization code");
    }
    const savedState = getOAuthState(this.config.clientId);
    if (!savedState || !timingSafeEqualString(savedState, returnedState ?? "")) {
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      throw new SsoError(
        "state_mismatch",
        "State \u53C2\u6570\u4E0D\u5339\u914D\uFF0C\u53EF\u80FD\u5B58\u5728 CSRF \u653B\u51FB"
      );
    }
    const verifier = getPkceVerifier(this.config.clientId);
    if (!verifier) {
      throw new SsoError(
        "pkce_required",
        "code_verifier \u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u8FC7\u671F\u6216\u6765\u81EA\u5176\u4ED6\u6807\u7B7E\u9875\uFF09"
      );
    }
    const tokenEndpoint = await this._getTokenEndpoint();
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("code_verifier", verifier);
    body.set("client_id", this.config.clientId);
    body.set("redirect_uri", this.config.redirectUri);
    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }
    let res;
    try {
      res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
    } catch (err) {
      throw new SsoError("network_error", "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25", err);
    }
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch {
      }
      const serverError = errData.error || "";
      throw new SsoError(
        mapOAuthErrorToSsoCode(serverError),
        errData.error_description || `Token \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}`
      );
    }
    const data = await res.json();
    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          data.access_token,
          this.config.ssoBaseUrl,
          this.config.clientId
        );
      } catch (err) {
        removeTokenData(this.config.clientId);
        throw err;
      }
    }
    removeOAuthState(this.config.clientId);
    removePkceVerifier(this.config.clientId);
    const now = Date.now();
    const tokenData = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      issued_at: now,
      expires_at: now + data.expires_in * 1e3
    };
    saveTokenData(tokenData, this.config.clientId);
    return tokenData;
  }
  /**
   * 刷新 Access Token
   *
   * 使用 refresh_token 换取新的 access_token。
   * 采用互斥锁防止并发刷新。
   * 支持 Refresh Token 原子轮换。
   */
  async refreshToken() {
    if (this._refreshLock) return this._refreshLock;
    this._refreshLock = this._doRefreshToken();
    try {
      return await this._refreshLock;
    } finally {
      this._refreshLock = null;
    }
  }
  async _doRefreshToken() {
    const current = getTokenData(this.config.clientId);
    if (!current?.refresh_token) {
      throw new SsoError("no_refresh_token", "\u6CA1\u6709\u53EF\u7528\u7684 refresh_token");
    }
    const tokenEndpoint = await this._getTokenEndpoint();
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", current.refresh_token);
    body.set("client_id", this.config.clientId);
    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }
    let res = null;
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 1e3));
      }
    }
    if (lastErr || !res) {
      throw new SsoError("network_error", "\u5237\u65B0 Token \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25", lastErr);
    }
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch {
      }
      const errorCode = errData.error || "";
      if (errorCode === "invalid_grant" || res.status === 401) {
        removeTokenData(this.config.clientId);
      }
      throw new SsoError(
        mapOAuthErrorToSsoCode(errorCode, "refresh"),
        errData.error_description || `\u5237\u65B0 Token \u5931\u8D25: HTTP ${res.status}`
      );
    }
    const data = await res.json();
    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          data.access_token,
          this.config.ssoBaseUrl,
          this.config.clientId
        );
      } catch (err) {
        removeTokenData(this.config.clientId);
        throw err;
      }
    }
    const now = Date.now();
    const tokenData = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      // RFC 6749 §6：刷新响应可省略 refresh_token，此时沿用旧值
      refresh_token: data.refresh_token || current.refresh_token,
      id_token: data.id_token,
      issued_at: now,
      expires_at: now + data.expires_in * 1e3
    };
    saveTokenData(tokenData, this.config.clientId);
    return tokenData;
  }
  /**
   * 获取用户信息
   *
   * 若 access_token 已过期则自动刷新后再请求。
   */
  async getUserInfo() {
    let tokenData = getTokenData(this.config.clientId);
    if (!tokenData) {
      throw new SsoError("not_authenticated", "\u672A\u767B\u5F55");
    }
    if (Date.now() >= tokenData.expires_at) {
      tokenData = await this.refreshToken();
    }
    const userinfoEndpoint = await this._getUserinfoEndpoint();
    let res;
    try {
      res = await fetch(userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });
    } catch (err) {
      throw new SsoError("network_error", "\u83B7\u53D6\u7528\u6237\u4FE1\u606F\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25", err);
    }
    if (!res.ok) {
      if (res.status === 401) {
        removeTokenData(this.config.clientId);
        throw new SsoError("not_authenticated", "Token \u5DF2\u5931\u6548");
      }
      throw new SsoError(
        "userinfo_failed",
        `\u83B7\u53D6\u7528\u6237\u4FE1\u606F\u5931\u8D25: HTTP ${res.status}`
      );
    }
    return await res.json();
  }
  /**
   * 获取当前 access_token
   *
   * 若已过期则自动刷新。用于子项目自行发起 API 请求时获取 Bearer token。
   * 若无 token 返回 null；若刷新失败则抛出错误（与 getUserInfo 行为一致）。
   */
  async getAccessToken() {
    let tokenData = getTokenData(this.config.clientId);
    if (!tokenData) return null;
    if (Date.now() >= tokenData.expires_at) {
      tokenData = await this.refreshToken();
    }
    return tokenData.access_token;
  }
  /**
   * 检查是否已认证（不发起网络请求）
   *
   * 仅检查本地是否存在未过期的 access_token。
   */
  isAuthenticated() {
    const tokenData = getTokenData(this.config.clientId);
    if (!tokenData) return false;
    return Date.now() < tokenData.expires_at;
  }
  /**
   * 登出
   *
   * 清除本地所有 token 和临时数据，并尝试撤销服务端 refresh_token。
   * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）。
   *   为 true 时携带 state 参数（已保存到 sessionStorage），
   *   回跳页面应调用 validateLogoutState() 校验防登出 CSRF。
   */
  async logout(redirectToSso = false) {
    const tokenData = getTokenData(this.config.clientId);
    const refreshToken = tokenData?.refresh_token;
    const idTokenHint = tokenData?.id_token;
    clearAllSsoData(this.config.clientId);
    if (refreshToken && this.config.clientId) {
      try {
        const discovery = await this._getDiscovery();
        const revokeUrl = discovery?.revocation_endpoint || `${this.config.ssoBaseUrl}/api/oauth/revoke`;
        const revokeBody = new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: this.config.clientId
        });
        if (this.config.clientSecret) {
          revokeBody.set("client_secret", this.config.clientSecret);
        }
        await fetch(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: revokeBody.toString()
        });
      } catch {
      }
    }
    if (redirectToSso) {
      const discovery = await this._getDiscovery();
      const endSessionEndpoint = discovery?.end_session_endpoint || `${this.config.ssoBaseUrl}/api/oauth/end-session`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", this.config.clientId);
      const postLogoutUri = this.config.postLogoutRedirectUri || this.config.redirectUri;
      if (postLogoutUri) {
        logoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          postLogoutUri
        );
      }
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      const state = generateState();
      saveLogoutState(state, this.config.clientId);
      logoutUrl.searchParams.set("state", state);
      window.location.href = logoutUrl.toString();
    }
  }
  /**
   * 校验 RP-Initiated Logout 回跳的 state 参数（登出 CSRF 防护）
   *
   * 在 post_logout_redirect_uri 指向的页面加载时调用；
   * 仅在 URL 携带 state 且与 logout(redirectToSso=true) 保存的值一致时返回 true，
   * 校验后清除已保存的 logout state（一次性）。
   *
   * @param url - 当前页面完整 URL（window.location.href）
   *
   * @example
   * ```typescript
   * if (sso.validateLogoutState(window.location.href)) {
   *   // 来自 SSO 登出的可信回跳
   * }
   * ```
   */
  validateLogoutState(url) {
    const returnedState = new URL(url).searchParams.get("state");
    if (!returnedState) return false;
    const savedState = getLogoutState(this.config.clientId);
    if (!savedState) return false;
    if (!timingSafeEqualString(savedState, returnedState)) return false;
    removeLogoutState(this.config.clientId);
    return true;
  }
  /**
   * 获取 OIDC Discovery 文档
   *
   * 用于调试和获取 SSO 中心完整配置。
   * 可能返回 null（当 Discovery 端点不可达且无缓存时）。
   */
  async getDiscovery() {
    return this._getDiscovery();
  }
};
/** Discovery 文档缓存 TTL（5 分钟） */
_SsoClient.DISCOVERY_TTL_MS = 5 * 60 * 1e3;
/** Discovery fetch 超时（10 秒） */
_SsoClient.DISCOVERY_TIMEOUT_MS = 1e4;
var SsoClient = _SsoClient;
export {
  OAuthError,
  SsoClient,
  SsoError,
  clearAllSsoData,
  clearVerifiersForClients,
  createSecureStorage,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  getLogoutState,
  getOAuthState,
  getPkceVerifier,
  getReturnUrl,
  getTokenData,
  getTokenStorage,
  isTrustedReturnUrl,
  mapOAuthErrorToSsoCode,
  removeLogoutState,
  removeOAuthState,
  removePkceVerifier,
  removeReturnUrl,
  removeTokenData,
  saveLogoutState,
  saveOAuthState,
  savePkceVerifier,
  saveReturnUrl,
  saveTokenData,
  setTokenStorage,
  timingSafeEqualString
};
//# sourceMappingURL=index.mjs.map