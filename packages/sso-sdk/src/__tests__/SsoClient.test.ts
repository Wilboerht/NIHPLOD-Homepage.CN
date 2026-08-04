/**
 * SsoClient 核心类测试
 *
 * 使用 fetch mock 模拟 HTTP 请求。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SsoClient } from "../core/SsoClient";
import {
  saveTokenData,
  getTokenData,
  saveOAuthState,
  savePkceVerifier,
  setTokenStorage,
} from "../core/storage";
import type { TokenData } from "../core/storage";

// Mock storage (in-memory Map)
const mockStore = new Map<string, string>();
const mockStorage = {
  get: (key: string) => mockStore.get(key) ?? null,
  set: (key: string, value: string) => mockStore.set(key, value),
  remove: (key: string) => mockStore.delete(key),
};

// Mock OIDC Discovery response
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

/** 构造一个仅用于测试的合法格式 ID Token（HS256，签名占位） */
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function buildMockIdToken(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
}

describe("SsoClient", () => {
  beforeEach(() => {
    mockStore.clear();
    setTokenStorage(mockStorage);
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

    it("过期 token 时返回 false", () => {
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
    });
  });

  describe("handleCallback", () => {
    it("state 不匹配时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("expected-state", CLIENT_ID);

      const callbackUrl =
        "https://test-app.com/callback?code=test-code&state=wrong-state";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "State 参数不匹配"
      );
    });

    it("缺少 code 时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state", CLIENT_ID);

      const callbackUrl =
        "https://test-app.com/callback?state=test-state";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "缺少 authorization code"
      );
    });

    it("回调包含 error 参数时抛出错误", async () => {
      const client = new SsoClient(defaultConfig);

      const callbackUrl =
        "https://test-app.com/callback?error=access_denied&error_description=用户拒绝了授权";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "授权失败"
      );
    });

    it("成功交换 token（mock fetch）", async () => {
      // Mock fetch for OIDC discovery and token exchange
      const mockFetch = vi.spyOn(globalThis, "fetch");

      mockFetch
        // First call: OIDC discovery
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        // Second call: token exchange
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
            id_token: buildMockIdToken({
              sub: "user123",
              iss: "https://nihplod.cn",
              aud: "test-client-id",
              exp: 9999999999,
              type: "id_token",
            }),
          }),
        } as Response);

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
    });

    it("Public Client 交换 token 时不发送 client_secret", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "public-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "public-refresh-token",
          }),
        } as Response);

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

      const tokenCall = mockFetch.mock.calls[1];
      const requestBody = tokenCall[1]?.body as string;
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

    it("token 交换网络错误时抛出错误", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch");

      mockFetch
        // First call: OIDC discovery
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        // Second call: network error
        .mockRejectedValueOnce(new Error("Network failure"));

      const client = new SsoClient(defaultConfig);
      saveOAuthState("test-state-123", CLIENT_ID);
      savePkceVerifier("test-client-id", "test-verifier");

      const callbackUrl =
        "https://test-app.com/callback?code=auth-code-123&state=test-state-123";

      await expect(client.handleCallback(callbackUrl)).rejects.toThrow(
        "网络请求失败"
      );
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
    it("成功刷新 token", async () => {
      const now = Date.now();
      saveTokenData({
        access_token: "expired-token",
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: "refresh-token-1",
        issued_at: now - 1000000,
        expires_at: now - 1000,
      }, CLIENT_ID);

      const mockFetch = vi.spyOn(globalThis, "fetch");
      mockFetch
        // First call: OIDC discovery
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        // Second call: token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "refreshed-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
          }),
        } as Response);

      const client = new SsoClient(defaultConfig);
      const result = await client.refreshToken();

      expect(result.access_token).toBe("refreshed-token");
      expect(result.refresh_token).toBe("new-refresh-token");
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

      const mockFetch = vi.spyOn(globalThis, "fetch");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        .mockRejectedValueOnce(new Error("Network failure"));

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

      const mockFetch = vi.spyOn(globalThis, "fetch");
      mockFetch
        // First call: OIDC discovery
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        // Second call: userinfo endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: "user-123",
            nickname: "Test User",
          }),
        } as Response);

      const client = new SsoClient(defaultConfig);
      const user = await client.getUserInfo();

      expect(user.sub).toBe("user-123");
      expect(user.nickname).toBe("Test User");
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

      const mockFetch = vi.spyOn(globalThis, "fetch");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        } as Response);

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

      // Mock fetch for OIDC discovery (logout calls _getTokenEndpoint → _getDiscovery)
      // and the revocation endpoint
      const mockFetch = vi.spyOn(globalThis, "fetch");
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDiscovery,
        } as Response)
        // Revocation endpoint
        .mockResolvedValueOnce({
          ok: true,
        } as Response);

      const client = new SsoClient(defaultConfig);
      await client.logout(false);

      expect(getTokenData(CLIENT_ID)).toBeNull();
      expect(client.isAuthenticated()).toBe(false);
    });
  });
});
