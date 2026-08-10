/**
 * @nihplod/sso-verify 测试
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import {
  createTokenVerifier,
  ssoMiddleware,
  type SsoMiddlewareRequest,
  type SsoMiddlewareResponse,
} from "../index";

const issuer = "https://nihplod.cn";
const audience = "test-client";
const accessSecretString = "a-very-long-and-secure-jwt-access-secret-32+";
const accessSecret = new TextEncoder().encode(accessSecretString);

async function createAccessToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    type: "access_token",
    sub: "user-123",
    id: "user-123",
    phone: "13800138000",
    client_id: audience,
    scope: "openid profile",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("15m")
    .sign(accessSecret);
}

describe("createTokenVerifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("本地 JWT 验证", () => {
    it("使用 accessTokenSecret 验证有效 token", async () => {
      const token = await createAccessToken();
      const verifier = createTokenVerifier({
        audience,
        issuer,
        accessTokenSecret: accessSecretString,
      });

      const payload = await verifier.verify(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-123");
      expect(payload!.client_id).toBe(audience);
    });

    it("token 类型不是 access_token 时拒绝", async () => {
      const badToken = await new SignJWT({ type: "user", id: "user-123" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime("15m")
        .sign(accessSecret);

      const verifier = createTokenVerifier({
        audience,
        issuer,
        accessTokenSecret: accessSecretString,
      });

      const payload = await verifier.verify(badToken);
      expect(payload).toBeNull();
    });

    it("签名错误的 token 被拒绝", async () => {
      const token = await createAccessToken();
      const verifier = createTokenVerifier({
        audience,
        issuer,
        accessTokenSecret: "wrong-secret-which-is-long-enough-12345",
      });

      const payload = await verifier.verify(token);
      expect(payload).toBeNull();
    });
  });

  describe("Introspection 验证", () => {
    it("通过 introspection 验证 active token", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user-456",
          client_id: audience,
          scope: "openid phone",
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      } as Response);

      const verifier = createTokenVerifier({
        audience,
        issuer,
        introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
        clientId: audience,
        clientSecret: "test-secret",
      });

      const payload = await verifier.verify("some-token");
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-456");
      expect(payload!.scope).toBe("openid phone");

      // 验证请求体包含 client_id/client_secret
      const [, init] = mockFetch.mock.calls[0];
      const body = (init?.body as URLSearchParams).toString();
      expect(body).toContain("client_id=test-client");
      expect(body).toContain("client_secret=test-secret");
    });

    it("introspection 返回 active=false 时拒绝", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ active: false }),
      } as Response);

      const verifier = createTokenVerifier({
        audience,
        issuer,
        introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
        clientId: audience,
        clientSecret: "test-secret",
      });

      const payload = await verifier.verify("revoked-token");
      expect(payload).toBeNull();
    });

    it("introspection 网络失败时拒绝", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network failure"));

      const verifier = createTokenVerifier({
        audience,
        issuer,
        introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
        clientId: audience,
        clientSecret: "test-secret",
      });

      const payload = await verifier.verify("some-token");
      expect(payload).toBeNull();
    });

    it("未配置 introspection 时本地验证失败后拒绝", async () => {
      const token = await createAccessToken();
      const verifier = createTokenVerifier({
        audience,
        issuer,
        // 没有 accessTokenSecret 也没有 introspectionEndpoint
      });

      const payload = await verifier.verify(token);
      expect(payload).toBeNull();
    });
  });

  describe("缓存", () => {
    it("相同 token 应缓存 introspection 结果", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user-789",
          client_id: audience,
          scope: "openid",
        }),
      } as Response);

      const verifier = createTokenVerifier({
        audience,
        issuer,
        introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
        clientId: audience,
        clientSecret: "test-secret",
      });

      await verifier.verify("cached-token");
      await verifier.verify("cached-token");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe("ssoMiddleware", () => {
  it("无 Authorization header 时返回 401", async () => {
    const middleware = ssoMiddleware({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
    });

    const req: SsoMiddlewareRequest = { headers: {} };
    const res: SsoMiddlewareResponse = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("有效 token 时挂载 req.user 并调用 next", async () => {
    const token = await createAccessToken();
    const middleware = ssoMiddleware({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
    });

    const req: SsoMiddlewareRequest = { headers: { authorization: `Bearer ${token}` } };
    const res: SsoMiddlewareResponse = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.sub).toBe("user-123");
  });
});
