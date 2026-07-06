import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateInternalApiSignature,
  verifyInternalApiSignature,
  isTimestampValid,
  checkAndRecordNonce,
  hashRequestBody,
} from "../internal-api";

describe("internal-api", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: "advisor-key", secret: "advisor-secret" },
    ]);
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
    it("新 nonce 应可用", () => {
      expect(checkAndRecordNonce("nonce-1")).toBe(true);
    });

    it("重复 nonce 应被拒绝", () => {
      checkAndRecordNonce("nonce-2");
      expect(checkAndRecordNonce("nonce-2")).toBe(false);
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
