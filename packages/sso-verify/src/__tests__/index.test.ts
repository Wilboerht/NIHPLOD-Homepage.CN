/**
 * @nihplod/sso-verify 测试
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT, generateKeyPair, exportSPKI, exportJWK } from "jose";
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
const logoutSecretString = "a-very-long-and-secure-logout-token-secret-32+";
const logoutSecret = new TextEncoder().encode(logoutSecretString);

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

    it("introspection 网络失败时拒绝（重试后仍失败）", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network failure"));

      const verifier = createTokenVerifier({
        audience,
        issuer,
        introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
        clientId: audience,
        clientSecret: "test-secret",
      });

      const payload = await verifier.verify("some-token");
      expect(payload).toBeNull();
      // 默认 introspectRetries=1：首次失败后重试一次
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
    expect(req.user!.sub).toBe("user-123");
  });
});

describe("RS256 本地验证", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createRS256AccessToken(
    privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
    claims: Record<string, unknown> = {}
  ): Promise<string> {
    return new SignJWT({
      type: "access_token",
      sub: "user-rs256",
      client_id: audience,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "access-token-rs256-v1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("15m")
      .sign(privateKey);
  }

  it("使用 accessTokenPublicKey 验证 RS256 token", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const token = await createRS256AccessToken(privateKey);

    const verifier = createTokenVerifier({ audience, issuer, accessTokenPublicKey: pem });

    const payload = await verifier.verify(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-rs256");
  });

  it("使用 jwksUri 按 kid 获取公钥验证 RS256 token", async () => {
    // jose 在 Node 下通过 node:http 获取远程 JWKS（不经 globalThis.fetch），
    // 因此启动本地 HTTP 服务器提供 JWKS。
    const { createServer } = await import("node:http");
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "access-token-rs256-v1", alg: "RS256", use: "sig" };

    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const token = await createRS256AccessToken(privateKey);
      const verifier = createTokenVerifier({
        audience,
        issuer,
        jwksUri: `http://127.0.0.1:${port}/jwks`,
      });

      const payload = await verifier.verify(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-rs256");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("RS256 token 签名错误时被拒绝", async () => {
    const { publicKey } = await generateKeyPair("RS256");
    const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const token = await createRS256AccessToken(otherPrivateKey);

    const verifier = createTokenVerifier({ audience, issuer, accessTokenPublicKey: pem });

    expect(await verifier.verify(token)).toBeNull();
  });
});

describe("verifyLogoutToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createLogoutTokenHS256(
    claims: Record<string, unknown> = {},
    secret: Uint8Array = logoutSecret
  ): Promise<string> {
    return new SignJWT({
      type: "logout_token",
      sub: "user-123",
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);
  }

  async function createLogoutTokenRS256(
    privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
    claims: Record<string, unknown> = {}
  ): Promise<string> {
    return new SignJWT({
      type: "logout_token",
      sub: "user-123",
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "logout-token-rs256-v1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("HS256 logout token 验证通过", async () => {
    const token = await createLogoutTokenHS256({ jti: "logout-hs256-ok-1" });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    const payload = await verifier.verifyLogoutToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
    expect(payload!.type).toBe("logout_token");
  });

  it("type 不是 logout_token 时拒绝", async () => {
    const token = await createLogoutTokenHS256({
      type: "access_token",
      jti: "logout-bad-type-1",
    });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("缺少 backchannel-logout events 时拒绝", async () => {
    const token = await createLogoutTokenHS256({
      events: {},
      jti: "logout-bad-events-1",
    });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("相同 issuer+jti 的 logout token 重放被拒绝", async () => {
    const token = await createLogoutTokenHS256({ jti: "logout-replay-1" });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).not.toBeNull();
    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("使用 logoutTokenPublicKey 验证 RS256 logout token", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const token = await createLogoutTokenRS256(privateKey, { jti: "logout-rs256-ok-1" });

    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenPublicKey: pem,
    });

    const payload = await verifier.verifyLogoutToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
  });

  it("RS256 logout token 不能用 accessTokenPublicKey 验证", async () => {
    const { publicKey: accessPublicKey } = await generateKeyPair("RS256");
    const { privateKey: logoutPrivateKey } = await generateKeyPair("RS256");
    const accessPem = await exportSPKI(accessPublicKey);
    const token = await createLogoutTokenRS256(logoutPrivateKey, {
      jti: "logout-wrong-key-1",
    });

    const verifier = createTokenVerifier({
      audience,
      issuer,
      accessTokenPublicKey: accessPem,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("RS256 logout token 无对应公钥时失败，不静默回退 HS256", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const token = await createLogoutTokenRS256(privateKey, { jti: "logout-no-key-1" });

    // 只配置了 HS256 secret，无任何 RS256 公钥来源
    const verifier = createTokenVerifier({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });
});

describe("Introspection 安全性", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("active:true 但缺少 sub 时拒绝", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, client_id: audience }),
    } as Response);

    const verifier = createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
    });

    expect(await verifier.verify("token-no-sub")).toBeNull();
  });

  it("introspection 请求超时时按失败处理", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      ((_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted", "AbortError"))
          );
        })) as typeof fetch
    );

    const verifier = createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
      introspectTimeoutMs: 50,
    });

    expect(await verifier.verify("slow-token")).toBeNull();
  });

  it("introspection 请求带超时 signal", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-sig" }),
    } as Response);

    const verifier = createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
    });

    await verifier.verify("signal-token");
    const [, init] = mockFetch.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("Introspection aud 归属校验", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createIntrospectVerifier() {
    return createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
    });
  }

  it("client_id 与 audience 不匹配时拒绝", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-1", client_id: "other-client" }),
    } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("token-other-client")).toBeNull();
  });

  it("aud 数组不包含 audience 时拒绝", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-1", aud: ["other-client"] }),
    } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("token-aud-array-miss")).toBeNull();
  });

  it("aud 字符串等于 audience 时通过", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-1", aud: audience }),
    } as Response);

    const verifier = createIntrospectVerifier();
    const payload = await verifier.verify("token-aud-string-ok");
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
  });

  it("aud 数组包含 audience 时通过", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-1", aud: ["other", audience] }),
    } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("token-aud-array-hit")).not.toBeNull();
  });

  it("aud 与 client_id 都缺失时保持信任", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, sub: "user-1" }),
    } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("token-no-aud-fields")).not.toBeNull();
  });
});

describe("Introspection 重试与并发去重", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createIntrospectVerifier() {
    return createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
    });
  }

  it("5xx 首次失败后重试成功", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ active: true, sub: "user-retry", client_id: audience }),
      } as Response);

    const verifier = createIntrospectVerifier();
    const payload = await verifier.verify("retry-token");
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-retry");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("4xx 不重试", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: false, status: 400 } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("bad-request-token")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("introspectRetries: 0 时不重试", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network failure"));

    const verifier = createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
      introspectRetries: 0,
    });

    expect(await verifier.verify("no-retry-token")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("同一 token 并发 verify 共享一次 introspection 请求", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ active: true, sub: "user-concurrent", client_id: audience }),
    } as Response);

    const verifier = createIntrospectVerifier();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => verifier.verify("concurrent-token"))
    );

    expect(results.every((p) => p?.sub === "user-concurrent")).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("Introspection 缓存行为", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createIntrospectVerifier(extra: Record<string, unknown> = {}) {
    return createTokenVerifier({
      audience,
      issuer,
      introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
      clientId: audience,
      clientSecret: "test-secret",
      ...extra,
    });
  }

  it("active:false 结果按负缓存 TTL 缓存", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ active: false }),
    } as Response);

    const verifier = createIntrospectVerifier();
    expect(await verifier.verify("revoked-cache-token")).toBeNull();
    expect(await verifier.verify("revoked-cache-token")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("introspectNegativeCacheTtl: 0 时不缓存 active:false", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ active: false }),
    } as Response);

    const verifier = createIntrospectVerifier({ introspectNegativeCacheTtl: 0 });
    expect(await verifier.verify("revoked-nocache-token")).toBeNull();
    expect(await verifier.verify("revoked-nocache-token")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("invalidateCache 清除指定 token 缓存", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ active: true, sub: "user-inv", client_id: audience }),
    } as Response);

    const verifier = createIntrospectVerifier();
    await verifier.verify("invalidate-token");
    verifier.invalidateCache("invalidate-token");
    await verifier.verify("invalidate-token");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("clockTolerance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createExpiredToken(expiredSecondsAgo: number): Promise<string> {
    return new SignJWT({
      type: "access_token",
      sub: "user-123",
      client_id: audience,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(Math.floor(Date.now() / 1000) - expiredSecondsAgo)
      .sign(accessSecret);
  }

  it("过期 30 秒的 token 在默认容忍窗口（60s）内通过", async () => {
    const token = await createExpiredToken(30);
    const verifier = createTokenVerifier({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
    });

    const payload = await verifier.verify(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
  });

  it("clockToleranceSeconds: 0 时过期 token 被拒绝", async () => {
    const token = await createExpiredToken(30);
    const verifier = createTokenVerifier({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
      clockToleranceSeconds: 0,
    });

    expect(await verifier.verify(token)).toBeNull();
  });

  it("超出容忍窗口的过期 token 被拒绝", async () => {
    const token = await createExpiredToken(120);
    const verifier = createTokenVerifier({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
    });

    expect(await verifier.verify(token)).toBeNull();
  });
});

describe("verifyLogoutToken 补充校验", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createLogoutToken(
    claims: Record<string, unknown> = {},
    withExp = true
  ): Promise<string> {
    const jwt = new SignJWT({
      type: "logout_token",
      sub: "user-123",
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt();
    if (withExp) {
      jwt.setExpirationTime("5m");
    }
    return jwt.sign(logoutSecret);
  }

  it("backchannel-logout 事件值不是对象时拒绝", async () => {
    const token = await createLogoutToken({
      events: { "http://schemas.openid.net/event/backchannel-logout": "yes" },
      jti: "logout-events-not-object-1",
    });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("backchannel-logout 事件值为数组时拒绝", async () => {
    const token = await createLogoutToken({
      events: { "http://schemas.openid.net/event/backchannel-logout": [] },
      jti: "logout-events-array-1",
    });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("缺少 exp 的 logout token 被拒绝", async () => {
    const token = await createLogoutToken({ jti: "logout-no-exp-1" }, false);
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
    });

    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });

  it("注入 logoutJtiStore 时使用外部存储防重放", async () => {
    const store = {
      has: vi.fn().mockResolvedValue(false),
      add: vi.fn().mockResolvedValue(undefined),
    };
    const token = await createLogoutToken({ jti: "logout-ext-store-1" });
    const verifier = createTokenVerifier({
      audience,
      issuer,
      logoutTokenSecret: logoutSecretString,
      logoutJtiStore: store,
    });

    const payload = await verifier.verifyLogoutToken(token);
    expect(payload).not.toBeNull();
    expect(store.has).toHaveBeenCalledWith(`${issuer}:logout-ext-store-1`);
    expect(store.add).toHaveBeenCalledWith(`${issuer}:logout-ext-store-1`, 600);

    // 外部存储报告 jti 已处理时拒绝
    store.has.mockResolvedValueOnce(true);
    expect(await verifier.verifyLogoutToken(token)).toBeNull();
  });
});

describe("ssoMiddleware 错误处理", () => {
  it("res 无 status 方法时通过 next(err) 传递错误而非挂起", async () => {
    const middleware = ssoMiddleware({
      audience,
      issuer,
      accessTokenSecret: accessSecretString,
    });

    const req: SsoMiddlewareRequest = { headers: {} };
    const res: SsoMiddlewareResponse = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
