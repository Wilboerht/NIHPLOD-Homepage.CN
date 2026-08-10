import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockTokenBlacklistCreate } = vi.hoisted(() => ({
  mockTokenBlacklistCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: {
      create: (...args: unknown[]) => mockTokenBlacklistCreate(...args),
    },
  },
}));

import {
  generateInternalApiSignature,
  verifyInternalApiSignature,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "@/lib/internal-api";

describe("internal-api", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: "advisor-key", secret: "advisor-secret" },
    ]);
    mockTokenBlacklistCreate.mockReset();
    mockTokenBlacklistCreate.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("generateInternalApiSignature / verifyInternalApiSignature", () => {
    it("应能生成并验证有效签名", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "random-nonce-123";
      const body = JSON.stringify({ userId: "u1", score: 80 });
      const bodyHash = await hashRequestBody(body);

      const signature = generateInternalApiSignature(
        "advisor-secret",
        "POST",
        "/api/v1/internal/wechat/send-template",
        timestamp,
        nonce,
        bodyHash
      );

      const config = verifyInternalApiSignature(
        "advisor-key",
        signature,
        "POST",
        "/api/v1/internal/wechat/send-template",
        timestamp,
        nonce,
        bodyHash
      );

      expect(config).not.toBeNull();
      expect(config?.project).toBe("advisor");
    });

    it("应拒绝错误签名", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "random-nonce-123";
      const bodyHash = await hashRequestBody("{}");

      const config = verifyInternalApiSignature(
        "advisor-key",
        "invalid-signature",
        "POST",
        "/api/v1/internal/wechat/send-template",
        timestamp,
        nonce,
        bodyHash
      );

      expect(config).toBeNull();
    });

    it("应拒绝不存在的 key", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "random-nonce-123";
      const bodyHash = await hashRequestBody("{}");

      const signature = generateInternalApiSignature(
        "advisor-secret",
        "POST",
        "/api/v1/internal/wechat/send-template",
        timestamp,
        nonce,
        bodyHash
      );

      const config = verifyInternalApiSignature(
        "unknown-key",
        signature,
        "POST",
        "/api/v1/internal/wechat/send-template",
        timestamp,
        nonce,
        bodyHash
      );

      expect(config).toBeNull();
    });
  });

  describe("isTimestampValid", () => {
    it("当前时间戳应有效", () => {
      expect(isTimestampValid(Math.floor(Date.now() / 1000))).toBe(true);
    });

    it("过期时间戳应无效", () => {
      expect(isTimestampValid(Math.floor(Date.now() / 1000) - 400)).toBe(false);
    });
  });

  describe("checkAndRecordNonce", () => {
    it("新 nonce 应可用", async () => {
      expect(await checkAndRecordNonce("nonce-1")).toBe(true);
      expect(mockTokenBlacklistCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "internal_api_nonce",
            key: "nonce:nonce-1",
          }),
        })
      );
    });

    it("重复 nonce 应被拒绝（内存缓存命中）", async () => {
      await checkAndRecordNonce("nonce-2");
      expect(await checkAndRecordNonce("nonce-2")).toBe(false);
    });

    it("DB 唯一约束冲突（P2002）应拒绝（跨实例重放防护）", async () => {
      mockTokenBlacklistCreate.mockRejectedValue({ code: "P2002" });
      expect(await checkAndRecordNonce("nonce-3")).toBe(false);
    });

    it("DB 不可用应 fail-closed 拒绝", async () => {
      mockTokenBlacklistCreate.mockRejectedValue(new Error("connection refused"));
      expect(await checkAndRecordNonce("nonce-4")).toBe(false);
    });
  });

  describe("hashRequestBody", () => {
    it("应返回 SHA-256 哈希", async () => {
      const hash = await hashRequestBody("hello");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });
});
