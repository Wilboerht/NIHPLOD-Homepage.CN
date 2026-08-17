/**
 * SsoClient 核心类测试
 *
 * 使用按 URL 路由的 fetch mock 模拟 Discovery / Token / JWKS / UserInfo 端点，
 * ID Token 使用真实生成的 RS256 密钥对签名（实现拒绝 HS256）。
 */
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from "vitest";
import { SsoClient } from "../core/SsoClient";
import {
  saveTokenData,
  getTokenData,
  saveOAuthState,
  getOAuthState,
  savePkceVerifier,
  getPkceVerifier,
  getLogoutState,
  getReturnUrl,
  setTokenStorage,
} from "../core/storage";
import type { TokenData } from "../core/storage";
import { SsoError } from "../core/errors";
import { clearIdTokenCaches } from "../core/id-token";

// Mock storage (in-memory Map)
const mockStore = new Map<string, string>();
const mockStorage = {
  get: (key: string) => mockStore.get(key) ?? null,
  set: (key: string, value: string) => mockStore.set(key, value),
  remove: (key: string) => mockStore.delete(key),
};

// Mock OIDC Discovery response（jwks_uri 故意与硬编码 /api/oauth/jwks 不同，
// 用于验证实现优先走 Discovery 的 jwks_uri）
const mockDiscovery = {
  issuer: "https://nihplod.cn",
  authorization_endpoint: "https://nihplod.cn/api/oauth/authorize",
  token_endpoint: "https://nihplod.cn/api/oauth/token",
  userinfo_endpoint: "https://nihplod.cn/api/oauth/userinfo",
  jwks_uri: "https://nihplod.cn/api/oauth/jwks.json",
  introspection_endpoint: "https://nihplod.cn/api/oauth/introspect",
  scopes_supported: ["openid", "profile", "phone"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
};

const defaultConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://test-app.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile",
};

const CLIENT_ID = defaultConfig.clientId;

// ============================================
// RS256 密钥对与 ID Token 构造工具
// ============================================

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;
let decoyPublicJwk: Record<string, unknown>;

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** 用真实私钥签发 RS256 ID Token；kid 传 null 表示不带 kid 头 */
async function buildRs256IdToken(
  payload: Record<string, unknown>,
  kid: string | null = "test-key-1"
): Promise<string> {
  const header: Record<string, unknown> = { alg: "RS256", typ: "JWT" };
  if (kid) header.kid = kid;
  const headerB64 = base64UrlEncodeStr(JSON.stringify(header));
  const bodyB64 = base64UrlEncodeStr(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerB64}.${bodyB64}`);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  return `${headerB64}.${bodyB64}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

/** 计算 at_hash（与实现一致：SHA-256 左半 base64url） */
async function computeAtHash(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  const bytes = new Uint8Array(hash);
  return base64UrlEncodeBytes(bytes.slice(0, bytes.length / 2));
}

// ============================================
// 按 URL 路由的 fetch mock
// ============================================

interface RouterOverrides {
  discovery?: Record<string, unknown>;
  token?: (url: string, init?: RequestInit) => unknown;
  jwks?: Record<string, unknown>;
  userinfo?: (url: string, init?: RequestInit) => unknown;
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function installFetchRouter(overrides: RouterOverrides = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init?) => {
    const url = String(input);
    calls.push({ url, init: init as RequestInit | undefined });
    if (url.includes("/.well-known/openid-configuration")) {
      return jsonResponse(overrides.discovery ?? mockDiscovery);
    }
    if (url.includes("/api/oauth/token")) {
      if (overrides.token) return overrides.token(url, init as RequestInit) as Response;
      return jsonResponse({
        access_token: "new-access-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "new-refresh-token",
      });
    }
    if (url.includes("jwks")) {
      return jsonResponse(overrides.jwks ?? { keys: [publicJwk] });
    }
    if (url.includes("/api/oauth/userinfo")) {
      if (overrides.userinfo) return overrides.userinfo(url, init as RequestInit) as Response;
      return jsonResponse({ sub: "user-123", nickname: "Test User" });
    }
    if (url.includes("/api/oauth/revoke")) {
      return jsonResponse({});
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return calls;
}

function validPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    sub: "user123",
    iss: "https://nihplod.cn",
    aud: "test-client-id",
    iat: nowSec,
    exp: nowSec + 3600,
    ...extra,
  };
}

describe("SsoClient", () => {
  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    privateKey = keyPair.privateKey;
    publicJwk = {
      ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
      alg: "RS256",
      use: "sig",
      kid: "test-key-1",
    };
    // 干扰 key：无 kid 场景下应先尝试它、失败后继续尝试正确的 key
    const decoy = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    decoyPublicJwk = {
      ...(await crypto.subtle.exportKey("jwk", decoy.publicKey)),
      alg: "RS256",
      use: "sig",
      kid: "decoy-key",
    };
  });

  beforeEach(() => {
    mockStore.clear();
    sessionStorage.clear();
    localStorage.clear();
    setTokenStorage(mockStorage);
    clearIdTokenCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("正常创建实例", () => {
      const client = new SsoClient(defaultConfig);
      expect(client.config.clientId).toBe("test-client-id");
      expect(client.config.ssoBaseUrl).toBe("https://nihplod.cn");
    });

    it("ssoBaseUrl 末尾斜杠被移除", () => {
      const client = new SsoClient({
        ...defaultConfig,
        ssoBaseUrl: "https://nihplod.cn/",
      });
      expect(client.config.ssoBaseUrl).toBe("https://nihplod.cn");
    });

    it("缺少 clientId 时抛出错误", () => {
      expect(
        () => new SsoClient({ ...defaultConfig, clientId: "" })
      ).toThrow("clientId 不能为空");
    });

    it("缺少 redirectUri 时抛出错误", () => {
      expect(
        () => new SsoClient({ ...defaultConfig, redirectUri: "" })
      ).toThrow("redirectUri 不能为空");
    });

    it("缺少 ssoBaseUrl 时抛出错误", () => {
      expect(
        () => new SsoClient({ ...defaultConfig, ssoBaseUrl: "" })
      ).toThrow("ssoBaseUrl 不能为空");
    });

    it("Public Client 可省略 clientSecret", () => {
      const client = new SsoClient({
        clientId: "public-client",
        redirectUri: "https://test-app.com/callback",
        ssoBaseUrl: "https://nihplod.cn",
      });
      expect(client.config.clientSecret).toBeUndefined();
      expect(client.config.clientId).toBe("public-client");
    });
  });

  describe("isAuthenticated", () => {
    it("无 token 时返回 false", () => {
      const client = new SsoClient(defaultConfig);
      expect(client.isAuthenticated()).toBe(false);
    });

    it("有效 token 时返回 true", () => {
      const now = Date.now();
      const token: TokenData = {
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "test-refresh",
        issued_at: now,
        expires_at: now + 900000, // 15 minutes later
      };
      saveTokenData(token, CLIENT_ID);

      const client = new SsoClient(defaultConfig);
      expect(client.isAuthenticated()).toBe(true);
    });

    it("过期 token 时返回 false（但数据保留，可走刷新路径）", () => {
      const now = Date.now();
      const token: TokenData = {
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "test-refresh",
        issued_at: now - 1000000,
        expires_at: now - 1000, // already expired
      };
      saveTokenData(token, CLIENT_ID);

      const client = new SsoClient(defaultConfig);
      expect(client.isAuthenticated()).toBe(false);
      // 过期不删除：refresh_token 仍在，刷新路径可用
      expect(getTokenData(CLIENT_ID)?.refresh_token).toBe("test-refresh");
    });
  });

  describe("login / getLoginUrl returnUrl 开放重定向校验", () => {
    it("相对路径 returnUrl 被保存（按 clientId 隔离）", async () => {
      installFetchRouter();
      const client = new SsoClient(defaultConfig);
      await client.getLoginUrl("/dashboard");
      expect(getReturnUrl(CLIENT_ID)).toBe("/dashboard");
    });

    it("跨域绝对 URL returnUrl 被拒绝", async () => {
      installFetchRouter();
      const client = new SsoClient(defaultConfig);
      await client.getLoginUrl("https://evil.com/phish");
      expect(getReturnUrl(CLIENT_ID)).toBeNull();
    });

    it("协议相对 URL（//evil.com）被拒绝", async () => {
      installFetchRouter();
      const client = new SsoClient(defaultConfig);
      await client.getLoginUrl("//evil.com/phish");
      expect(getReturnUrl(CLIENT_ID)).toBeNull();
    });
  });

  describe("handleCallback", () => {
    it("state 不匹配时抛出错误，且 state 与 verifier 一并清除", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("expected-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?code=test-code&state=wrong-state";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "State 参数不匹配"
      );
      expect(getPkceVerifier(CLIENT_ID)).toBeNull();
    });

    it("缺少 code 时抛出错误，并清理 state/verifier", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?state=test-state";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "缺少 authorization code"
      );
      expect(getOAuthState(CLIENT_ID)).toBeNull();
      expect(getPkceVerifier(CLIENT_ID)).toBeNull();
    });

    it("回调包含 error 参数时按 OAuth error 映射错误码（access_denied → user_denied_authorization），并清理 state/verifier", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?error=access_denied&error_description=用户拒绝了授权";

      const err = await client.handleCallback(callbackUrl).catch((e) => e);
      expect(err).toBeInstanceOf(SsoError);
      expect(err.code).toBe("user_denied_authorization");
      expect(err.message).toContain("用户拒绝了授权");
      expect(getOAuthState(CLIENT_ID)).toBeNull();
      expect(getPkceVerifier(CLIENT_ID)).toBeNull();
    });

    it("成功交换 token（RS256 id_token + at_hash，JWKS 走 Discovery jwks_uri）", async () => {
      const accessToken = "new-access-token";
      const idToken = await buildRs256IdToken(
        validPayload({ at_hash: await computeAtHash(accessToken) })
      );
      const calls = installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
            id_token: idToken,
          }),
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state-123", CLIENT_ID);
      savePkceVerifier("test-client-id", "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?code=auth-code-123&state=test-state-123";

      const result = await client.handleCallback(callbackUrl);

      expect(result.access_token).toBe("new-access-token");
      expect(result.refresh_token).toBe("new-refresh-token");
      expect(result.token_type).toBe("Bearer");

      // Token 应该被保存到 storage
      const saved = getTokenData(CLIENT_ID);
      expect(saved).not.toBeNull();
      expect(saved!.access_token).toBe("new-access-token");

      // JWKS 请求应使用 Discovery 文档的 jwks_uri（jwks.json），而非硬编码 /api/oauth/jwks
      expect(calls.some((c) => c.url === mockDiscovery.jwks_uri)).toBe(true);

      // state / verifier 已成功清除
      expect(getPkceVerifier(CLIENT_ID)).toBeNull();
    });

    it("id_token 无 kid 时逐个尝试 JWKS 中的所有 RS256 key", async () => {
      const idToken = await buildRs256IdToken(validPayload(), null);
      installFetchRouter({
        // 干扰 key 在前：实现必须跳过签名不匹配的 key 继续尝试
        jwks: { keys: [decoyPublicJwk, publicJwk] },
        token: () =>
          jsonResponse({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
            id_token: idToken,
          }),
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("no-kid-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      const result = await client.handleCallback(
        "https://test-app.com/callback?code=auth-code&state=no-kid-state"
      );
      expect(result.access_token).toBe("new-access-token");
    });

    it("HS256 id_token 被拒绝", async () => {
      const hs256Token = `${base64UrlEncodeStr(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64UrlEncodeStr(JSON.stringify(validPayload()))}.mock-sig`;
      installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
            id_token: hs256Token,
          }),
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("hs256-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      await expect(
        client.handleCallback("https://test-app.com/callback?code=c&state=hs256-state")
      ).rejects.toThrow("HS256");
      // 验证失败不保存 token
      expect(getTokenData(CLIENT_ID)).toBeNull();
    });

    it("缺少 exp 的 id_token 被判 invalid", async () => {
      const payload = validPayload();
      delete payload.exp;
      const idToken = await buildRs256IdToken(payload);
      installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
            id_token: idToken,
          }),
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("no-exp-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      await expect(
        client.handleCallback("https://test-app.com/callback?code=c&state=no-exp-state")
      ).rejects.toThrow("缺少 exp");
    });

    it("Public Client 交换 token 时不发送 client_secret", async () => {
      const calls = installFetchRouter();

      const publicClient = new SsoClient({
        clientId: "public-client-id",
        redirectUri: "https://test-app.com/callback",
        ssoBaseUrl: "https://nihplod.cn",
        scopes: "openid profile",
      });
      saveOAuthState("public-state", "public-client-id");
      savePkceVerifier("public-client-id", "public-verifier");

      await publicClient.handleCallback(
        "https://test-app.com/callback?code=public-code&state=public-state"
      );

      const tokenCall = calls.find((c) => c.url.includes("/api/oauth/token"));
      const requestBody = tokenCall?.init?.body as string;
      expect(requestBody).toContain("client_id=public-client-id");
      expect(requestBody).toContain("code_verifier=public-verifier");
      expect(requestBody).not.toContain("client_secret");
    });

    it("缺少 code_verifier 时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state-123", CLIENT_ID);
      // 不保存 verifier

      const callbackUrl =
        "https://test-app.com/callback?code=auth-code-123&state=test-state-123";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "code_verifier 不存在"
      );
    });

    it("token 交换网络错误时抛出错误（state/verifier 保留可重试）", async () => {
      installFetchRouter({
        token: () => {
          throw new Error("Network failure");
        },
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state-123", CLIENT_ID);
      savePkceVerifier("test-client-id", "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?code=auth-code-123&state=test-state-123";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "网络请求失败"
      );
      // 网络层失败时保留临时数据，允许用户重试回调
      expect(getPkceVerifier(CLIENT_ID)).toBe("test-verifier");
    });

    it("id_token 验签失败（JWKS 暂不可达）时保留 state/verifier，刷新可重试成功", async () => {
      const accessToken = "new-access-token";
      const idToken = await buildRs256IdToken(
        validPayload({ at_hash: await computeAtHash(accessToken) })
      );
      const tokenResponse = () =>
        jsonResponse({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 900,
          refresh_token: "new-refresh-token",
          id_token: idToken,
        });

      // JWKS 端点暂不可达（HTTP 500）→ 验签失败
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/.well-known/openid-configuration")) {
          return jsonResponse(mockDiscovery);
        }
        if (url.includes("/api/oauth/token")) return tokenResponse();
        if (url.includes("jwks")) return jsonResponse({}, 500);
        throw new Error(`unexpected fetch: ${url}`);
      });

      const client = new SsoClient(defaultConfig);
      saveOAuthState("retry-state", CLIENT_ID);
      savePkceVerifier(CLIENT_ID, "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?code=auth-code&state=retry-state";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "无法获取 JWKS"
      );
      // 验签失败：不保存 token，但保留 state/verifier 允许重试
      expect(getTokenData(CLIENT_ID)).toBeNull();
      expect(getOAuthState(CLIENT_ID)).toBe("retry-state");
      expect(getPkceVerifier(CLIENT_ID)).toBe("test-verifier");

      // JWKS 恢复后刷新回调页重试 → 成功
      vi.restoreAllMocks();
      installFetchRouter({ token: tokenResponse });
      const result = await client.handleCallback(callbackUrl);
      expect(result.access_token).toBe("new-access-token");
      // 成功后一次性临时数据被清除
      expect(getPkceVerifier(CLIENT_ID)).toBeNull();
    });
  });

  describe("getAccessToken", () => {
    it("无 token 时返回 null", async () => {
      const client = new SsoClient(defaultConfig);
      const token = await client.getAccessToken();
      expect(token).toBeNull();
    });

    it("有效 token 时返回 token", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "valid-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token",
        issued_at: now,
        expires_at: now + 900000,
      }, CLIENT_ID);

      const client = new SsoClient(defaultConfig);
      const token = await client.getAccessToken();
      expect(token).toBe("valid-token");
    });
  });

  describe("refreshToken", () => {
    it("成功刷新 token（过期夹具 token 仍可读取 refresh_token）", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token-1",
        issued_at: now - 1000000,
        expires_at: now - 1000,
      }, CLIENT_ID);

      installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: "refreshed-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
          }),
      });

      const client = new SsoClient(defaultConfig);
      const result = await client.refreshToken();

      expect(result.access_token).toBe("refreshed-token");
      expect(result.refresh_token).toBe("new-refresh-token");
    });

    it("刷新响应省略 refresh_token 时保留旧值（RFC 6749 §6）", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token-keep",
        issued_at: now - 1000000,
        expires_at: now - 1000,
      }, CLIENT_ID);

      installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: "refreshed-token",
            token_type: "Bearer",
            expires_in: 900,
            // 服务端未返回 refresh_token
          }),
      });

      const client = new SsoClient(defaultConfig);
      const result = await client.refreshToken();

      expect(result.access_token).toBe("refreshed-token");
      expect(result.refresh_token).toBe("refresh-token-keep");
      expect(getTokenData(CLIENT_ID)?.refresh_token).toBe("refresh-token-keep");
    });

    it("invalid_grant 时清除本地 token 并抛 session_expired", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "revoked-refresh",
        issued_at: now - 1000000,
        expires_at: now - 1000,
      }, CLIENT_ID);

      installFetchRouter({
        token: () =>
          jsonResponse({ error: "invalid_grant", error_description: "refresh_token 已撤销" }, 400),
      });

      const client = new SsoClient(defaultConfig);
      await expect(client.refreshToken()).rejects.toThrow("refresh_token 已撤销");
      expect(getTokenData(CLIENT_ID)).toBeNull();
    });

    it("无 refresh_token 时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);
      // 不保存任何 token 数据
      await expect(client.refreshToken()).rejects.toThrow(
        "没有可用的 refresh_token"
      );
    });

    it("刷新网络错误时抛出错误", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token-1",
        issued_at: now - 1000000,
        expires_at: now - 1000,
      }, CLIENT_ID);

      installFetchRouter({
        token: () => {
          throw new Error("Network failure");
        },
      });

      const client = new SsoClient(defaultConfig);
      await expect(client.refreshToken()).rejects.toThrow(
        "网络请求失败"
      );
    });
  });

  describe("getUserInfo", () => {
    it("未登录时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);
      await expect(client.getUserInfo()).rejects.toThrow("未登录");
    });

    it("成功获取用户信息", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "valid-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token",
        issued_at: now,
        expires_at: now + 900000,
      }, CLIENT_ID);

      installFetchRouter();

      const client = new SsoClient(defaultConfig);
      const user = await client.getUserInfo();

      expect(user.sub).toBe("user-123");
      expect(user.nickname).toBe("Test User");
    });

    it("access_token 过期时自动刷新后再请求 userinfo", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token",
        issued_at: now - 1000000,
        expires_at: now - 1000, // 已过期
      }, CLIENT_ID);

      let userinfoAuth: string | undefined;
      installFetchRouter({
        token: () =>
          jsonResponse({
            access_token: "refreshed-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
          }),
        userinfo: (_url, init) => {
          userinfoAuth = (init?.headers as Record<string, string>)?.Authorization;
          return jsonResponse({ sub: "user-123", nickname: "Refreshed User" });
        },
      });

      const client = new SsoClient(defaultConfig);
      const user = await client.getUserInfo();

      expect(user.sub).toBe("user-123");
      // userinfo 请求应携带刷新后的新 access_token
      expect(userinfoAuth).toBe("Bearer refreshed-token");
    });

    it("401 响应时清除 token 并抛出错误", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "invalid-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token",
        issued_at: now,
        expires_at: now + 900000,
      }, CLIENT_ID);

      installFetchRouter({
        userinfo: () => jsonResponse({}, 401),
      });

      const client = new SsoClient(defaultConfig);
      await expect(client.getUserInfo()).rejects.toThrow("Token 已失效");
      expect(getTokenData(CLIENT_ID)).toBeNull();
    });
  });

  describe("logout", () => {
    it("清除本地 token 数据", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "test-refresh",
        issued_at: now,
        expires_at: now + 900000,
      }, CLIENT_ID);
      saveOAuthState("test-state", CLIENT_ID);

      installFetchRouter();

      const client = new SsoClient(defaultConfig);
      await client.logout(false);

      expect(getTokenData(CLIENT_ID)).toBeNull();
      expect(client.isAuthenticated()).toBe(false);
    });

    it("redirectToSso=true 时保存 logout state，validateLogoutState 校验并一次性清除", async () => {
      installFetchRouter();

      const client = new SsoClient(defaultConfig);
      await client.logout(true);

      const saved = getLogoutState(CLIENT_ID);
      expect(saved).toBeTruthy();

      // state 不匹配 / 缺失 → false，且不影响已保存的 state
      expect(
        client.validateLogoutState("https://test-app.com/callback?state=wrong-state")
      ).toBe(false);
      expect(client.validateLogoutState("https://test-app.com/callback")).toBe(false);
      expect(getLogoutState(CLIENT_ID)).toBe(saved);

      // state 匹配 → true，并立即清除（一次性）
      expect(
        client.validateLogoutState(
          `https://test-app.com/callback?state=${saved}`
        )
      ).toBe(true);
      expect(getLogoutState(CLIENT_ID)).toBeNull();

      // 已清除后同样的回跳不再可信
      expect(
        client.validateLogoutState(
          `https://test-app.com/callback?state=${saved}`
        )
      ).toBe(false);
    });
  });
});
