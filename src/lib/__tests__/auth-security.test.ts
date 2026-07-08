import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordLoginAttempt,
  checkAccountLockout,
  clearLoginAttempts,
  DEFAULT_BRUTE_FORCE_CONFIG,
  saveRefreshToken,
  extractDeviceInfo,
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

  const mockRefreshToken = {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };

  return {
    prisma: {
      loginAttempt: mockLoginAttempt,
      refreshToken: mockRefreshToken,
      $transaction: vi.fn(),
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

async function getMockRefreshToken() {
  const { prisma } = await import("../prisma");
  return prisma.refreshToken as unknown as {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
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

  describe("saveRefreshToken", () => {
    it("应创建新的 Refresh Token", async () => {
      const { prisma } = await import("../prisma");
      const mock = await getMockRefreshToken();
      mock.findMany.mockResolvedValueOnce([]);
      mock.create.mockResolvedValueOnce({ id: "rt-1" });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      await saveRefreshToken(
        "user-1",
        "token-1",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        { deviceName: "Test Device", ipAddress: "1.2.3.4", userAgent: "TestAgent" }
      );

      expect(mock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            deviceName: "Test Device",
            ipAddress: "1.2.3.4",
          }),
        })
      );
    });

    it("同一设备应更新旧 Token", async () => {
      const { prisma } = await import("../prisma");
      const mock = await getMockRefreshToken();
      mock.findMany.mockResolvedValueOnce([
        {
          id: "rt-1",
          deviceInfo: "TestAgent",
          ipAddress: "1.2.3.4",
          userAgent: "TestAgent",
          createdAt: new Date(),
        },
      ]);
      mock.update.mockResolvedValueOnce({ id: "rt-1" });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      await saveRefreshToken(
        "user-1",
        "token-2",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        { deviceName: "Test Device", ipAddress: "1.2.3.4", userAgent: "TestAgent" }
      );

      expect(mock.update).toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
    });
  });

  describe("extractDeviceInfo", () => {
    it("应提取设备和 IP 信息", () => {
      process.env.TRUST_PROXY = "true";
      const request = createMockRequest({
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });

      const info = extractDeviceInfo(request);
      expect(info.ipAddress).toBe("1.2.3.4");
      expect(info.deviceName).toBe("Windows 浏览器");
      expect(info.userAgent).toContain("Windows");
    });
  });
});
