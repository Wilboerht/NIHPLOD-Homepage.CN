import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthAuthorizationCode: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

import {
  createAuthorizationCode,
  consumeAuthorizationCode,
  cleanupExpiredCodes,
  verifyPKCE,
  hashCode,
} from "@/lib/oauth-code";

describe("oauth-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAuthorizationCode", () => {
    it("应生成原始 code 并创建数据库记录", async () => {
      mockCreate.mockResolvedValue({
        id: "code-id",
        clientId: "client-1",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        nonce: "nonce-1",
        expiresAt: new Date("2030-01-01"),
      });

      const result = await createAuthorizationCode({
        clientId: "client-1",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        nonce: "nonce-1",
      });

      expect(result.clientId).toBe("client-1");
      expect(result.code).toMatch(/^[a-f0-9]{64}$/);
      expect(result.scopes).toEqual(["openid"]);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: "client-1",
            userId: "user-1",
          }),
        })
      );
    });
  });

  describe("consumeAuthorizationCode", () => {
    it("应原子化消费授权码", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });
      mockFindUnique.mockResolvedValue({
        id: "code-id",
        clientId: "client-1",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        nonce: "nonce-1",
        expiresAt: new Date("2030-01-01"),
      });

      const result = await consumeAuthorizationCode("raw-code");
      expect(result).not.toBeNull();
      expect(result?.clientId).toBe("client-1");
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: hashCode("raw-code"), used: false },
          data: { used: true },
        })
      );
    });

    it("已使用的授权码应返回 null", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });
      const result = await consumeAuthorizationCode("used-code");
      expect(result).toBeNull();
    });
  });

  describe("cleanupExpiredCodes", () => {
    it("应删除过期或已使用的授权码", async () => {
      mockDeleteMany.mockResolvedValue({ count: 3 });
      const result = await cleanupExpiredCodes();
      expect(result).toBe(3);
      expect(mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ expiresAt: { lt: expect.any(Date) } }, { used: true }],
          },
        })
      );
    });
  });

  describe("verifyPKCE", () => {
    const verifier =
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // 43 chars

    it("S256 正确 verifier/challenge 应返回 true", () => {
      const challenge = require("crypto")
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(verifyPKCE(verifier, challenge, "S256")).toBe(true);
    });

    it("错误 verifier 应返回 false", () => {
      const challenge = require("crypto")
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(verifyPKCE(verifier + "x", challenge, "S256")).toBe(false);
    });

    it("非 S256 method 应返回 false", () => {
      expect(verifyPKCE(verifier, "challenge", "plain")).toBe(false);
    });

    it("verifier 长度不足 43 应返回 false", () => {
      expect(verifyPKCE("short", "challenge", "S256")).toBe(false);
    });

    it("challenge 长度不是 43 应返回 false", () => {
      expect(verifyPKCE(verifier, "short", "S256")).toBe(false);
    });
  });
});
