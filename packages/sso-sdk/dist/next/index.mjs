// src/next/middleware.ts
import { NextResponse } from "next/server";
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
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
function createSsoMiddleware(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    scopes = "openid profile",
    publicPaths = [],
    callbackPath = "/api/auth/callback",
    ssoCookieName = "__Host-user_token"
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
    const accessTokenCookie = request.cookies.get("nihplod_sso_at");
    if (accessTokenCookie?.value) {
      const payload = decodeJwtPayload(accessTokenCookie.value);
      if (payload?.exp && typeof payload.exp === "number") {
        const expMs = payload.exp * 1e3;
        if (Date.now() < expMs) {
          return NextResponse.next();
        }
      } else {
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
    response.cookies.set("nihplod_sso_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600
      // 10 分钟
    });
    response.cookies.set("nihplod_sso_verifier", verifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: callbackPath,
      maxAge: 600
    });
    response.cookies.set("nihplod_sso_return", request.url, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600
    });
    return response;
  };
}

// src/next/callback.ts
import { NextResponse as NextResponse2 } from "next/server";
function createCallbackRouteHandler(config) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    tokenCookieName = "nihplod_sso_at",
    cookieDomain,
    defaultReturnPath = "/"
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
    const savedState = request.cookies.get("nihplod_sso_state")?.value;
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
    const verifier = request.cookies.get("nihplod_sso_verifier")?.value;
    const tokenEndpoint = `${normalizedBase}/api/oauth/token`;
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", clientId);
    body.set("redirect_uri", redirectUri);
    if (verifier) {
      body.set("code_verifier", verifier);
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
    const returnUrl = request.cookies.get("nihplod_sso_return")?.value || defaultReturnPath;
    const response = NextResponse2.redirect(new URL(returnUrl, request.url));
    response.cookies.set(tokenCookieName, tokenData.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: tokenData.expires_in,
      domain: cookieDomain
    });
    const refreshMaxAge = tokenData.refresh_expires_in != null ? tokenData.refresh_expires_in : 30 * 24 * 60 * 60;
    response.cookies.set("nihplod_sso_rt", tokenData.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refreshMaxAge,
      domain: cookieDomain
    });
    const clearCookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0
    };
    response.cookies.set("nihplod_sso_state", "", clearCookieOpts);
    response.cookies.set("nihplod_sso_return", "", clearCookieOpts);
    response.cookies.set("nihplod_sso_verifier", "", clearCookieOpts);
    return response;
  };
}
export {
  createCallbackRouteHandler,
  createSsoMiddleware
};
//# sourceMappingURL=index.mjs.map