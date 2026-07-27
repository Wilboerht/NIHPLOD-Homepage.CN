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
function createTokenVerifier(options) {
  const {
    audience,
    issuer = "https://nihplod.cn",
    introspectionEndpoint,
    clientId,
    clientSecret,
    accessTokenSecret,
    introspectCacheTtl = 30 * 1e3
  } = options;
  const introspectCache = createIntrospectCache(introspectCacheTtl);
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
      const { payload } = await (0, import_jose.jwtVerify)(token, secret, {
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
  return {
    /**
     * 验证 Access Token
     *
     * 验证顺序：
     * 1. 若配置了 accessTokenSecret，先尝试本地 JWT 验证
     * 2. 否则/失败后，调用 Introspection 端点
     *
     * @returns token payload 或者 null（验证失败）
     */
    async verify(token) {
      if (accessTokenSecret) {
        const local = await verifyLocally(token);
        if (local) return local;
      }
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTokenVerifier,
  ssoMiddleware
});
