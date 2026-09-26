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
  createSignedInternalRequestHeaders,
  canonicalizeQuery,
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

  describe("query 绑定签名（防篡改）", () => {
    const PATH = "/api/v1/internal/points/balance";

    it("canonicalizeQuery 编码化 + 码点排序（跨实现可复现）", () => {
      // 码点排序：大写 Z(0x5A) 在小写 a(0x61) 之前（与 JS 默认 sort 一致，非 localeCompare）
      expect(canonicalizeQuery("?b=2&a=1&a=0")).toBe("a=0&a=1&b=2");
      expect(canonicalizeQuery("?Z=1&a=2")).toBe("Z=1&a=2");
      // 组件编码：值中的 & / = 被转义，消除结构歧义
      expect(canonicalizeQuery("?a=b%26c%3D")).toBe("a=b%26c%3D");
      expect(canonicalizeQuery("?a=b&c=")).toBe("a=b&c=");
      expect(canonicalizeQuery("?a=b%26c%3D")).not.toBe(canonicalizeQuery("?a=b&c="));
      // 中文等非 ASCII 统一百分号编码（双方一致）
      expect(canonicalizeQuery("?q=%E4%B8%AD")).toBe("q=%E4%B8%AD");
      expect(canonicalizeQuery("")).toBe("");
    });

    it("新格式签名在 query 一致时通过", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "nonce-query-1";
      const bodyHash = await hashRequestBody("");
      const query = canonicalizeQuery("?phone=13800000000");

      const signature = generateInternalApiSignature(
        VALID_SECRET,
        "GET",
        PATH,
        timestamp,
        nonce,
        bodyHash,
        query
      );

      expect(
        verifyInternalApiSignature("advisor-key", signature, "GET", PATH, timestamp, nonce, bodyHash, {
          query,
        })
      ).not.toBeNull();
    });

    it("query 被篡改时新格式签名验证失败", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "nonce-query-2";
      const bodyHash = await hashRequestBody("");
      const signature = generateInternalApiSignature(
        VALID_SECRET,
        "GET",
        PATH,
        timestamp,
        nonce,
        bodyHash,
        canonicalizeQuery("?phone=13800000000")
      );

      expect(
        verifyInternalApiSignature("advisor-key", signature, "GET", PATH, timestamp, nonce, bodyHash, {
          query: canonicalizeQuery("?phone=13900000000"),
        })
      ).toBeNull();
    });

    it("默认放行旧格式（过渡期兼容），设置 INTERNAL_API_ALLOW_LEGACY_SIGNATURE=false 后拒绝", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = "nonce-query-3";
      const bodyHash = await hashRequestBody("");
      const legacySignature = generateInternalApiSignature(
        VALID_SECRET,
        "GET",
        PATH,
        timestamp,
        nonce,
        bodyHash
      );

      // 默认（未显式关闭）接受旧格式，保证未升级子站可用
      expect(
        verifyInternalApiSignature("advisor-key", legacySignature, "GET", PATH, timestamp, nonce, bodyHash, {
          query: "",
        })
      ).not.toBeNull();

      process.env.INTERNAL_API_ALLOW_LEGACY_SIGNATURE = "false";
      expect(
        verifyInternalApiSignature("advisor-key", legacySignature, "GET", PATH, timestamp, nonce, bodyHash, {
          query: "",
        })
      ).toBeNull();
    });

    it("INTERNAL_API_SIGN_QUERY=true 时出站签名绑定 query，可被新格式校验通过", async () => {
      process.env.INTERNAL_API_SIGN_QUERY = "true";
      const headers = createSignedInternalRequestHeaders("advisor", "GET", PATH, "", {
        query: "phone=13800000000",
      });
      expect(headers).not.toBeNull();

      const config = verifyInternalApiSignature(
        "advisor-key",
        headers!["X-Internal-API-Signature"],
        "GET",
        PATH,
        Number(headers!["X-Internal-API-Timestamp"]),
        headers!["X-Internal-API-Nonce"],
        await hashRequestBody(""),
        { query: "phone=13800000000" }
      );
      expect(config?.project).toBe("advisor");
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

    it("清理失败应抛出异常（cron 捕获后标记任务失败）", async () => {
      mockTokenBlacklistDeleteMany.mockRejectedValue(new Error("connection refused"));
      await expect(cleanupInternalApiNonces()).rejects.toThrow("connection refused");
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
