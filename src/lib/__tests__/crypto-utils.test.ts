import { describe, it, expect } from "vitest";
import { formatKey, toPrivateKeyPem, toPublicKeyPem, validateKeyFormat } from "@/lib/crypto-utils";

const PRIVATE_BODY =
  "MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgwKVPSmwaFkYLv" +
  "hGjJKtL6IHdGwT7t4v3lGz5xQ6yY7mT7aL0vW5r3v7x9y1z3A5C7E9G1I3K5M7O9Q2S4U6W8Y0a2c4e6g8i0k2m4o6q8s0u2w4y6A8C0E2G4I6K8M0O2Q4";

const PUBLIC_BODY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWy" +
  "F8PbnGy0AHB7MhgwKVPSmwaFkYLvhGjJKtL6IHdGwT7t4v3lGz5xQ6yY7mT7aL0vW5r3v7x9y1z3A5C7E9G1I3K5M7O9Q2S4U6W8Y0a2c4e6g8i0k2m4o6q8s0u2w4y6A8C0E2G4I6K8M0O2Q4";

const PRIVATE_PEM = `-----BEGIN RSA PRIVATE KEY-----\n${PRIVATE_BODY}\n-----END RSA PRIVATE KEY-----`;
const PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_BODY}\n-----END PUBLIC KEY-----`;

describe("crypto-utils", () => {
  describe("formatKey", () => {
    it("应去除首尾引号", () => {
      expect(formatKey('"hello"')).toBe("hello");
      expect(formatKey("'hello'")).toBe("hello");
      expect(formatKey('""hello""')).toBe("hello");
    });

    it("应将 \\\\n 替换为换行符", () => {
      expect(formatKey("line1\\nline2")).toBe("line1\nline2");
    });

    it("应处理空值", () => {
      expect(formatKey(undefined)).toBe("");
      expect(formatKey("")).toBe("");
    });
  });

  describe("toPrivateKeyPem", () => {
    it("纯 base64 body 应被包装为 RSA PRIVATE KEY PEM", () => {
      const pem = toPrivateKeyPem(PRIVATE_BODY);
      expect(pem).toContain("-----BEGIN RSA PRIVATE KEY-----");
      expect(pem).toContain("-----END RSA PRIVATE KEY-----");
      // PEM body 被折叠为每行 64 字符，去换行后应包含原始 body
      expect(pem.replace(/\n/g, "")).toContain(PRIVATE_BODY);
    });

    it("完整 PEM 不应被重复包装", () => {
      const pem = toPrivateKeyPem(PRIVATE_PEM);
      expect(pem).toBe(PRIVATE_PEM.replace(/\\n/g, "\n"));
      const matches = pem.match(/-----BEGIN RSA PRIVATE KEY-----/g);
      expect(matches?.length).toBe(1);
    });

    it("空值返回空字符串", () => {
      expect(toPrivateKeyPem(undefined)).toBe("");
    });
  });

  describe("toPublicKeyPem", () => {
    it("纯 base64 body 应被包装为 PUBLIC KEY PEM", () => {
      const pem = toPublicKeyPem(PUBLIC_BODY);
      expect(pem).toContain("-----BEGIN PUBLIC KEY-----");
      expect(pem).toContain("-----END PUBLIC KEY-----");
      expect(pem.replace(/\n/g, "")).toContain(PUBLIC_BODY);
    });

    it("完整 PEM 不应被重复包装", () => {
      const pem = toPublicKeyPem(PUBLIC_PEM);
      expect(pem).toBe(PUBLIC_PEM.replace(/\\n/g, "\n"));
      const matches = pem.match(/-----BEGIN PUBLIC KEY-----/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("validateKeyFormat", () => {
    it("应接受完整 PEM 私钥", () => {
      const result = validateKeyFormat(PRIVATE_PEM, "private", "TEST_PRIVATE");
      expect(result.valid).toBe(true);
    });

    it("应接受完整 PEM 公钥", () => {
      const result = validateKeyFormat(PUBLIC_PEM, "public", "TEST_PUBLIC");
      expect(result.valid).toBe(true);
    });

    it("应接受纯 base64 body", () => {
      expect(validateKeyFormat(PRIVATE_BODY, "private", "TEST_PRIVATE").valid).toBe(true);
      expect(validateKeyFormat(PUBLIC_BODY, "public", "TEST_PUBLIC").valid).toBe(true);
    });

    it("应拒绝空值", () => {
      const result = validateKeyFormat(undefined, "private", "TEST");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("未配置");
    });

    it("应拒绝过短的密钥", () => {
      const result = validateKeyFormat("short", "private", "TEST");
      expect(result.valid).toBe(false);
    });

    it("应拒绝包含多余转义的密钥", () => {
      // 构造一个长度足够且包含 \\n（两个反斜杠 + n）的字符串
      const longKeyWithExtraEscape = "a".repeat(50) + "\\\\n" + "b".repeat(10);
      const result = validateKeyFormat(longKeyWithExtraEscape, "private", "TEST");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("多余的转义");
    });
  });
});
