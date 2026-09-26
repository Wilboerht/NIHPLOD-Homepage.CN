// src/next/middleware.ts
import { NextResponse } from "next/server";

// src/next/constants.ts
var DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
var DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
var DEFAULT_ID_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_id";
var DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
var DEFAULT_NONCE_COOKIE_NAME = "__Host-nihplod_sso_nonce";
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
var INTROSPECT_TIMEOUT_MS = 5e3;
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
    return cached.active ? "active" : "inactive";
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
      body: body.toString(),
      signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS)
    });
    if (!res.ok) {
      if (res.status !== 401 && res.status !== 403) {
        return "unreachable";
      }
      introspectCacheSet(cacheKey, false);
      return "inactive";
    }
    const data = await res.json();
    const active = data.active === true;
    introspectCacheSet(cacheKey, active);
    return active ? "active" : "inactive";
  } catch {
    return "unreachable";
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
    failClosedOnIntrospectionError = false,
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const accessTokenCookieName = insecureLocalDev ? toInsecureCookieName(config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME) : config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME;
  const stateCookieName = insecureLocalDev ? toInsecureCookieName(config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME) : config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME;
  const nonceCookieName = insecureLocalDev ? toInsecureCookieName(config.nonceCookieName ?? DEFAULT_NONCE_COOKIE_NAME) : config.nonceCookieName ?? DEFAULT_NONCE_COOKIE_NAME;
  const returnUrlCookieName = insecureLocalDev ? toInsecureCookieName(config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME) : config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME;
  const verifierCookieName = insecureLocalDev ? toInsecureCookieName(config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME) : config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME;
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");
  if (config.validateSsoCookie !== void 0 || config.ssoCookieName !== void 0) {
    console.warn(
      '[SSO SDK] validateSsoCookie / ssoCookieName \u5DF2\u5E9F\u5F03\uFF1A\u4E3B\u7AD9\u4F1A\u8BDD Cookie\uFF08__Host-user_token\uFF09\u662F\u4E3B\u7AD9\u5185\u90E8 token\uFF08type="user"\uFF09\uFF0Cintrospect \u7AEF\u70B9\u53EA\u63A5\u53D7 access_token\uFF0C\u6821\u9A8C\u5FC5\u7136\u5931\u8D25\uFF1B\u4E14 __Host- Cookie \u4E0D\u4F1A\u4E0B\u53D1\u5230\u5B50\u57DF\u3002\u8BE5\u5FEB\u901F\u901A\u9053\u4ECE\u672A\u751F\u6548\uFF0C\u5DF2\u79FB\u9664\u3002\u8BF7\u5220\u9664\u8FD9\u4E24\u4E2A\u914D\u7F6E\u9879\uFF1B\u4F1A\u8BDD\u68C0\u6D4B\u4EE5\u672C\u7AD9 access_token Cookie \u4E3A\u51C6\u3002'
    );
  }
  if (!clientSecret) {
    console.warn(
      "[SSO SDK] \u672A\u914D\u7F6E clientSecret\uFF08Public Client \u6A21\u5F0F\uFF09\uFF1Aintrospection \u65E0\u5BA2\u6237\u7AEF\u8BA4\u8BC1\uFF0C\u4E2D\u95F4\u4EF6\u5224\u5B9A\u7ED3\u679C\u4EC5\u4F5C UX \u53C2\u8003\u3002Confidential Client\uFF08BFF\uFF09\u8BF7\u914D\u7F6E clientSecret\u3002"
    );
  }
  return async function ssoMiddleware(request) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon.ico") || pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)) {
      return NextResponse.next();
    }
    if (pathname === callbackPath) {
      return NextResponse.next();
    }
    const allPublicPaths = [callbackPath, ...publicPaths];
    if (matchesPath(pathname, allPublicPaths)) {
      return NextResponse.next();
    }
    const accessTokenCookie = request.cookies.get(accessTokenCookieName);
    if (accessTokenCookie?.value) {
      const introspectResult = await introspectAccessToken(
        accessTokenCookie.value,
        normalizedServerBase,
        clientId,
        clientSecret
      );
      if (introspectResult === "active") {
        return NextResponse.next();
      }
      if (introspectResult === "unreachable") {
        if (failClosedOnIntrospectionError) {
          console.warn(
            "[SSO SDK] introspection \u4E0D\u53EF\u8FBE\uFF08\u7F51\u7EDC\u5F02\u5E38/\u8D85\u65F6/5xx\uFF09\uFF0CfailClosedOnIntrospectionError=true\uFF0C\u5BF9\u6301\u6709 SSO access token Cookie \u7684\u8BF7\u6C42 fail-closed \u8FD4\u56DE 502\u3002"
          );
          return new NextResponse(
            "SSO \u8BA4\u8BC1\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF08introspection unreachable\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
            { status: 502 }
          );
        }
        console.warn(
          "[SSO SDK] introspection \u4E0D\u53EF\u8FBE\uFF08\u7F51\u7EDC\u5F02\u5E38/\u8D85\u65F6/5xx\uFF09\uFF0C\u5BF9\u6301\u6709 SSO access token Cookie \u7684\u8BF7\u6C42 fail-open \u653E\u884C\uFF1B\u654F\u611F\u6570\u636E\u7684\u9274\u6743\u7531 Route Handler \u515C\u5E95\u3002"
        );
        return NextResponse.next();
      }
    }
    const state = generateRandomString(32);
    const nonce = generateRandomString(43);
    const verifier = generateRandomString(64);
    const challenge = await computeCodeChallenge(verifier);
    const authorizeParams = new URLSearchParams();
    authorizeParams.set("response_type", "code");
    authorizeParams.set("client_id", clientId);
    authorizeParams.set("redirect_uri", redirectUri);
    authorizeParams.set("scope", scopes);
    authorizeParams.set("state", state);
    authorizeParams.set("nonce", nonce);
    authorizeParams.set("code_challenge", challenge);
    authorizeParams.set("code_challenge_method", "S256");
    const loginUrl = new URL("/api/oauth/authorize", normalizedBase);
    loginUrl.search = authorizeParams.toString();
    const response = NextResponse.redirect(loginUrl);
    const attemptSuffix = `_${state}`;
    response.cookies.set(
      `${stateCookieName}${attemptSuffix}`,
      state,
      getHostCookieOptions(600, secureCookies)
    );
    response.cookies.set(
      `${nonceCookieName}${attemptSuffix}`,
      nonce,
      getHostCookieOptions(600, secureCookies)
    );
    response.cookies.set(
      `${verifierCookieName}${attemptSuffix}`,
      verifier,
      getSecureCookieOptions(600, callbackPath, secureCookies)
    );
    const safeReturnUrl = (request.nextUrl.pathname + request.nextUrl.search).slice(0, 2048);
    response.cookies.set(
      `${returnUrlCookieName}${attemptSuffix}`,
      safeReturnUrl,
      getHostCookieOptions(600, secureCookies)
    );
    if (accessTokenCookie?.value) {
      response.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    }
    return response;
  };
}

// src/next/callback.ts
import { NextResponse as NextResponse2 } from "next/server";

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
var UNSAFE_URL_CHAR_PATTERN = /[\\\u0000-\u001F\u007F]/;
function isTrustedReturnUrl(url, currentOrigin) {
  if (!url) return false;
  if (UNSAFE_URL_CHAR_PATTERN.test(url)) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return parsed.origin === currentOrigin;
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
var FETCH_TIMEOUT_MS = 1e4;
async function fetchDiscoveryDoc(baseUrl) {
  const now = Date.now();
  if (cachedDiscovery && cachedDiscovery.baseUrl === baseUrl && now - cachedDiscovery.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedDiscovery.doc;
  }
  try {
    const res = await fetch(`${baseUrl}/api/oauth/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const doc = await res.json();
    cachedDiscovery = { baseUrl, doc, fetchedAt: now };
    return doc;
  } catch {
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
    const res = await fetch(jwksUri, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...options.forceRefresh ? { cache: "no-cache" } : {}
    });
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
  const { rejectHs256WhenRs256Available = true, expectedNonce } = options;
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
  if (expectedNonce !== void 0) {
    const tokenNonce = typeof payload.nonce === "string" ? payload.nonce : "";
    if (!tokenNonce || !timingSafeEqualString(expectedNonce, tokenNonce)) {
      throw new SsoError("id_token_nonce_mismatch", "ID Token nonce \u4E0D\u5339\u914D");
    }
  }
  return { sub: payload.sub };
}

// src/next/callback.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
function buildErrorPage(status, error, errorDescription) {
  const safeDescription = escapeHtml(errorDescription);
  const safeError = escapeHtml(error);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>\u767B\u5F55\u5931\u8D25</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #fafafa; color: #2c2c2c; }
  main { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; font-weight: 500; letter-spacing: 0.08em; margin: 0 0 0.75rem; }
  p { margin: 0 0 1.5rem; color: #6b7280; font-size: 0.875rem; line-height: 1.6; max-width: 28rem; }
  .actions { display: flex; gap: 0.75rem; }
  a { display: inline-block; padding: 0.6rem 1.4rem; font-size: 0.8125rem; letter-spacing: 0.08em; text-decoration: none; }
  a.primary { background: #2c2c2c; color: #fff; }
  a.secondary { border: 1px solid rgba(44, 44, 44, 0.25); color: #2c2c2c; }
  .code { margin-top: 2rem; font-size: 0.6875rem; color: #9ca3af; }
</style>
</head>
<body>
<main>
  <h1>\u767B\u5F55\u5931\u8D25</h1>
  <p>${safeDescription}</p>
  <div class="actions">
    <a class="primary" href="/">\u91CD\u65B0\u767B\u5F55</a>
    <a class="secondary" href="/">\u8FD4\u56DE\u9996\u9875</a>
  </div>
  <p class="code">\u9519\u8BEF\u7801\uFF1A${safeError}\uFF08\u53CD\u9988\u95EE\u9898\u65F6\u8BF7\u9644\u4E0A\uFF09</p>
</main>
</body>
</html>`;
}
function buildErrorResponse(request, status, error, errorDescription, custom) {
  if (custom) {
    const handled = custom({ error, errorDescription, status, request });
    if (handled instanceof Promise) {
      return handled.then(
        (res) => res ? toNextResponse(res) : defaultErrorResponse(request, status, error, errorDescription)
      );
    }
    if (handled) return toNextResponse(handled);
  }
  return defaultErrorResponse(request, status, error, errorDescription);
}
function toNextResponse(res) {
  if (res instanceof NextResponse2) return res;
  return new NextResponse2(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}
function defaultErrorResponse(request, status, error, errorDescription) {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && request.nextUrl.searchParams.get("format") !== "json";
  if (wantsHtml) {
    return new NextResponse2(buildErrorPage(status, error, errorDescription), {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
  return NextResponse2.json({ error, error_description: errorDescription }, { status });
}
function createCallbackRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    defaultReturnPath = "/",
    scopes,
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit, fallback) => insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const nonceCookieName = pickName(config.nonceCookieName, DEFAULT_NONCE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");
  return async function GET(request) {
    const response = await handleCallback(request);
    if (response.status >= 400) {
      if (config.debug) {
        console.warn(
          `[SSO SDK] \u56DE\u8C03\u5931\u8D25 status=${response.status}`,
          request.nextUrl.searchParams.get("error") ?? ""
        );
      }
      response.cookies.set(nonceCookieName, "", getHostCookieOptions(0, secureCookies));
      const returnedState = request.nextUrl.searchParams.get("state");
      if (returnedState && /^[A-Za-z0-9\-._~]{8,512}$/.test(returnedState)) {
        response.cookies.set(
          `${nonceCookieName}_${returnedState}`,
          "",
          getHostCookieOptions(0, secureCookies)
        );
      }
    }
    return response;
  };
  async function handleCallback(request) {
    const { searchParams } = request.nextUrl;
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return buildErrorResponse(
        request,
        400,
        "authorization_failed",
        desc,
        config.renderErrorPage
      );
    }
    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    if (!code) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "\u767B\u5F55\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55",
        config.renderErrorPage
      );
    }
    if (!returnedState || !/^[A-Za-z0-9\-._~]{8,512}$/.test(returnedState)) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "State \u53C2\u6570\u7F3A\u5931\u6216\u683C\u5F0F\u975E\u6CD5\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42",
        config.renderErrorPage
      );
    }
    const attemptSuffix = `_${returnedState}`;
    const readTransientCookie = (name) => request.cookies.get(`${name}${attemptSuffix}`)?.value ?? request.cookies.get(name)?.value;
    const savedState = readTransientCookie(stateCookieName);
    if (!savedState) {
      const alternateName = secureCookies ? toInsecureCookieName(stateCookieName) : DEFAULT_STATE_COOKIE_NAME;
      const alternateValue = request.cookies.get(`${alternateName}${attemptSuffix}`)?.value ?? request.cookies.get(alternateName)?.value;
      if (alternateValue) {
        return buildErrorResponse(
          request,
          500,
          "invalid_config",
          "\u68C0\u6D4B\u5230 SSO SDK \u914D\u7F6E\u4E0D\u4E00\u81F4\uFF1Amiddleware \u4E0E callback \u7684 insecureLocalDev \u6216 Cookie \u540D\u79F0\u4E0D\u5339\u914D\uFF0C\u8BF7\u7EDF\u4E00\u914D\u7F6E",
          config.renderErrorPage
        );
      }
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "\u767B\u5F55\u4F1A\u8BDD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42",
        config.renderErrorPage
      );
    }
    if (!timingSafeEqualString(returnedState, savedState)) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "\u767B\u5F55\u4F1A\u8BDD\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42",
        config.renderErrorPage
      );
    }
    const expectedNonce = readTransientCookie(nonceCookieName);
    const verifier = readTransientCookie(verifierCookieName);
    if (!verifier) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "\u767B\u5F55\u4F1A\u8BDD\u5DF2\u8FC7\u671F\uFF08\u53EF\u80FD\u5207\u6362\u4E86\u6807\u7B7E\u9875\uFF09\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55",
        config.renderErrorPage
      );
    }
    const tokenEndpoint = `${normalizedServerBase}/api/oauth/token`;
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
          return buildErrorResponse(
            request,
            502,
            "server_error",
            "\u767B\u5F55\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF08Token \u8BF7\u6C42\u5931\u8D25\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
            config.renderErrorPage
          );
        }
      }
    }
    if (lastError || !res) {
      return buildErrorResponse(
        request,
        502,
        "server_error",
        "\u767B\u5F55\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF08Token \u8BF7\u6C42\u5931\u8D25\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
        config.renderErrorPage
      );
    }
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch {
      }
      return buildErrorResponse(
        request,
        502,
        "token_request_failed",
        errData.error_description || `\u767B\u5F55\u5931\u8D25\uFF08Token \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`,
        config.renderErrorPage
      );
    }
    const tokenData = await res.json();
    if (!tokenData.access_token || !tokenData.refresh_token || typeof tokenData.expires_in !== "number" || !Number.isFinite(tokenData.expires_in) || tokenData.expires_in <= 0) {
      return buildErrorResponse(
        request,
        502,
        "server_error",
        "\u767B\u5F55\u670D\u52A1\u8FD4\u56DE\u5F02\u5E38\uFF08Token \u54CD\u5E94\u4E0D\u5B8C\u6574\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
        config.renderErrorPage
      );
    }
    const requiresIdToken = scopes !== void 0 && scopes.split(" ").filter(Boolean).includes("openid");
    if (requiresIdToken && !tokenData.id_token) {
      return buildErrorResponse(
        request,
        400,
        "id_token_invalid",
        "\u767B\u5F55\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55",
        config.renderErrorPage
      );
    }
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId,
          { expectedNonce }
        );
      } catch (err) {
        return buildErrorResponse(
          request,
          400,
          "id_token_invalid",
          err instanceof Error && /[\u4e00-\u9fff]/.test(err.message) ? err.message : "\u767B\u5F55\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55",
          config.renderErrorPage
        );
      }
    }
    const callbackOrigin = new URL(redirectUri).origin;
    const rawReturnUrl = readTransientCookie(returnUrlCookieName) || defaultReturnPath;
    const returnUrl = isTrustedReturnUrl(rawReturnUrl, callbackOrigin) ? rawReturnUrl : "/";
    const response = NextResponse2.redirect(new URL(returnUrl, callbackOrigin));
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
    for (const name of [stateCookieName, nonceCookieName, returnUrlCookieName]) {
      response.cookies.set(name, "", getHostCookieOptions(0, secureCookies));
      response.cookies.set(`${name}${attemptSuffix}`, "", getHostCookieOptions(0, secureCookies));
    }
    for (const path of ["/", request.nextUrl.pathname]) {
      response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, path, secureCookies));
      response.cookies.set(
        `${verifierCookieName}${attemptSuffix}`,
        "",
        getSecureCookieOptions(0, path, secureCookies)
      );
    }
    return response;
  }
}

// src/next/logout.ts
import { NextResponse as NextResponse3 } from "next/server";

// src/core/discovery.ts
var DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1e3;
var FETCH_TIMEOUT_MS2 = 5e3;
var cache = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
function fetchDiscoveryCached(baseUrl) {
  const hit = cache.get(baseUrl);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.doc);
  }
  const existing = inflight.get(baseUrl);
  if (existing) return existing;
  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS2);
    try {
      const res = await fetch(`${baseUrl}/api/oauth/.well-known/openid-configuration`, {
        signal: controller.signal
      });
      if (!res.ok) return null;
      const doc = await res.json();
      cache.set(baseUrl, { doc, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
      return doc;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      inflight.delete(baseUrl);
    }
  })();
  inflight.set(baseUrl, promise);
  return promise;
}

// src/next/logout.ts
function buildLogoutConfirmHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>\u786E\u8BA4\u9000\u51FA\u767B\u5F55</title>
</head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;">
  <form method="post" style="text-align:center;">
    <p>\u786E\u5B9A\u8981\u9000\u51FA\u767B\u5F55\u5417\uFF1F</p>
    <label style="display:flex;align-items:center;justify-content:center;gap:6px;margin:12px 0;font-size:14px;color:#374151;cursor:pointer;">
      <input type="checkbox" name="global" value="1">\u540C\u65F6\u9000\u51FA\u6240\u6709 NIHPLOD \u5E73\u53F0
    </label>
    <button type="submit" style="padding:10px 20px;background-color:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">\u9000\u51FA\u767B\u5F55</button>
    <p><a href="/" style="color:#2563eb;text-decoration:underline;">\u53D6\u6D88\u5E76\u8FD4\u56DE\u9996\u9875</a></p>
  </form>
</body>
</html>`;
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
    callbackPath = "/api/auth/callback",
    insecureLocalDev: insecureLocalDevOpt = false
  } = config;
  let defaultScope = config.defaultScope ?? "local";
  if (config.redirectToSso !== void 0) {
    console.warn(
      '[SSO SDK] redirectToSso \u5DF2\u5F03\u7528\uFF0C\u8BF7\u6539\u7528 defaultScope\uFF08redirectToSso: true \u2192 defaultScope: "global"\uFF0Cfalse \u2192 "local"\uFF09\u3002\u6CE8\u610F\uFF1A\u9ED8\u8BA4\u9000\u51FA\u8303\u56F4\u5DF2\u53D8\u66F4\u4E3A "local"\uFF08\u4EC5\u9000\u51FA\u672C\u7AD9\uFF0C\u4E0D\u8DF3\u8F6C SSO \u4E2D\u5FC3\uFF09\u3002'
    );
    if (config.defaultScope === void 0) {
      defaultScope = config.redirectToSso ? "global" : "local";
    }
  }
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit, fallback) => insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const nonceCookieName = pickName(config.nonceCookieName, DEFAULT_NONCE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);
  const logoutStateCookieName = pickName(config.logoutStateCookieName, DEFAULT_LOGOUT_STATE_COOKIE_NAME);
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");
  const callbackOrigin = new URL(redirectUri).origin;
  return async function handler(request) {
    const returnedState = request.nextUrl.searchParams.get("state");
    if (returnedState) {
      const savedState = request.cookies.get(logoutStateCookieName)?.value;
      if (!savedState || savedState !== returnedState) {
        return NextResponse3.json(
          { error: "invalid_request", error_description: "Logout state \u4E0D\u5339\u914D" },
          { status: 400 }
        );
      }
      const res = NextResponse3.redirect(callbackOrigin + "/");
      res.cookies.set(logoutStateCookieName, "", getHostCookieOptions(0, secureCookies));
      return res;
    }
    if (request.method === "GET") {
      return new NextResponse3(buildLogoutConfirmHtml(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== callbackOrigin) {
      return NextResponse3.json(
        { error: "forbidden", error_description: "\u8DE8\u7AD9\u8BF7\u6C42\u88AB\u62D2\u7EDD" },
        { status: 403 }
      );
    }
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (!requestOrigin && secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
      return NextResponse3.json(
        { error: "forbidden", error_description: "\u8DE8\u7AD9\u8BF7\u6C42\u88AB\u62D2\u7EDD" },
        { status: 403 }
      );
    }
    let formGlobal = null;
    try {
      formGlobal = new URLSearchParams(await request.text()).get("global");
    } catch {
    }
    const effectiveScope = formGlobal !== null ? formGlobal === "1" || formGlobal === "true" ? "global" : "local" : defaultScope;
    const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
    const idTokenHint = request.cookies.get(idTokenCookieName)?.value;
    if (refreshToken) {
      try {
        const discovery = config.serverBaseUrl ? null : await fetchDiscoveryCached(normalizedServerBase);
        const revokeUrl = config.serverBaseUrl ? `${normalizedServerBase}/api/oauth/revoke` : discovery?.revocation_endpoint || `${normalizedBase}/api/oauth/revoke`;
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
          body: body.toString(),
          signal: AbortSignal.timeout(3e3)
        });
      } catch {
      }
    }
    const clearCookies = (res) => {
      res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(stateCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(nonceCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/", secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, callbackPath, secureCookies));
      const suffixedPrefixes = [
        `${stateCookieName}_`,
        `${nonceCookieName}_`,
        `${returnUrlCookieName}_`,
        `${verifierCookieName}_`
      ];
      for (const cookie of request.cookies.getAll()) {
        if (!suffixedPrefixes.some((prefix) => cookie.name.startsWith(prefix))) continue;
        if (cookie.name.startsWith(`${verifierCookieName}_`)) {
          res.cookies.set(cookie.name, "", getSecureCookieOptions(0, "/", secureCookies));
          res.cookies.set(cookie.name, "", getSecureCookieOptions(0, callbackPath, secureCookies));
        } else {
          res.cookies.set(cookie.name, "", getHostCookieOptions(0, secureCookies));
        }
      }
      return res;
    };
    if (effectiveScope === "global") {
      const discovery = await fetchDiscoveryCached(normalizedServerBase);
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
      const res = clearCookies(NextResponse3.redirect(logoutUrl.toString()));
      res.cookies.set(logoutStateCookieName, logoutState, getHostCookieOptions(600, secureCookies));
      return res;
    }
    return clearCookies(
      NextResponse3.redirect(callbackOrigin + "/")
    );
  };
}

// src/next/backchannel-logout.ts
import { NextResponse as NextResponse4 } from "next/server";

// src/core/logout-token.ts
var BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
var JTI_CACHE_CAPACITY = 1e3;
var seenJti = /* @__PURE__ */ new Map();
function releaseLogoutTokenJti(jti) {
  seenJti.delete(jti);
}
function recordJti(jti, expiresAtMs) {
  const now = Date.now();
  const existing = seenJti.get(jti);
  if (existing !== void 0 && existing > now) return false;
  for (const [key, exp] of seenJti) {
    if (exp <= now) seenJti.delete(key);
  }
  while (seenJti.size >= JTI_CACHE_CAPACITY) {
    const oldest = seenJti.keys().next().value;
    if (oldest === void 0) break;
    seenJti.delete(oldest);
  }
  seenJti.set(jti, expiresAtMs);
  return true;
}
async function verifyLogoutTokenDetailed(logoutToken, ssoBaseUrl, clientId) {
  const baseUrl = ssoBaseUrl.replace(/\/+$/, "");
  const header = decodeJwtHeader(logoutToken);
  if (!header) {
    throw new SsoError("logout_token_invalid", "Logout Token \u683C\u5F0F\u9519\u8BEF");
  }
  if (header.alg !== "RS256") {
    throw new SsoError(
      "logout_token_unsupported_alg",
      `\u4E0D\u652F\u6301\u7684 Logout Token \u7B7E\u540D\u7B97\u6CD5: ${String(header.alg)}`
    );
  }
  const discovery = await fetchDiscoveryDoc(baseUrl);
  const normalizedIssuer = (discovery?.issuer || baseUrl).replace(/\/+$/, "");
  const jwks = await fetchJwks(baseUrl);
  if (!jwks) {
    throw new SsoError(
      "logout_token_invalid_signature",
      "\u65E0\u6CD5\u83B7\u53D6 JWKS \u9A8C\u8BC1 Logout Token \u7B7E\u540D"
    );
  }
  const kid = typeof header.kid === "string" ? header.kid : void 0;
  const matchCandidates = (set) => set.keys.filter(
    (k) => k.kty === "RSA" && k.alg === "RS256" && k.use === "sig" && (kid ? k.kid === kid : true)
  );
  const verifyAny = async (keys) => {
    for (const key of keys) {
      if (await verifyRs256Signature(logoutToken, key)) return true;
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
    throw new SsoError(
      "logout_token_invalid_signature",
      "JWKS \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684 RS256 \u516C\u94A5"
    );
  }
  if (!validSig) {
    throw new SsoError(
      "logout_token_invalid_signature",
      "Logout Token \u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25"
    );
  }
  const payload = decodeJwtPayload(logoutToken);
  if (!payload) {
    throw new SsoError("logout_token_invalid", "Logout Token payload \u89E3\u6790\u5931\u8D25");
  }
  const tokenIssuer = typeof payload.iss === "string" ? payload.iss.replace(/\/+$/, "") : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new SsoError(
      "logout_token_issuer_mismatch",
      "Logout Token issuer \u4E0D\u5339\u914D"
    );
  }
  const aud = payload.aud;
  const audList = Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : [];
  if (!audList.includes(clientId)) {
    throw new SsoError(
      "logout_token_audience_mismatch",
      "Logout Token audience \u4E0D\u5339\u914D"
    );
  }
  if (typeof payload.exp !== "number") {
    throw new SsoError("logout_token_invalid", "Logout Token \u7F3A\u5C11 exp \u58F0\u660E");
  }
  if (Date.now() >= payload.exp * 1e3 + 6e4) {
    throw new SsoError("logout_token_expired", "Logout Token \u5DF2\u8FC7\u671F");
  }
  if (payload.type !== "logout_token") {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token type \u5FC5\u987B\u4E3A logout_token"
    );
  }
  const events = payload.events;
  if (!events || typeof events !== "object" || Array.isArray(events)) {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token \u7F3A\u5C11 backchannel-logout events \u58F0\u660E"
    );
  }
  const logoutEvent = events[BACKCHANNEL_LOGOUT_EVENT];
  if (!logoutEvent || typeof logoutEvent !== "object" || Array.isArray(logoutEvent)) {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token \u7F3A\u5C11 backchannel-logout events \u58F0\u660E"
    );
  }
  const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : void 0;
  const sid = typeof payload.sid === "string" && payload.sid ? payload.sid : void 0;
  if (!sub && !sid) {
    throw new SsoError(
      "logout_token_invalid",
      "Logout Token \u5FC5\u987B\u5305\u542B sub \u6216 sid \u81F3\u5C11\u5176\u4E00"
    );
  }
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  if (!jti) {
    throw new SsoError("logout_token_invalid", "Logout Token \u7F3A\u5C11 jti \u58F0\u660E");
  }
  if (!recordJti(jti, payload.exp * 1e3 + 6e4)) {
    throw new SsoError("logout_token_replay", "Logout Token jti \u91CD\u653E");
  }
  return { payload: { sub, sid }, jti };
}

// src/next/backchannel-logout.ts
function createBackchannelLogoutRouteHandler(config) {
  const { clientId, ssoBaseUrl, onLogout } = config;
  const insecureLocalDev = resolveInsecureLocalDev(
    config.insecureLocalDev ?? false,
    ssoBaseUrl
  );
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit, fallback) => insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(
    config.accessTokenCookieName,
    DEFAULT_ACCESS_TOKEN_COOKIE_NAME
  );
  const refreshTokenCookieName = pickName(
    config.refreshTokenCookieName,
    DEFAULT_REFRESH_TOKEN_COOKIE_NAME
  );
  const idTokenCookieName = pickName(
    config.idTokenCookieName,
    DEFAULT_ID_TOKEN_COOKIE_NAME
  );
  return async function handler(request) {
    if (request.method !== "POST") {
      return NextResponse4.json(
        { error: "method_not_allowed", error_description: "\u4EC5\u63A5\u53D7 POST \u8BF7\u6C42" },
        { status: 405 }
      );
    }
    const logoutToken = new URLSearchParams(await request.text()).get(
      "logout_token"
    );
    if (!logoutToken) {
      return NextResponse4.json(
        { error: "invalid_request", error_description: "\u7F3A\u5C11 logout_token" },
        { status: 400 }
      );
    }
    let verified;
    try {
      verified = await verifyLogoutTokenDetailed(logoutToken, ssoBaseUrl, clientId);
    } catch (err) {
      const code = err instanceof SsoError ? err.code : "logout_token_invalid";
      const description = err instanceof SsoError ? err.description : "Logout Token \u9A8C\u8BC1\u5931\u8D25";
      return NextResponse4.json(
        { error: code, error_description: description },
        { status: 400 }
      );
    }
    try {
      await onLogout?.(verified.payload, request);
    } catch (err) {
      releaseLogoutTokenJti(verified.jti);
      console.error(
        "[SSO SDK] backchannel logout onLogout \u94A9\u5B50\u6267\u884C\u5931\u8D25:",
        err
      );
      return NextResponse4.json(
        { error: "server_error", error_description: "onLogout \u5904\u7406\u5931\u8D25" },
        { status: 500 }
      );
    }
    const res = new NextResponse4(null, { status: 200 });
    res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    return res;
  };
}
export {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  DEFAULT_NONCE_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  createBackchannelLogoutRouteHandler,
  createCallbackRouteHandler,
  createLogoutRouteHandler,
  createSsoMiddleware,
  getHostCookieOptions,
  getSecureCookieOptions,
  toInsecureCookieName
};
//# sourceMappingURL=index.mjs.map