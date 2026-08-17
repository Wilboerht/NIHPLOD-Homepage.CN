import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => {
  const _codePrismaClient = {
    oAuthAuthorizationCode: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  };
  return {
    prisma: {
      ..._codePrismaClient,
      $transaction: vi.fn((cb: (tx: typeof _codePrismaClient) => unknown) => cb(_codePrismaClient)),
    },
  };
});

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
          where: {
            code: hashCode("raw-code"),
            used: false,
            expiresAt: { gte: expect.any(Date) },
          },
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
    it("未使用的过期授权码应立即删除，已使用的保留至过期 30 天后（重放检测）", async () => {
      mockDeleteMany.mockResolvedValue({ count: 3 });
      const result = await cleanupExpiredCodes();
      expect(result).toBe(3);
      expect(mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { used: false, expiresAt: { lt: expect.any(Date) } },
              { used: true, expiresAt: { lt: expect.any(Date) } },
            ],
          },
        })
      );

      // 已使用 code 的删除阈值应比"现在"早约 30 天（保留期供重放检测）
      const call = mockDeleteMany.mock.calls[0][0] as {
        where: { OR: [{ expiresAt: { lt: Date } }, { expiresAt: { lt: Date } }] };
      };
      const usedThreshold = call.where.OR[1].expiresAt.lt;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(Date.now() - usedThreshold.getTime() - thirtyDaysMs)).toBeLessThan(60 * 1000);
    });
  });

  describe("verifyPKCE", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // 43 chars

    it("S256 正确 verifier/challenge 应返回 true", () => {
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      expect(verifyPKCE(verifier, challenge, "S256")).toBe(true);
    });

    it("错误 verifier 应返回 false", () => {
      const challenge = createHash("sha256").update(verifier).digest("base64url");
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
