import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateSecurePassword, passwordSchema } from "../password";

describe("密码工具", () => {
  describe("hashPassword / verifyPassword", () => {
    it("应能正确哈希并验证密码", async () => {
      const password = "MyP@ssw0rd";
      const hashed = await hashPassword(password);

      expect(hashed).not.toBe(password);
      expect(await verifyPassword(password, hashed)).toBe(true);
    });

    it("应拒绝错误密码", async () => {
      const password = "MyP@ssw0rd";
      const hashed = await hashPassword(password);

      expect(await verifyPassword("wrong-password", hashed)).toBe(false);
    });
  });

  describe("passwordSchema", () => {
    it("应通过强密码", () => {
      expect(passwordSchema.safeParse("Hello123").success).toBe(true);
    });

    it("应拒绝过短密码", () => {
      expect(passwordSchema.safeParse("He1").success).toBe(false);
    });

    it("应拒绝缺少大写字母的密码", () => {
      expect(passwordSchema.safeParse("hello123").success).toBe(false);
    });

    it("应拒绝缺少小写字母的密码", () => {
      expect(passwordSchema.safeParse("HELLO123").success).toBe(false);
    });

    it("应拒绝缺少数字的密码", () => {
      expect(passwordSchema.safeParse("HelloWorld").success).toBe(false);
    });
  });

  describe("generateSecurePassword", () => {
    it("应生成符合长度要求的强密码", () => {
      const password = generateSecurePassword(32);
      expect(password).toHaveLength(32);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });
  });
});
