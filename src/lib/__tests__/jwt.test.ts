import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { generateKeyPairSync } from "crypto";
import { SignJWT, decodeJwt } from "jose";

// === Mock Prisma（sid 会话校验会查询 OAuthSession）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthSession: {
      findUnique: vi.fn(),
    },
  },
}));

import {
  signToken,
  verifyToken,
  signUserToken,
  verifyUserToken,
  signRefreshToken,
  verifyRefreshToken,
  signOAuthAccessToken,
  verifyOAuthAccessToken,
  signLogoutToken,
  verifyLogoutToken,
} from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { getIssuer } from "@/lib/oauth-constants";

describe("JWT 工具", () => {
  describe("管理员 Token", () => {
    it("应能签发并验证管理员 Token", async () => {
      const token = await signToken({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
      });

      expect(token).toBeTruthy();

      const payload = await verifyToken(token);
      expect(payload).toMatchObject({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
        type: "admin",
      });
    });

    it("应拒绝非管理员 Token", async () => {
      const userToken = await signUserToken({ id: "user-1", phone: "13800138000" });
      const result = await verifyToken(userToken);
      expect(result).toBeNull();
    });

    it("应拒绝伪造 Token", async () => {
      const result = await verifyToken("this.is.not_valid");
      expect(result).toBeNull();
    });
  });

  describe("C 端用户 Token", () => {
    it("应能签发并验证用户 Access Token", async () => {
      const token = await signUserToken({ id: "user-1", phone: "13800138000" });
      const payload = await verifyUserToken(token);
      expect(payload).toMatchObject({
        id: "user-1",
        phone: "13800138000",
        type: "user",
      });
    });

    it("应拒绝管理员 Token 作为用户 Token", async () => {
      const adminToken = await signToken({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
      });
      const result = await verifyUserToken(adminToken);
      expect(result).toBeNull();
    });

    it("应拒绝伪造 Token", async () => {
      const result = await verifyUserToken("invalid.token.here");
      expect(result).toBeNull();
    });
  });

  describe("Refresh Token", () => {
    it("应能签发并验证 Refresh Token", async () => {
      const token = await signRefreshToken({ id: "user-1", phone: "13800138000" });
      const payload = await verifyRefreshToken(token);
      expect(payload).toMatchObject({
        id: "user-1",
        phone: "13800138000",
        type: "refresh",
      });
    });

    it("应拒绝 Access Token 作为 Refresh Token", async () => {
      const accessToken = await signUserToken({ id: "user-1", phone: "13800138000" });
      const result = await verifyRefreshToken(accessToken);
      expect(result).toBeNull();
    });
  });

  // algorithms 白名单收窄：公钥分支仅 RS256，对称密钥分支仅 HS256
  describe("OAuth Access Token RS256 配置下的算法收窄", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    beforeAll(() => {
      vi.stubEnv("JWT_ACCESS_PRIVATE_KEY", privatePem);
      vi.stubEnv("JWT_ACCESS_PUBLIC_KEY", publicPem);
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    // 用 HS256 对称密钥伪造的 access_token（payload 完全合法，仅签名算法不同）
    async function signHs256OAuthToken(): Promise<string> {
      return new SignJWT({
        id: "user-1",
        client_id: "client-1",
        scope: "openid",
        type: "access_token",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        // issuer 与签发侧统一（oauth-constants.getIssuer() 的回退链）
        .setIssuer(getIssuer())
        .setAudience("client-1")
        .setExpirationTime("15m")
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!));
    }

    it("RS256 配置下应正常验证 RS256 签名的 token", async () => {
      const token = await signOAuthAccessToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "client-1",
        scope: "openid",
      });
      const payload = await verifyOAuthAccessToken(token, "client-1");
      expect(payload).toMatchObject({ id: "user-1", client_id: "client-1" });
    });

    it("RS256 配置且未启用 HS256 回退时，应拒绝 HS256 签名的 token", async () => {
      vi.stubEnv("ALLOW_HS256_FALLBACK", "");
      const hs256Token = await signHs256OAuthToken();
      expect(await verifyOAuthAccessToken(hs256Token, "client-1")).toBeNull();
    });

    it("显式启用 ALLOW_HS256_FALLBACK 时，HS256 旧 token 仍可验证（回退逻辑不破坏）", async () => {
      vi.stubEnv("ALLOW_HS256_FALLBACK", "true");
      const hs256Token = await signHs256OAuthToken();
      const payload = await verifyOAuthAccessToken(hs256Token, "client-1");
      expect(payload).toMatchObject({ id: "user-1" });
    });
  });

  // sid 会话校验：携带 sid 的 access token 按 OAuthSession 状态即时失效
  describe("OAuth Access Token sid 会话校验", () => {
    const mockFindUnique = prisma.oAuthSession.findUnique as ReturnType<typeof vi.fn>;

    function activeSession() {
      return { revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) };
    }

    async function signSidToken(sid = "sess-1") {
      return signOAuthAccessToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "client-1",
        scope: "openid",
        sid,
      });
    }

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("传入 sid 时签发的 token 应携带 sid claim", async () => {
      mockFindUnique.mockResolvedValue(activeSession());
      const token = await signSidToken();
      expect(decodeJwt(token).sid).toBe("sess-1");
    });

    it("sid 对应有效 session 时验证通过", async () => {
      mockFindUnique.mockResolvedValue(activeSession());
      const token = await signSidToken();
      const payload = await verifyOAuthAccessToken(token, "client-1");
      expect(payload).toMatchObject({ id: "user-1", sid: "sess-1" });
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { sessionId: "sess-1" },
        select: { revokedAt: true, expiresAt: true },
      });
    });

    it("session 被撤销（revokedAt 非空）应返回 null", async () => {
      mockFindUnique.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });
      const token = await signSidToken();
      expect(await verifyOAuthAccessToken(token, "client-1")).toBeNull();
    });

    it("session 不存在应返回 null（fail-closed）", async () => {
      mockFindUnique.mockResolvedValue(null);
      const token = await signSidToken();
      expect(await verifyOAuthAccessToken(token, "client-1")).toBeNull();
    });

    it("session 已过期应返回 null", async () => {
      mockFindUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const token = await signSidToken();
      expect(await verifyOAuthAccessToken(token, "client-1")).toBeNull();
    });

    it("无 sid 的旧 token 行为不变：仍按原逻辑验证通过且不查库", async () => {
      const token = await signOAuthAccessToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "client-1",
        scope: "openid",
      });
      expect(decodeJwt(token).sid).toBeUndefined();
      const payload = await verifyOAuthAccessToken(token, "client-1");
      expect(payload).toMatchObject({ id: "user-1" });
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("M2M client_credentials token 无 sid 不受影响（不查库）", async () => {
      const token = await signOAuthAccessToken({
        id: "client:client-1",
        phone: "",
        clientId: "client-1",
        scope: "",
      });
      const payload = await verifyOAuthAccessToken(token, "client-1");
      expect(payload).toMatchObject({ id: "client:client-1", client_type: "m2m" });
      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  // Logout Token 验证仅做验签与 claims 校验，不消费 jti：
  // 同一 logout_token 可能被 RP 重试验证，防重放由 RP 侧（sso-verify）负责
  describe("Logout Token 验证（不消费 jti）", () => {
    async function signTestLogoutToken(jti = "jti-1") {
      return signLogoutToken({
        sub: "user-1",
        aud: "client-1",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
        jti,
      });
    }

    it("验签通过并返回 claims", async () => {
      const token = await signTestLogoutToken();
      const claims = await verifyLogoutToken(token, "client-1");
      expect(claims).toMatchObject({ sub: "user-1", aud: "client-1", jti: "jti-1" });
    });

    it("同一 logout_token 重复验证应均成功（jti 不在验证侧消费）", async () => {
      const token = await signTestLogoutToken("jti-retry");
      const first = await verifyLogoutToken(token, "client-1");
      const second = await verifyLogoutToken(token, "client-1");
      expect(first?.jti).toBe("jti-retry");
      expect(second?.jti).toBe("jti-retry");
    });

    it("aud 不匹配应返回 null", async () => {
      const token = await signTestLogoutToken();
      expect(await verifyLogoutToken(token, "other-client")).toBeNull();
    });
  });
});
