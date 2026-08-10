/**
 * 密码工具与密码策略测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSecurePassword,
  passwordSchema,
  validatePasswordStrength,
  isWeakPassword,
  isPasswordExpired,
  getPasswordExpiryDate,
  PASSWORD_EXPIRY_DAYS,
  PASSWORD_HISTORY_LIMIT,
} from "@/lib/password";
import { recordPasswordHistory, checkPasswordHistory } from "@/lib/password-policy";

// === Mock prisma for password-policy ===
const { mockCreate, mockFindMany, mockDeleteMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const _pwdPrismaClient = {
    passwordHistory: {
      create: mockCreate,
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
  };
  return {
    prisma: {
      ..._pwdPrismaClient,
      $transaction: vi.fn((cb: (tx: typeof _pwdPrismaClient) => unknown) => cb(_pwdPrismaClient)),
    },
  };
});

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

    it("应拒绝弱密码", () => {
      expect(passwordSchema.safeParse("Password123").success).toBe(false);
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

  describe("弱密码黑名单", () => {
    it("应识别常见弱密码", () => {
      expect(isWeakPassword("123456")).toBe(true);
      expect(isWeakPassword("password")).toBe(true);
      expect(isWeakPassword("qwerty")).toBe(true);
    });

    it("应识别连续数字与字母", () => {
      expect(isWeakPassword("abcdef123")).toBe(true);
      expect(isWeakPassword("123456789")).toBe(true);
      expect(isWeakPassword("zyxwvuts")).toBe(true);
    });

    it("应识别重复字符", () => {
      expect(isWeakPassword("11111111")).toBe(true);
    });

    it("不应误判强密码", () => {
      expect(isWeakPassword("Hello123")).toBe(false);
      expect(isWeakPassword("MyP@ssw0rd")).toBe(false);
    });

    it("validatePasswordStrength 应拒绝弱密码", () => {
      const result = validatePasswordStrength("Password123");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("弱密码");
    });
  });

  describe("密码历史", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("recordPasswordHistory 应创建记录并清理旧记录", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "h1" },
        { id: "h2" },
        { id: "h3" },
        { id: "h4" },
        { id: "h5" },
        { id: "h6" },
      ]);

      await recordPasswordHistory("user-1", "hashed-password", 5);

      expect(mockCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", password: "hashed-password" },
      });
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["h6"] } },
      });
    });

    it("checkPasswordHistory 应在历史匹配时返回 true", async () => {
      const hashed = await hashPassword("MyP@ssw0rd");
      mockFindMany.mockResolvedValueOnce([{ password: hashed }]);

      const result = await checkPasswordHistory("user-1", "MyP@ssw0rd", PASSWORD_HISTORY_LIMIT);
      expect(result).toBe(true);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: PASSWORD_HISTORY_LIMIT,
        select: { password: true },
      });
    });

    it("checkPasswordHistory 应在历史不匹配时返回 false", async () => {
      const hashed = await hashPassword("MyP@ssw0rd");
      mockFindMany.mockResolvedValueOnce([{ password: hashed }]);

      const result = await checkPasswordHistory("user-1", "Different1", PASSWORD_HISTORY_LIMIT);
      expect(result).toBe(false);
    });

    it("checkPasswordHistory 在历史为空时返回 false", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      expect(await checkPasswordHistory("user-1", "AnyPass1")).toBe(false);
    });
  });

  describe("密码过期策略", () => {
    it("应正确判断密码已过期", () => {
      expect(isPasswordExpired({ passwordExpiresAt: new Date(Date.now() - 1000) })).toBe(true);
    });

    it("应正确判断密码未过期", () => {
      expect(isPasswordExpired({ passwordExpiresAt: new Date(Date.now() + 86400000) })).toBe(false);
    });

    it("未设置过期时间时不应判定为过期", () => {
      expect(isPasswordExpired({ passwordExpiresAt: null })).toBe(false);
      expect(isPasswordExpired({})).toBe(false);
    });

    it("getPasswordExpiryDate 应返回约 90 天后", () => {
      const expected = new Date(Date.now() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const actual = getPasswordExpiryDate();
      expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });
});
