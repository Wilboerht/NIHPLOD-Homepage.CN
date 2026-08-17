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

// src/next/index.ts
var next_exports = {};
__export(next_exports, {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME: () => DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME: () => DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME: () => DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME: () => DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME: () => DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME: () => DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME: () => DEFAULT_VERIFIER_COOKIE_NAME,
  createCallbackRouteHandler: () => createCallbackRouteHandler,
  createLogoutRouteHandler: () => createLogoutRouteHandler,
  createSsoMiddleware: () => createSsoMiddleware,
  getHostCookieOptions: () => getHostCookieOptions,
  getSecureCookieOptions: () => getSecureCookieOptions,
  toInsecureCookieName: () => toInsecureCookieName
});
module.exports = __toCommonJS(next_exports);

// src/next/middleware.ts
var import_server = require("next/server");

// src/next/constants.ts
var DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
var DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
var DEFAULT_ID_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_id";
var DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
var DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
var DEFAULT_VERIFIER_COOKIE_NAME = "__Secure-nihplod_sso_verifier";
var DEFAULT_LOGOUT_STATE_COOKIE_NAME = "__Host-nihplod_sso_logout_state";
function toInsecureCookieName(name) {
  return name.replace(/^__(Host|Secure)-/, "");
}
function resolveInsecureLocalDev(enabled, ssoBaseUrl) {
  if (!enabled) return false;
  if (process.env.NODE_ENV === "production" && /^https:\/\//i.test(ssoBaseUrl)) {
    console.warn(
      "[SSO SDK] insecureLocalDev=true \u5DF2\u88AB\u5FFD\u7565\uFF1A\u5F53\u524D\u4E3A\u751F\u4EA7\u73AF\u5883\uFF08NODE_ENV=production\uFF09\u4E14 ssoBaseUrl \u4F7F\u7528 HTTPS\uFF0CCookie \u4ECD\u4FDD\u6301 Secure \u5C5E\u6027\u4E0E __Host-/__Secure- \u524D\u7F00\u3002\u8BF7\u4ECE\u751F\u4EA7\u914D\u7F6E\u4E2D\u79FB\u9664\u8BE5\u5F00\u5173\u3002"
    );
    return false;
  }
  console.warn(
    "[SSO SDK] insecureLocalDev=true\uFF1ACookie \u7684 Secure \u5C5E\u6027\u5DF2\u5173\u95ED\u4E14\u53BB\u9664 __Host-/__Secure- \u524D\u7F00\u3002\u4EC5\u9650 http://localhost \u672C\u5730\u5F00\u53D1\u4F7F\u7528\uFF0C\u751F\u4EA7\u73AF\u5883\u5FC5\u987B\u79FB\u9664\u8BE5\u914D\u7F6E\uFF08\u751F\u4EA7\u5FC5\u987B\u7528 HTTPS\uFF09\u3002"
  );
  return true;
}
function getHostCookieOptions(maxAge, secure = true) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...maxAge !== void 0 ? { maxAge } : {}
  };
}
function getSecureCookieOptions(maxAge, path = "/", secure = true) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path,
    ...maxAge !== void 0 ? { maxAge } : {}
  };
}

// src/next/middleware.ts
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  let result = "";
  while (result.length < length) {
    const array = new Uint8Array(length * 2);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length && result.length < length; i++) {
      if (array[i] >= maxValid) continue;
      result += chars[array[i] % chars.length];
    }
  }
  return result;
}
async function computeCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function matchesPath(pathname, paths) {
  return paths.some((path) => {
    if (pathname === path) return true;
    if (path.endsWith("/:path*") && pathname.startsWith(path.replace("/:path*", ""))) return true;
    if (pathname.startsWith(path + "/")) return true;
    return false;
  });
}
var introspectionCache = /* @__PURE__ */ new Map();
var INTROSPECT_CACHE_TTL_MS = 3e4;
var INTROSPECT_CACHE_MAX_ENTRIES = 500;
async function introspectCacheKey(token, clientId) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}|${clientId}`;
}
function introspectCacheGet(key) {
  const entry = introspectionCache.get(key);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    introspectionCache.delete(key);
    return null;
  }
  introspectionCache.delete(key);
  introspectionCache.set(key, entry);
  return entry;
}
function introspectCacheSet(key, active) {
  const now = Date.now();
  for (const [k, v] of introspectionCache) {
    if (v.until <= now) introspectionCache.delete(k);
  }
  while (introspectionCache.size >= INTROSPECT_CACHE_MAX_ENTRIES) {
    const oldest = introspectionCache.keys().next();
    if (oldest.done) break;
    introspectionCache.delete(oldest.value);
  }
  introspectionCache.set(key, { active, until: now + INTROSPECT_CACHE_TTL_MS });
}
async function introspectAccessToken(token, ssoBaseUrl, clientId, clientSecret) {
  const cacheKey = await introspectCacheKey(token, clientId);
  const cached = introspectCacheGet(cacheKey);
  if (cached) {
    return cached.active;
  }
  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: "access_token",
      client_id: clientId
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }
    const res = await fetch(`${ssoBaseUrl}/api/oauth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!res.ok) {
      if (res.status !== 401 && res.status !== 403) {
        return false;
      }
      introspectCacheSet(cacheKey, false);
      return false;
    }
    const data = await res.json();
    const active = data.active === true;
    introspectCacheSet(cacheKey, active);
    return active;
  } catch {
    return false;
  }
}
function createSsoMiddleware(config) {
  const {
    clientId,
    clientSecret,
    ssoBaseUrl,
    redirectUri,
    scopes = "openid profile",
    publicPaths = [],
    callbackPath = "/api/auth/callback",
    ssoCookieName = "__Host-user_token",
    validateSsoCookie = true,
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const accessTokenCookieName = insecureLocalDev ? toInsecureCookieName(config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME) : config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME;
  const stateCookieName = insecureLocalDev ? toInsecureCookieName(config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME) : config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME;
  const returnUrlCookieName = insecureLocalDev ? toInsecureCookieName(config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME) : config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME;
  const verifierCookieName = insecureLocalDev ? toInsecureCookieName(config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME) : config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME;
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") {
    if (!validateSsoCookie) {
      console.warn(
        "[SSO SDK] validateSsoCookie=false\uFF1A\u4E2D\u95F4\u4EF6\u4EC5\u68C0\u67E5 Cookie \u5B58\u5728\u6027\uFF0C\u53EF\u80FD\u653E\u884C\u5DF2\u5931\u6548\u7684\u4F1A\u8BDD\u3002\u4E2D\u95F4\u4EF6\u53EA\u662F UX \u5C42\uFF0C\u654F\u611F\u6570\u636E\u7684\u9274\u6743\u5FC5\u987B\u5728 Route Handler / Server Component \u4E2D\u5B8C\u6210\u3002"
      );
    }
    if (!clientSecret) {
      console.warn(
        "[SSO SDK] \u672A\u914D\u7F6E clientSecret\uFF08Public Client \u6A21\u5F0F\uFF09\uFF1Aintrospection \u65E0\u5BA2\u6237\u7AEF\u8BA4\u8BC1\uFF0C\u4E2D\u95F4\u4EF6\u5224\u5B9A\u7ED3\u679C\u4EC5\u4F5C UX \u53C2\u8003\u3002Confidential Client\uFF08BFF\uFF09\u8BF7\u914D\u7F6E clientSecret\u3002"
      );
    }
  }
  return async function ssoMiddleware(request) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon.ico") || pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)) {
      return import_server.NextResponse.next();
    }
    if (pathname === callbackPath) {
      return import_server.NextResponse.next();
    }
    const allPublicPaths = [callbackPath, ...publicPaths];
    if (matchesPath(pathname, allPublicPaths)) {
      return import_server.NextResponse.next();
    }
    const ssoSession = request.cookies.get(ssoCookieName);
    if (ssoSession?.value) {
      if (validateSsoCookie) {
        const tokenActive = await introspectAccessToken(
          ssoSession.value,
          normalizedBase,
          clientId,
          clientSecret
        );
        if (tokenActive) {
          return import_server.NextResponse.next();
        }
      } else {
        return import_server.NextResponse.next();
      }
    }
    const accessTokenCookie = request.cookies.get(accessTokenCookieName);
    if (accessTokenCookie?.value) {
      const tokenActive = await introspectAccessToken(
        accessTokenCookie.value,
        normalizedBase,
        clientId,
        clientSecret
      );
      if (tokenActive) {
        return import_server.NextResponse.next();
      }
    }
    const state = generateRandomString(32);
    const verifier = generateRandomString(64);
    const challenge = await computeCodeChallenge(verifier);
    const authorizeParams = new URLSearchParams();
    authorizeParams.set("response_type", "code");
    authorizeParams.set("client_id", clientId);
    authorizeParams.set("redirect_uri", redirectUri);
    authorizeParams.set("scope", scopes);
    authorizeParams.set("state", state);
    authorizeParams.set("code_challenge", challenge);
    authorizeParams.set("code_challenge_method", "S256");
    const loginUrl = new URL("/api/oauth/authorize", normalizedBase);
    loginUrl.search = authorizeParams.toString();
    const response = import_server.NextResponse.redirect(loginUrl);
    response.cookies.set(stateCookieName, state, getHostCookieOptions(600, secureCookies));
    response.cookies.set(verifierCookieName, verifier, getSecureCookieOptions(600, callbackPath, secureCookies));
    const safeReturnUrl = (request.nextUrl.pathname + request.nextUrl.search).slice(0, 2048);
    response.cookies.set(returnUrlCookieName, safeReturnUrl, getHostCookieOptions(600, secureCookies));
    if (accessTokenCookie?.value) {
      response.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    }
    return response;
  };
}

// src/next/callback.ts
var import_server2 = require("next/server");

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

// src/next/callback.ts
function createCallbackRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    defaultReturnPath = "/",
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit, fallback) => insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  return async function GET(request) {
    const { searchParams } = request.nextUrl;
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return import_server2.NextResponse.json(
        { error: "authorization_failed", error_description: desc },
        { status: 400 }
      );
    }
    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    if (!code) {
      return import_server2.NextResponse.json(
        {
          error: "invalid_request",
          error_description: "\u7F3A\u5C11 authorization code"
        },
        { status: 400 }
      );
    }
    const savedState = request.cookies.get(stateCookieName)?.value;
    if (!savedState) {
      return import_server2.NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State \u53C2\u6570\u7F3A\u5931\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42"
        },
        { status: 400 }
      );
    }
    if (returnedState !== savedState) {
      return import_server2.NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State \u53C2\u6570\u4E0D\u5339\u914D\uFF0C\u53EF\u80FD\u5B58\u5728 CSRF \u653B\u51FB"
        },
        { status: 400 }
      );
    }
    const verifier = request.cookies.get(verifierCookieName)?.value;
    if (!verifier) {
      return import_server2.NextResponse.json(
        {
          error: "invalid_request",
          error_description: "PKCE verifier \u7F3A\u5931\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42"
        },
        { status: 400 }
      );
    }
    const tokenEndpoint = `${normalizedBase}/api/oauth/token`;
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", clientId);
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", verifier);
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }
    let res = null;
    let lastError;
    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1e3 * Math.pow(2, attempt - 1)));
      }
      try {
        res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) {
          return import_server2.NextResponse.json(
            { error: "server_error", error_description: "Token \u8BF7\u6C42\u5931\u8D25\uFF0C\u5DF2\u91CD\u8BD5\u4ECD\u4E0D\u53EF\u8FBE" },
            { status: 502 }
          );
        }
      }
    }
    if (lastError || !res) {
      return import_server2.NextResponse.json(
        { error: "server_error", error_description: "Token \u8BF7\u6C42\u5931\u8D25" },
        { status: 502 }
      );
    }
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch {
      }
      return import_server2.NextResponse.json(
        {
          error: "token_request_failed",
          error_description: errData.error_description || `Token \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}`
        },
        { status: 502 }
      );
    }
    const tokenData = await res.json();
    if (!tokenData.access_token || !tokenData.refresh_token) {
      return import_server2.NextResponse.json(
        {
          error: "server_error",
          error_description: "Token \u54CD\u5E94\u7F3A\u5C11 access_token \u6216 refresh_token"
        },
        { status: 502 }
      );
    }
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId
        );
      } catch (err) {
        return import_server2.NextResponse.json(
          {
            error: "id_token_invalid",
            error_description: err instanceof Error ? err.message : "ID Token \u9A8C\u8BC1\u5931\u8D25"
          },
          { status: 400 }
        );
      }
    }
    const rawReturnUrl = request.cookies.get(returnUrlCookieName)?.value || defaultReturnPath;
    const returnUrl = isTrustedReturnUrl(rawReturnUrl, request.nextUrl.origin) ? rawReturnUrl : "/";
    const response = import_server2.NextResponse.redirect(new URL(returnUrl, request.url));
    response.cookies.set(accessTokenCookieName, tokenData.access_token, {
      ...getHostCookieOptions(tokenData.expires_in, secureCookies)
    });
    const refreshMaxAge = tokenData.refresh_expires_in != null ? tokenData.refresh_expires_in : 30 * 24 * 60 * 60;
    response.cookies.set(refreshTokenCookieName, tokenData.refresh_token, {
      ...getHostCookieOptions(refreshMaxAge, secureCookies)
    });
    if (tokenData.id_token) {
      let idTokenMaxAge = 3600;
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
          );
          if (payload.exp && typeof payload.exp === "number") {
            idTokenMaxAge = payload.exp - Math.floor(Date.now() / 1e3);
          }
        }
      } catch {
      }
      if (idTokenMaxAge > 0) {
        response.cookies.set(idTokenCookieName, tokenData.id_token, {
          ...getHostCookieOptions(idTokenMaxAge, secureCookies)
        });
      }
    }
    response.cookies.set(stateCookieName, "", getHostCookieOptions(0, secureCookies));
    response.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0, secureCookies));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/", secureCookies));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, request.nextUrl.pathname, secureCookies));
    return response;
  };
}

// src/next/logout.ts
var import_server3 = require("next/server");
async function fetchDiscovery(ssoBaseUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5e3);
  try {
    const res = await fetch(
      `${ssoBaseUrl}/api/oauth/.well-known/openid-configuration`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
function generateRandomString2(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  let result = "";
  while (result.length < length) {
    const array = new Uint8Array(length * 2);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length && result.length < length; i++) {
      if (array[i] >= maxValid) continue;
      result += chars[array[i] % chars.length];
    }
  }
  return result;
}
function createLogoutRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    postLogoutRedirectUri = new URL(redirectUri).origin + "/",
    redirectToSso = true,
    callbackPath = "/api/auth/callback",
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit, fallback) => insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);
  const logoutStateCookieName = pickName(config.logoutStateCookieName, DEFAULT_LOGOUT_STATE_COOKIE_NAME);
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  return async function handler(request) {
    const returnedState = request.nextUrl.searchParams.get("state");
    if (returnedState) {
      const savedState = request.cookies.get(logoutStateCookieName)?.value;
      if (!savedState || savedState !== returnedState) {
        return import_server3.NextResponse.json(
          { error: "invalid_request", error_description: "Logout state \u4E0D\u5339\u914D" },
          { status: 400 }
        );
      }
      const res = import_server3.NextResponse.redirect(request.nextUrl.origin + "/");
      res.cookies.set(logoutStateCookieName, "", getHostCookieOptions(0, secureCookies));
      return res;
    }
    const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
    const idTokenHint = request.cookies.get(idTokenCookieName)?.value;
    if (refreshToken) {
      try {
        const discovery = await fetchDiscovery(normalizedBase);
        const revokeUrl = discovery?.revocation_endpoint || `${normalizedBase}/api/oauth/revoke`;
        const body = new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: clientId
        });
        if (clientSecret) {
          body.set("client_secret", clientSecret);
        }
        await fetch(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });
      } catch {
      }
    }
    const clearCookies = (res) => {
      res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(stateCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/", secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, callbackPath, secureCookies));
      return res;
    };
    if (redirectToSso) {
      const discovery = await fetchDiscovery(normalizedBase);
      const endSessionEndpoint = discovery?.end_session_endpoint || `${normalizedBase}/api/oauth/end-session`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", clientId);
      logoutUrl.searchParams.set(
        "post_logout_redirect_uri",
        postLogoutRedirectUri
      );
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      const logoutState = generateRandomString2(32);
      logoutUrl.searchParams.set("state", logoutState);
      const res = clearCookies(import_server3.NextResponse.redirect(logoutUrl.toString()));
      res.cookies.set(logoutStateCookieName, logoutState, getHostCookieOptions(600, secureCookies));
      return res;
    }
    return clearCookies(
      import_server3.NextResponse.redirect(request.nextUrl.origin + "/")
    );
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  createCallbackRouteHandler,
  createLogoutRouteHandler,
  createSsoMiddleware,
  getHostCookieOptions,
  getSecureCookieOptions,
  toInsecureCookieName
});
//# sourceMappingURL=index.js.map