// src/next/middleware.ts
import { NextResponse } from "next/server";

// src/next/constants.ts
var DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
var DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
var DEFAULT_ID_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_id";
var DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
var DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
var DEFAULT_VERIFIER_COOKIE_NAME = "__Secure-nihplod_sso_verifier";
function getHostCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...maxAge !== void 0 ? { maxAge } : {}
  };
}
function getSecureCookieOptions(maxAge, path = "/") {
  return {
    httpOnly: true,
    secure: true,
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
async function introspectAccessToken(token, ssoBaseUrl, clientId, clientSecret) {
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
    if (!res.ok) return false;
    const data = await res.json();
    return data.active === true;
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
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME
  } = config;
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
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
    const ssoSession = request.cookies.get(ssoCookieName);
    if (ssoSession?.value) {
      return NextResponse.next();
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
        return NextResponse.next();
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
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(stateCookieName, state, getHostCookieOptions(600));
    response.cookies.set(verifierCookieName, verifier, getSecureCookieOptions(600, callbackPath));
    response.cookies.set(returnUrlCookieName, request.url, getHostCookieOptions(600));
    if (accessTokenCookie?.value) {
      response.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0));
    }
    return response;
  };
}

// src/next/callback.ts
import { NextResponse as NextResponse2 } from "next/server";
function isTrustedReturnUrl(url, currentOrigin) {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).origin === currentOrigin;
  } catch {
    return false;
  }
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
async function fetchJwks(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/oauth/jwks`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function verifyRs256Signature(token, jwk) {
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
async function computeAtHash(accessToken) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessToken)
  );
  const bytes = new Uint8Array(hash);
  const half = bytes.slice(0, bytes.length / 2);
  let binary = "";
  for (const b of half) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function validateIdToken(idToken, accessToken, expectedIssuer, expectedClientId) {
  const header = decodeJwtHeader(idToken);
  if (!header) throw new Error("ID Token \u683C\u5F0F\u9519\u8BEF");
  const alg = header.alg;
  if (typeof alg !== "string" || alg !== "RS256" && alg !== "HS256") {
    throw new Error(`\u4E0D\u652F\u6301\u7684 ID Token \u7B7E\u540D\u7B97\u6CD5: ${alg}`);
  }
  if (alg === "RS256") {
    const jwks = await fetchJwks(expectedIssuer);
    if (!jwks) throw new Error("\u65E0\u6CD5\u83B7\u53D6 JWKS");
    const kid = typeof header.kid === "string" ? header.kid : void 0;
    const key = jwks.keys.find(
      (k) => k.kty === "RSA" && k.alg === "RS256" && k.use === "sig" && (kid ? k.kid === kid : true)
    );
    if (!key) throw new Error("JWKS \u4E2D\u672A\u627E\u5230\u5339\u914D\u516C\u94A5");
    const valid = await verifyRs256Signature(idToken, key);
    if (!valid) throw new Error("ID Token \u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25");
  }
  if (alg === "HS256") {
    console.warn(
      "[SSO SDK/Next] ID Token \u4F7F\u7528 HS256 \u7B7E\u540D\u3002\u5EFA\u8BAE\u4E3B\u7AD9\u542F\u7528 RS256 \u4EE5\u83B7\u5F97\u5B8C\u6574\u7B7E\u540D\u9A8C\u8BC1\u3002"
    );
  }
  const payload = decodeJwtPayload(idToken);
  if (!payload) throw new Error("ID Token payload \u89E3\u6790\u5931\u8D25");
  const normalizedIssuer = expectedIssuer.replace(/\/+$/, "");
  const tokenIssuer = typeof payload.iss === "string" ? payload.iss.replace(/\/+$/, "") : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new Error("ID Token issuer \u4E0D\u5339\u914D");
  }
  const aud = payload.aud;
  const audArr = Array.isArray(aud) ? aud : [aud];
  if (!audArr.includes(expectedClientId)) {
    throw new Error("ID Token audience \u4E0D\u5339\u914D");
  }
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1e3) {
    throw new Error("ID Token \u5DF2\u8FC7\u671F");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("ID Token \u7F3A\u5C11 sub");
  }
  if (typeof payload.at_hash === "string" && payload.at_hash) {
    const actual = await computeAtHash(accessToken);
    if (actual !== payload.at_hash) {
      throw new Error("ID Token at_hash \u4E0D\u5339\u914D");
    }
  }
}
function createCallbackRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    defaultReturnPath = "/",
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    refreshTokenCookieName = DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
    idTokenCookieName = DEFAULT_ID_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME
  } = config;
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  return async function GET(request) {
    const { searchParams } = request.nextUrl;
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return NextResponse2.json(
        { error: "authorization_failed", error_description: desc },
        { status: 400 }
      );
    }
    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    if (!code) {
      return NextResponse2.json(
        {
          error: "invalid_request",
          error_description: "\u7F3A\u5C11 authorization code"
        },
        { status: 400 }
      );
    }
    const savedState = request.cookies.get(stateCookieName)?.value;
    if (!savedState) {
      return NextResponse2.json(
        {
          error: "invalid_request",
          error_description: "State \u53C2\u6570\u7F3A\u5931\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u6388\u6743\u8BF7\u6C42"
        },
        { status: 400 }
      );
    }
    if (returnedState !== savedState) {
      return NextResponse2.json(
        {
          error: "invalid_request",
          error_description: "State \u53C2\u6570\u4E0D\u5339\u914D\uFF0C\u53EF\u80FD\u5B58\u5728 CSRF \u653B\u51FB"
        },
        { status: 400 }
      );
    }
    const verifier = request.cookies.get(verifierCookieName)?.value;
    if (!verifier) {
      return NextResponse2.json(
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
    let res;
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
          return NextResponse2.json(
            { error: "server_error", error_description: "Token \u8BF7\u6C42\u5931\u8D25\uFF0C\u5DF2\u91CD\u8BD5\u4ECD\u4E0D\u53EF\u8FBE" },
            { status: 502 }
          );
        }
      }
    }
    if (lastError || !res) {
      return NextResponse2.json(
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
      return NextResponse2.json(
        {
          error: "token_request_failed",
          error_description: errData.error_description || `Token \u8BF7\u6C42\u5931\u8D25: HTTP ${res.status}`
        },
        { status: 502 }
      );
    }
    const tokenData = await res.json();
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId
        );
      } catch (err) {
        return NextResponse2.json(
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
    const response = NextResponse2.redirect(new URL(returnUrl, request.url));
    response.cookies.set(accessTokenCookieName, tokenData.access_token, {
      ...getHostCookieOptions(tokenData.expires_in)
    });
    const refreshMaxAge = tokenData.refresh_expires_in != null ? tokenData.refresh_expires_in : 30 * 24 * 60 * 60;
    response.cookies.set(refreshTokenCookieName, tokenData.refresh_token, {
      ...getHostCookieOptions(refreshMaxAge)
    });
    if (tokenData.id_token) {
      response.cookies.set(idTokenCookieName, tokenData.id_token, {
        ...getHostCookieOptions(refreshMaxAge)
      });
    }
    response.cookies.set(stateCookieName, "", getHostCookieOptions(0));
    response.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/"));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, request.nextUrl.pathname));
    return response;
  };
}

// src/next/logout.ts
import { NextResponse as NextResponse3 } from "next/server";
async function fetchDiscovery(ssoBaseUrl) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5e3);
    const res = await fetch(
      `${ssoBaseUrl}/api/oauth/.well-known/openid-configuration`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function createLogoutRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    postLogoutRedirectUri = new URL(redirectUri).origin + "/",
    redirectToSso = true,
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    refreshTokenCookieName = DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
    idTokenCookieName = DEFAULT_ID_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME,
    callbackPath = "/api/auth/callback"
  } = config;
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  return async function GET(request) {
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
      res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(stateCookieName, "", getHostCookieOptions(0));
      res.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/"));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, callbackPath));
      return res;
    };
    if (redirectToSso) {
      const discovery = await fetchDiscovery(normalizedBase);
      const endSessionEndpoint = discovery?.end_session_endpoint || `${normalizedBase}/logout`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", clientId);
      logoutUrl.searchParams.set(
        "post_logout_redirect_uri",
        postLogoutRedirectUri
      );
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      return clearCookies(NextResponse3.redirect(logoutUrl.toString()));
    }
    return clearCookies(
      NextResponse3.redirect(request.nextUrl.origin + "/")
    );
  };
}
export {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  createCallbackRouteHandler,
  createLogoutRouteHandler,
  createSsoMiddleware,
  getHostCookieOptions,
  getSecureCookieOptions
};
//# sourceMappingURL=index.mjs.map