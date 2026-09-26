"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createLogoutTokenVerifier: () => createLogoutTokenVerifier,
  createTokenVerifier: () => createTokenVerifier,
  ssoMiddleware: () => ssoMiddleware
});
module.exports = __toCommonJS(index_exports);
var import_jose = require("jose");
var import_lru_cache = require("lru-cache");
function createIntrospectCache(ttlMs) {
  return new import_lru_cache.LRUCache({
    max: 1e4,
    ttl: ttlMs
  });
}
var processedLogoutJtis = new import_lru_cache.LRUCache({
  max: 1e4,
  ttl: 10 * 60 * 1e3
});
function createTokenVerifier(options) {
  const {
    audience,
    issuer = "https://nihplod.cn",
    introspectionEndpoint,
    clientId,
    clientSecret,
    accessTokenSecret,
    accessTokenPublicKey,
    jwksUri,
    logoutTokenSecret,
    logoutTokenPublicKey,
    introspectCacheTtl = 30 * 1e3,
    introspectTimeoutMs = 10 * 1e3,
    introspectNegativeCacheTtl = 5 * 1e3,
    introspectRetries = 1,
    clockToleranceSeconds = 60,
    logoutJtiStore,
    strictAudience = true
  } = options;
  const assertHttpsEndpoint = (value, name) => {
    if (!value || process.env.NODE_ENV !== "production") return;
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`[sso-verify] ${name} \u4E0D\u662F\u5408\u6CD5 URL: ${value}`);
    }
    if (url.protocol === "https:") return;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (url.protocol === "http:" && isLoopback) return;
    throw new Error(
      `[sso-verify] \u751F\u4EA7\u73AF\u5883 ${name} \u5FC5\u987B\u4E3A https://\uFF08\u5F53\u524D ${url.protocol}//${url.host}\uFF09\uFF0C\u907F\u514D\u51ED\u8BC1/\u4EE4\u724C\u7ECF\u660E\u6587\u4F20\u8F93`
    );
  };
  assertHttpsEndpoint(introspectionEndpoint, "introspectionEndpoint");
  assertHttpsEndpoint(jwksUri, "jwksUri");
  const introspectCache = createIntrospectCache(introspectCacheTtl);
  let _jwksKeySet = null;
  function getJwksKeySet() {
    if (!jwksUri) return null;
    if (!_jwksKeySet) {
      _jwksKeySet = (0, import_jose.createRemoteJWKSet)(new URL(jwksUri), {
        cacheMaxAge: 60 * 60 * 1e3
        // 1 小时缓存
      });
    }
    return _jwksKeySet;
  }
  let _rs256PublicKey = null;
  let _rs256KeyInitialized = false;
  async function getRS256PublicKey() {
    if (!_rs256KeyInitialized) {
      _rs256KeyInitialized = true;
      if (!accessTokenPublicKey) {
        _rs256PublicKey = null;
      } else {
        try {
          _rs256PublicKey = await (0, import_jose.importSPKI)(accessTokenPublicKey, "RS256");
        } catch {
          _rs256PublicKey = null;
        }
      }
    }
    return _rs256PublicKey;
  }
  let _logoutRs256PublicKey = null;
  let _logoutRs256KeyInitialized = false;
  async function getLogoutRS256PublicKey() {
    if (!_logoutRs256KeyInitialized) {
      _logoutRs256KeyInitialized = true;
      if (!logoutTokenPublicKey) {
        _logoutRs256PublicKey = null;
      } else {
        try {
          _logoutRs256PublicKey = await (0, import_jose.importSPKI)(logoutTokenPublicKey, "RS256");
        } catch {
          _logoutRs256PublicKey = null;
        }
      }
    }
    return _logoutRs256PublicKey;
  }
  function matchesAudience(data) {
    const aud = data.aud;
    if (typeof aud === "string") return aud === audience;
    if (Array.isArray(aud)) return aud.includes(audience);
    if (typeof data.client_id === "string") return data.client_id === audience;
    return !strictAudience;
  }
  const inflightIntrospects = /* @__PURE__ */ new Map();
  async function introspect(token) {
    if (!introspectionEndpoint || !clientId) {
      return null;
    }
    const cached = introspectCache.get(token);
    if (cached) {
      return { active: cached.active, ...cached.payload || {} };
    }
    const inflight = inflightIntrospects.get(token);
    if (inflight) {
      return inflight;
    }
    const promise = doIntrospect(token).finally(() => {
      inflightIntrospects.delete(token);
    });
    inflightIntrospects.set(token, promise);
    return promise;
  }
  async function doIntrospect(token) {
    const params = new URLSearchParams({ token, client_id: clientId });
    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }
    let data = null;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
      let response;
      try {
        response = await fetch(introspectionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
          signal: AbortSignal.timeout(introspectTimeoutMs)
        });
      } catch {
        if (attempt < introspectRetries) continue;
        return null;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < introspectRetries) continue;
        return null;
      }
      try {
        data = await response.json();
      } catch {
        if (attempt < introspectRetries) continue;
        return null;
      }
      break;
    }
    if (!data) return null;
    if (data.active !== true) {
      if (introspectNegativeCacheTtl > 0) {
        introspectCache.set(token, { active: false, payload: null }, {
          ttl: introspectNegativeCacheTtl
        });
      }
      return { active: false };
    }
    if (!matchesAudience(data)) {
      if (introspectNegativeCacheTtl > 0) {
        introspectCache.set(token, { active: false, payload: null }, {
          ttl: introspectNegativeCacheTtl
        });
      }
      return { active: false };
    }
    let payload = null;
    if (data.sub) {
      payload = {
        sub: data.sub,
        aud: audience,
        iss: issuer,
        client_id: data.client_id,
        scope: data.scope,
        exp: data.exp
      };
    }
    let ttl = introspectCacheTtl;
    if (typeof data.exp === "number") {
      ttl = Math.min(ttl, data.exp * 1e3 - Date.now());
    }
    if (ttl > 0) {
      introspectCache.set(token, { active: true, payload }, { ttl });
    }
    return data;
  }
  function normalizeLocalPayload(payload) {
    const p = payload;
    if (!p.sub && typeof p.id === "string" && p.id) {
      p.sub = p.id;
    }
    return p.sub ? p : null;
  }
  async function verifyLocally(token) {
    if (!accessTokenSecret) return null;
    try {
      const secret = new TextEncoder().encode(accessTokenSecret);
      const { payload } = await (0, import_jose.jwtVerify)(token, secret, {
        issuer,
        audience,
        algorithms: ["HS256"],
        clockTolerance: clockToleranceSeconds
      });
      if (payload.type !== "access_token") {
        return null;
      }
      return normalizeLocalPayload(payload);
    } catch {
      return null;
    }
  }
  async function verifyWithRS256(token) {
    const hasPublicKey = Boolean(accessTokenPublicKey);
    const hasJwks = Boolean(jwksUri);
    if (!hasPublicKey && !hasJwks) return null;
    try {
      const directKey = await getRS256PublicKey();
      if (directKey) {
        const { payload } = await (0, import_jose.jwtVerify)(token, directKey, {
          issuer,
          audience,
          algorithms: ["RS256"],
          clockTolerance: clockToleranceSeconds
        });
        if (payload.type !== "access_token") return null;
        return normalizeLocalPayload(payload);
      }
      const jwks = getJwksKeySet();
      if (jwks) {
        const { payload } = await (0, import_jose.jwtVerify)(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"],
          clockTolerance: clockToleranceSeconds
        });
        if (payload.type !== "access_token") return null;
        return normalizeLocalPayload(payload);
      }
      return null;
    } catch {
      return null;
    }
  }
  return {
    /**
     * 验证 Access Token
     *
     * 验证顺序：
     * 1. 若配置了 accessTokenSecret，先尝试 HS256 本地验证
     * 2. 若配置了 accessTokenPublicKey 或 jwksUri，尝试 RS256 本地验证
     * 3. 若上述均失败/未配置，调用 Introspection 端点
     *
     * @returns token payload 或者 null（验证失败）
     */
    async verify(token) {
      if (accessTokenSecret) {
        const local = await verifyLocally(token);
        if (local) return local;
      }
      const rs256Result = await verifyWithRS256(token);
      if (rs256Result) return rs256Result;
      const result = await introspect(token);
      if (result?.active !== true || !result.sub) return null;
      return {
        sub: result.sub,
        aud: audience,
        iss: issuer,
        client_id: result.client_id,
        scope: result.scope,
        exp: result.exp
      };
    },
    /**
     * 直接调用 Introspection 端点
     */
    introspect,
    /**
     * 清除指定 token 的 Introspection 缓存
     */
    invalidateCache(token) {
      introspectCache.delete(token);
    },
    /**
     * 验证 Logout Token（Back-Channel Logout）
     *
     * 用于子项目接收主站 backchannel logout 通知时验证 logout_token。
     * 验证要求（OIDC Back-Channel Logout 1.0）：
     * 1. type === "logout_token"
     * 2. iss 匹配配置的 issuer
     * 3. aud 包含当前 client_id
     * 4. exp 存在（规范要求）
     * 5. events 包含 backchannel-logout 事件，且事件值为对象
     * 6. sub 或 sid 至少其一（§2.4，否则无法定位要终止的会话）
     *
     * @returns LogoutTokenPayload 或 null（验证失败）
     */
    async verifyLogoutToken(token) {
      const validateLogoutPayload = async (payload) => {
        if (payload.type !== "logout_token") {
          return null;
        }
        if (typeof payload.exp !== "number") {
          return null;
        }
        const events = payload.events;
        const logoutEvent = events?.["http://schemas.openid.net/event/backchannel-logout"];
        if (!logoutEvent || typeof logoutEvent !== "object" || Array.isArray(logoutEvent)) {
          return null;
        }
        const jti = payload.jti;
        if (!jti || typeof jti !== "string") {
          return null;
        }
        const sub = payload.sub;
        const sid = payload.sid;
        const hasSub = typeof sub === "string" && sub.length > 0;
        const hasSid = typeof sid === "string" && sid.length > 0;
        if (!hasSub && !hasSid) {
          return null;
        }
        const iss = payload.iss || issuer;
        const jtiKey = `${iss}:${jti}`;
        if (logoutJtiStore) {
          if (typeof logoutJtiStore.addIfAbsent === "function") {
            const firstUse = await logoutJtiStore.addIfAbsent(jtiKey, 10 * 60);
            if (!firstUse) return null;
          } else {
            if (await logoutJtiStore.has(jtiKey)) {
              return null;
            }
            await logoutJtiStore.add(jtiKey, 10 * 60);
          }
        } else {
          if (processedLogoutJtis.has(jtiKey)) {
            return null;
          }
          processedLogoutJtis.set(jtiKey, Date.now());
        }
        return payload;
      };
      let alg;
      try {
        alg = (0, import_jose.decodeProtectedHeader)(token).alg;
      } catch {
        return null;
      }
      if (alg === "RS256") {
        const directKey = await getLogoutRS256PublicKey();
        if (directKey) {
          try {
            const { payload } = await (0, import_jose.jwtVerify)(token, directKey, {
              issuer,
              audience,
              algorithms: ["RS256"],
              clockTolerance: clockToleranceSeconds
            });
            return await validateLogoutPayload(payload);
          } catch {
            return null;
          }
        }
        let jwks = null;
        try {
          jwks = getJwksKeySet();
        } catch {
          return null;
        }
        if (jwks) {
          try {
            const { payload } = await (0, import_jose.jwtVerify)(token, jwks, {
              issuer,
              audience,
              algorithms: ["RS256"],
              clockTolerance: clockToleranceSeconds
            });
            return await validateLogoutPayload(payload);
          } catch {
            return null;
          }
        }
        return null;
      }
      if (alg === "HS256") {
        const secret = logoutTokenSecret || accessTokenSecret;
        if (!secret) return null;
        try {
          const key = new TextEncoder().encode(secret);
          const { payload } = await (0, import_jose.jwtVerify)(token, key, {
            issuer,
            audience,
            algorithms: ["HS256"],
            clockTolerance: clockToleranceSeconds
          });
          return await validateLogoutPayload(payload);
        } catch {
          return null;
        }
      }
      return null;
    }
  };
}
function ssoMiddleware(options) {
  const verifier = createTokenVerifier(options);
  return async (req, res, next) => {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "\u8BF7\u63D0\u4F9B Bearer token" });
        return;
      }
      next(new Error("Unauthorized: \u8BF7\u63D0\u4F9B Bearer token"));
      return;
    }
    const payload = await verifier.verify(token);
    if (!payload) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F" });
        return;
      }
      next(new Error("Unauthorized: Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F"));
      return;
    }
    req.user = payload;
    next();
  };
}
function createLogoutTokenVerifier(options) {
  const verifier = createTokenVerifier(options);
  return {
    /**
     * 验证 logout_token
     */
    async verify(token) {
      return verifier.verifyLogoutToken(token);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLogoutTokenVerifier,
  createTokenVerifier,
  ssoMiddleware
});
