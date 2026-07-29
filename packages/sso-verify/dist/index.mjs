// src/index.ts
import { jwtVerify, importSPKI, createRemoteJWKSet } from "jose";
import { LRUCache } from "lru-cache";
function createIntrospectCache(ttlMs) {
  return new LRUCache({
    max: 1e4,
    ttl: ttlMs
  });
}
var processedLogoutJtis = new LRUCache({
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
    introspectCacheTtl = 30 * 1e3
  } = options;
  const introspectCache = createIntrospectCache(introspectCacheTtl);
  let _jwksKeySet = null;
  function getJwksKeySet() {
    if (!jwksUri) return null;
    if (!_jwksKeySet) {
      _jwksKeySet = createRemoteJWKSet(new URL(jwksUri), {
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
          _rs256PublicKey = await importSPKI(accessTokenPublicKey, "RS256");
        } catch {
          _rs256PublicKey = null;
        }
      }
    }
    return _rs256PublicKey;
  }
  async function introspect(token) {
    if (!introspectionEndpoint || !clientId || !clientSecret) {
      return null;
    }
    const cached = introspectCache.get(token);
    if (cached) {
      return { active: cached.active, ...cached.payload || {} };
    }
    try {
      const response = await fetch(introspectionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      if (!response.ok) return null;
      const data = await response.json();
      let payload = null;
      if (data.active && data.sub) {
        payload = {
          sub: data.sub,
          aud: audience,
          iss: issuer,
          client_id: data.client_id,
          scope: data.scope,
          exp: data.exp
        };
      }
      introspectCache.set(token, { active: data.active, payload });
      return data;
    } catch {
      return null;
    }
  }
  async function verifyLocally(token) {
    if (!accessTokenSecret) return null;
    try {
      const secret = new TextEncoder().encode(accessTokenSecret);
      const { payload } = await jwtVerify(token, secret, {
        issuer,
        audience
      });
      if (payload.type !== "access_token") {
        return null;
      }
      return payload;
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
        const { payload } = await jwtVerify(token, directKey, {
          issuer,
          audience,
          algorithms: ["RS256"]
        });
        if (payload.type !== "access_token") return null;
        return payload;
      }
      const jwks = getJwksKeySet();
      if (jwks) {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"]
        });
        if (payload.type !== "access_token") return null;
        return payload;
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
      if (!result?.active) return null;
      return {
        sub: result.sub || "",
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
     * 4. events 包含 backchannel-logout 事件
     *
     * @returns LogoutTokenPayload 或 null（验证失败）
     */
    async verifyLogoutToken(token) {
      const secret = logoutTokenSecret || accessTokenSecret;
      if (!secret) return null;
      try {
        const key = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, key, {
          issuer,
          audience,
          algorithms: ["HS256"]
        });
        if (payload.type !== "logout_token") {
          return null;
        }
        const events = payload.events;
        if (!events || !events["http://schemas.openid.net/event/backchannel-logout"]) {
          return null;
        }
        const jti = payload.jti;
        if (!jti || typeof jti !== "string") {
          return null;
        }
        if (processedLogoutJtis.has(jti)) {
          return null;
        }
        processedLogoutJtis.set(jti, Date.now());
        return payload;
      } catch {
        return null;
      }
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
      }
      return;
    }
    const payload = await verifier.verify(token);
    if (!payload) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F" });
      }
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
export {
  createLogoutTokenVerifier,
  createTokenVerifier,
  ssoMiddleware
};
