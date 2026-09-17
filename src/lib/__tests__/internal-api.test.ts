import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockTokenBlacklistCreate, mockTokenBlacklistDeleteMany } = vi.hoisted(() => ({
  mockTokenBlacklistCreate: vi.fn(),
  mockTokenBlacklistDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: {
      create: (...args: unknown[]) => mockTokenBlacklistCreate(...args),
      deleteMany: (...args: unknown[]) => mockTokenBlacklistDeleteMany(...args),
    },
  },
}));

import {
  generateInternalApiSignature,
  verifyInternalApiSignature,
  isProjectAllowed,
  isTimestampValid,
  checkAndRecordNonce,
  cleanupInternalApiNonces,
  getInternalApiKeys,
  hashRequestBody,
} from "@/lib/internal-api";

describe("internal-api", () => {
  const originalEnv = process.env;
  // secret 需 ≥ 32 字符（启动解析会拒绝过短 secret）
  const VALID_SECRET = "advisor-secret-0123456789abcdef0123456789";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: "advisor-key", secret: VALID_SECRET },
    ]);
    mockTokenBlacklistCreate.mockReset();
    mockTokenBlacklistCreate.mockResolvedValue({});
    mockTokenBlacklistDeleteMany.mockReset();
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
        VALID_SECRET,
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
        VALID_SECRET,
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

  describe("getInternalApiKeys 启动解析校验", () => {
    it("应拒绝 .env.example 中的已知示例 key/secret", () => {
      process.env.INTERNAL_API_KEYS = JSON.stringify([
        {
          project: "advisor",
          key: "advisor-example-key",
          secret: "example-secret-replace-with-32-byte-random-value-from-script",
        },
        {
          project: "mall",
          key: "mall-example-key",
          secret: "example-secret-replace-with-32-byte-random-value-from-script",
        },
      ]);

      const { keys, secrets } = getInternalApiKeys();
      expect(keys.size).toBe(0);
      expect(secrets.size).toBe(0);
    });

    it("应拒绝 secret 长度不足 32 字符的条目", () => {
      process.env.INTERNAL_API_KEYS = JSON.stringify([
        { project: "advisor", key: "advisor-key", secret: "too-short-secret" },
      ]);

      expect(getInternalApiKeys().keys.size).toBe(0);
    });

    it("合法条目应正常加载", () => {
      const { keys } = getInternalApiKeys();
      expect(keys.get("advisor-key")?.project).toBe("advisor");
    });
  });

  describe("isProjectAllowed（project 级端点隔离）", () => {
    it("白名单内的 project 应放行", () => {
      expect(
        isProjectAllowed({ project: "mall", key: "k", secret: "s" }, ["mall", "advisor"])
      ).toBe(true);
    });

    it("白名单外的 project 应拒绝", () => {
      expect(isProjectAllowed({ project: "advisor", key: "k", secret: "s" }, ["mall"])).toBe(false);
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

  describe("cleanupInternalApiNonces", () => {
    it("应删除创建超过 10 分钟的 internal_api_nonce 记录", async () => {
      mockTokenBlacklistDeleteMany.mockResolvedValue({ count: 5 });
      const result = await cleanupInternalApiNonces();
      expect(result).toBe(5);
      expect(mockTokenBlacklistDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: "internal_api_nonce",
            createdAt: { lt: expect.any(Date) },
          },
        })
      );

      // 删除阈值应比"现在"早约 10 分钟（nonce 窗口 ±5 分钟的安全边界）
      const call = mockTokenBlacklistDeleteMany.mock.calls[0][0] as {
        where: { createdAt: { lt: Date } };
      };
      const threshold = call.where.createdAt.lt;
      const tenMinutesMs = 10 * 60 * 1000;
      expect(Math.abs(Date.now() - threshold.getTime() - tenMinutesMs)).toBeLessThan(60 * 1000);
    });

    it("清理失败应返回 0 而不抛出异常", async () => {
      mockTokenBlacklistDeleteMany.mockRejectedValue(new Error("connection refused"));
      expect(await cleanupInternalApiNonces()).toBe(0);
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
