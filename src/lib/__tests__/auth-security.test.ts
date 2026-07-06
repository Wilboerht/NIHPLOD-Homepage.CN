import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordLoginAttempt,
  checkAccountLockout,
  clearLoginAttempts,
  DEFAULT_BRUTE_FORCE_CONFIG,
} from "../auth-security";

// 模拟 prisma 模块，避免连接真实数据库
vi.mock("../prisma", () => {
  const mockLoginAttempt = {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  return {
    prisma: {
      loginAttempt: mockLoginAttempt,
    },
  };
});

// 动态导入 prisma 以访问模拟对象
async function getMockLoginAttempt() {
  const { prisma } = await import("../prisma");
  return prisma.loginAttempt as unknown as {
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

function createMockRequest(headers: Record<string, string | null> = {}) {
  return {
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("auth-security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLoginAttempt", () => {
    it("应创建一条失败登录记录", async () => {
      process.env.TRUST_PROXY = "true";
      const mock = await getMockLoginAttempt();
      mock.create.mockResolvedValueOnce({});

      await recordLoginAttempt(
        "13800138000",
        false,
        createMockRequest({
          "x-forwarded-for": "1.2.3.4",
          "user-agent": "TestAgent",
        }),
        "password_incorrect",
        "password"
      );

      expect(mock.create).toHaveBeenCalledWith({
        data: {
          identifier: "13800138000",
          type: "password",
          success: false,
          reason: "password_incorrect",
          ipAddress: "1.2.3.4",
          userAgent: "TestAgent",
        },
      });
    });

    it("成功登录时 reason 应为 null", async () => {
      const mock = await getMockLoginAttempt();
      mock.create.mockResolvedValueOnce({});

      await recordLoginAttempt(
        "13800138000",
        true,
        createMockRequest(),
        undefined,
        "password"
      );

      expect(mock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: "13800138000",
            success: true,
            reason: null,
          }),
        })
      );
    });
  });

  describe("checkAccountLockout", () => {
    it("失败次数未达阈值时不应锁定", async () => {
      const mock = await getMockLoginAttempt();
      mock.count.mockResolvedValueOnce(2);

      const result = await checkAccountLockout("13800138000");

      expect(result.locked).toBe(false);
    });

    it("失败次数达到阈值时应锁定账户", async () => {
      const mock = await getMockLoginAttempt();
      mock.count.mockResolvedValueOnce(5);
      mock.findFirst.mockResolvedValueOnce({
        createdAt: new Date(),
      });

      const result = await checkAccountLockout(
        "13800138000",
        DEFAULT_BRUTE_FORCE_CONFIG
      );

      expect(result.locked).toBe(true);
      expect(result.remainingMinutes).toBeGreaterThan(0);
    });

    it("锁定时间过期后应允许登录", async () => {
      const mock = await getMockLoginAttempt();
      mock.count.mockResolvedValueOnce(5);
      mock.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 小时前
      });

      const result = await checkAccountLockout(
        "13800138000",
        DEFAULT_BRUTE_FORCE_CONFIG
      );

      expect(result.locked).toBe(false);
    });
  });

  describe("clearLoginAttempts", () => {
    it("应删除指定标识的登录尝试记录", async () => {
      const mock = await getMockLoginAttempt();
      mock.deleteMany.mockResolvedValueOnce({ count: 5 });

      await clearLoginAttempts("13800138000");

      expect(mock.deleteMany).toHaveBeenCalledWith({
        where: { identifier: "13800138000" },
      });
    });
  });
});
