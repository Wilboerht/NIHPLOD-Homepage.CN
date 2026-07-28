// src/core/errors.ts
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
function buildKey(base, clientId) {
  return clientId ? `${base}:${clientId}` : base;
}
var localStorageAdapter = {
  get(key) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_PREFIX + key);
  },
  set(key, value) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_PREFIX + key, value);
  },
  remove(key) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  }
};
var _storage = localStorageAdapter;
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
  _storage.set(VERIFIER_KEY_PREFIX + clientId, verifier);
}
function getPkceVerifier(clientId) {
  return _storage.get(VERIFIER_KEY_PREFIX + clientId);
}
function removePkceVerifier(clientId) {
  _storage.remove(VERIFIER_KEY_PREFIX + clientId);
}
function saveOAuthState(state, clientId) {
  _storage.set(buildKey(STATE_KEY, clientId), state);
}
function getOAuthState(clientId) {
  return _storage.get(buildKey(STATE_KEY, clientId));
}
function removeOAuthState(clientId) {
  _storage.remove(buildKey(STATE_KEY, clientId));
}
function saveReturnUrl(url, clientId) {
  _storage.set(buildKey(RETURN_URL_KEY, clientId), url);
}
function getReturnUrl(clientId) {
  return _storage.get(buildKey(RETURN_URL_KEY, clientId));
}
function removeReturnUrl(clientId) {
  _storage.remove(buildKey(RETURN_URL_KEY, clientId));
}
function clearAllSsoData(clientId) {
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
function clearVerifiersForClients(clientIds) {
  for (const clientId of clientIds) {
    _storage.remove(VERIFIER_KEY_PREFIX + clientId);
  }
}

// src/core/SsoClient.ts
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
var JWKS_CACHE_TTL_MS = 5 * 60 * 1e3;
async function fetchJwks(baseUrl) {
  const now = Date.now();
  if (cachedJwks && cachedJwks.baseUrl === baseUrl && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.jwks;
  }
  try {
    const res = await fetch(`${baseUrl}/api/oauth/jwks`);
    if (!res.ok) return null;
    const jwks = await res.json();
    cachedJwks = { baseUrl, jwks, fetchedAt: now };
    return jwks;
  } catch {
    return null;
  }
}
async function verifyRs256(token, jwk) {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!signature || !jwk.n || !jwk.e) return false;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: false },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = base64UrlDecode(signature);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes,
      data
    );
  } catch {
    return false;
  }
}
async function validateIdToken(idToken, expectedIssuer, expectedClientId) {
  const header = decodeJwtHeader(idToken);
  if (!header) {
    throw new SsoError("id_token_invalid", "ID Token \u683C\u5F0F\u9519\u8BEF");
  }
  const alg = header.alg;
  if (typeof alg !== "string" || alg !== "RS256" && alg !== "HS256") {
    throw new SsoError("id_token_unsupported_alg", `\u4E0D\u652F\u6301\u7684 ID Token \u7B7E\u540D\u7B97\u6CD5: ${alg}`);
  }
  if (alg === "RS256") {
    const jwks = await fetchJwks(normalizeIssuer(expectedIssuer));
    if (!jwks) {
      throw new SsoError("id_token_invalid_signature", "\u65E0\u6CD5\u83B7\u53D6 JWKS \u9A8C\u8BC1 ID Token \u7B7E\u540D");
    }
    const kid = typeof header.kid === "string" ? header.kid : void 0;
    const key = jwks.keys.find(
      (k) => k.kty === "RSA" && k.alg === "RS256" && k.use === "sig" && (kid ? k.kid === kid : true)
    );
    if (!key) {
      throw new SsoError("id_token_invalid_signature", "JWKS \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684 RS256 \u516C\u94A5");
    }
    const validSig = await verifyRs256(idToken, key);
    if (!validSig) {
      throw new SsoError("id_token_invalid_signature", "ID Token \u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25");
    }
  }
  if (alg === "HS256") {
    console.warn(
      "[SSO SDK] ID Token \u4F7F\u7528 HS256 \u7B7E\u540D\uFF0CPublic Client \u65E0\u6CD5\u5B89\u5168\u9A8C\u8BC1\u7B7E\u540D\u3002\u5EFA\u8BAE\u4E3B\u7AD9\u914D\u7F6E JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY \u542F\u7528 RS256\u3002"
    );
  }
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    throw new SsoError("id_token_invalid", "ID Token payload \u89E3\u6790\u5931\u8D25");
  }
  const normalizedExpectedIssuer = normalizeIssuer(expectedIssuer);
  const tokenIssuer = typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : "";
  if (tokenIssuer !== normalizedExpectedIssuer) {
    throw new SsoError("id_token_issuer_mismatch", "ID Token issuer \u4E0D\u5339\u914D");
  }
  if (payload.aud !== expectedClientId && !payload.aud?.includes(expectedClientId)) {
    throw new SsoError("id_token_audience_mismatch", "ID Token audience \u4E0D\u5339\u914D");
  }
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1e3) {
    throw new SsoError("id_token_expired", "ID Token \u5DF2\u8FC7\u671F");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new SsoError("id_token_missing_sub", "ID Token \u7F3A\u5C11 sub");
  }
  return { sub: payload.sub };
}
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
  // ============================================
  // 公共 API
  // ============================================
  /**
   * 发起 SSO 登录
   *
   * 生成 PKCE code_verifier/code_challenge 和 state 参数，
   * 构建 authorize URL，通过 302 跳转到 SSO 登录页。
   *
   * @param returnUrl - 登录成功后的返回地址（可选，保存到 sessionStorage）
   */
  async login(returnUrl) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    if (returnUrl) {
      saveReturnUrl(returnUrl);
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
   */
  async getLoginUrl(returnUrl) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    if (returnUrl) saveReturnUrl(returnUrl);
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
   * 处理 OAuth 回调
   *
   * 解析回调 URL，校验 state 参数，用授权码交换 token。
   * 成功后 token 自动保存到 sessionStorage。
   *
   * @param callbackUrl - 完整的回调 URL（window.location.href）
   * @returns TokenData 或 null
   */
  async handleCallback(callbackUrl) {
    const url = new URL(callbackUrl);
    const params = url.searchParams;
    const error = params.get("error");
    if (error) {
      const desc = params.get("error_description") || error;
      throw new SsoError("token_request_failed", `\u6388\u6743\u5931\u8D25: ${desc}`);
    }
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code) {
      throw new SsoError("token_request_failed", "\u56DE\u8C03 URL \u4E2D\u7F3A\u5C11 authorization code");
    }
    const savedState = getOAuthState(this.config.clientId);
    if (!savedState || savedState !== returnedState) {
      removeOAuthState(this.config.clientId);
      throw new SsoError(
        "state_mismatch",
        "State \u53C2\u6570\u4E0D\u5339\u914D\uFF0C\u53EF\u80FD\u5B58\u5728 CSRF \u653B\u51FB"
      );
    }
    removeOAuthState(this.config.clientId);
    const verifier = getPkceVerifier(this.config.clientId);
    if (!verifier) {
      throw new SsoError(
        "pkce_required",
        "code_verifier \u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u8FC7\u671F\u6216\u6765\u81EA\u5176\u4ED6\u6807\u7B7E\u9875\uFF09"
      );
    }
    removePkceVerifier(this.config.clientId);
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
      throw new SsoError(
        "token_request_failed",
        errData.error_description || `Token \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}`
      );
    }
    const data = await res.json();
    if (data.id_token) {
      try {
        await validateIdToken(data.id_token, this.config.ssoBaseUrl, this.config.clientId);
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
    let res;
    try {
      res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
    } catch (err) {
      throw new SsoError("network_error", "\u5237\u65B0 Token \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25", err);
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
        errorCode === "invalid_grant" ? "session_expired" : "token_request_failed",
        errData.error_description || `\u5237\u65B0 Token \u5931\u8D25: HTTP ${res.status}`
      );
    }
    const data = await res.json();
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
   * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）
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
      const endSessionEndpoint = discovery?.end_session_endpoint || `${this.config.ssoBaseUrl}/logout`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", this.config.clientId);
      if (this.config.redirectUri) {
        logoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          this.config.redirectUri
        );
      }
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      const state = generateState();
      logoutUrl.searchParams.set("state", state);
      window.location.href = logoutUrl.toString();
    }
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
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  getOAuthState,
  getPkceVerifier,
  getReturnUrl,
  getTokenData,
  getTokenStorage,
  removeOAuthState,
  removePkceVerifier,
  removeReturnUrl,
  removeTokenData,
  saveOAuthState,
  savePkceVerifier,
  saveReturnUrl,
  saveTokenData,
  setTokenStorage
};
//# sourceMappingURL=index.mjs.map