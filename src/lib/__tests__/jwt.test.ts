import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { generateKeyPairSync } from "crypto";
import { SignJWT } from "jose";
import {
  signToken,
  verifyToken,
  signUserToken,
  verifyUserToken,
  signRefreshToken,
  verifyRefreshToken,
  signOAuthAccessToken,
  verifyOAuthAccessToken,
} from "@/lib/jwt";

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
        .setIssuer("https://nihplod.cn")
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
});
