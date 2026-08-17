import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordLoginAttempt,
  checkAccountLockout,
  clearLoginAttempts,
  DEFAULT_BRUTE_FORCE_CONFIG,
  saveRefreshToken,
  atomicallyRotateRefreshToken,
  extractDeviceInfo,
  cleanupRevokedSessionsAndTokens,
  cleanupRevokedUserConsents,
} from "@/lib/auth-security";

// 模拟 sso-audit，避免审计写入真实数据库
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn().mockResolvedValue(undefined),
}));

// 模拟 prisma 模块，避免连接真实数据库
vi.mock("@/lib/prisma", () => {
  const mockLoginAttempt = {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  const mockRefreshToken = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };

  const mockUser = {
    findUnique: vi.fn(),
  };

  const mockOAuthSession = {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  const mockUserConsent = {
    deleteMany: vi.fn(),
  };

  return {
    prisma: {
      loginAttempt: mockLoginAttempt,
      refreshToken: mockRefreshToken,
      user: mockUser,
      oAuthSession: mockOAuthSession,
      userConsent: mockUserConsent,
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
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

async function getMockUser() {
  const { prisma } = await import("../prisma");
  return prisma.user as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

async function getMockOAuthSession() {
  const { prisma } = await import("../prisma");
  return prisma.oAuthSession as unknown as {
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

async function getMockUserConsent() {
  const { prisma } = await import("../prisma");
  return prisma.userConsent as unknown as {
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

      expect(mock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "password",
            success: false,
            reason: "password_incorrect",
            ipAddress: "1.2.3.4",
            userAgent: "TestAgent",
          }),
        })
      );
    });

    it("成功登录时 reason 应为 null", async () => {
      const mock = await getMockLoginAttempt();
      mock.create.mockResolvedValueOnce({});

      await recordLoginAttempt("13800138000", true, createMockRequest(), undefined, "password");

      expect(mock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: expect.any(String),
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

      const result = await checkAccountLockout("13800138000", DEFAULT_BRUTE_FORCE_CONFIG);

      expect(result.locked).toBe(true);
      expect(result.remainingMinutes).toBeGreaterThan(0);
    });

    it("锁定时间过期后应允许登录", async () => {
      const mock = await getMockLoginAttempt();
      mock.count.mockResolvedValueOnce(5);
      mock.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 小时前
      });

      const result = await checkAccountLockout("13800138000", DEFAULT_BRUTE_FORCE_CONFIG);

      expect(result.locked).toBe(false);
    });
  });

  describe("clearLoginAttempts", () => {
    it("应删除指定标识的登录尝试记录", async () => {
      const mock = await getMockLoginAttempt();
      mock.deleteMany.mockResolvedValueOnce({ count: 5 });

      await clearLoginAttempts("13800138000");

      expect(mock.deleteMany).toHaveBeenCalledWith({
        where: { identifier: expect.any(String) },
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

      await saveRefreshToken("user-1", "token-1", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), {
        deviceName: "Test Device",
        ipAddress: "1.2.3.4",
        userAgent: "TestAgent",
      });

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
          deviceName: "Test Device",
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

      await saveRefreshToken("user-1", "token-2", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), {
        deviceName: "Test Device",
        ipAddress: "1.2.3.4",
        userAgent: "TestAgent",
      });

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

  describe("atomicallyRotateRefreshToken 重用检测", () => {
    it("concurrent_rotation 应吊销该用户该 client 的整个 token 家族并记录审计", async () => {
      const { prisma } = await import("../prisma");
      const mockRt = await getMockRefreshToken();
      const mockUser = await getMockUser();
      const { recordSsoEvent } = await import("@/lib/sso-audit");

      mockRt.findFirst.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
        clientId: "client-1",
        revokedAt: null,
      });
      mockUser.findUnique.mockResolvedValueOnce({ status: "ACTIVE" });
      mockRt.updateMany
        // 乐观锁撤销返回 0 → 另一请求已先撤销，判定为并发重用攻击
        .mockResolvedValueOnce({ count: 0 })
        // token 家族吊销
        .mockResolvedValueOnce({ count: 3 });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      const result = await atomicallyRotateRefreshToken(
        "user-1",
        "old-token",
        "new-token",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        undefined,
        "client-1"
      );

      expect(result).toEqual({
        valid: false,
        reason: "concurrent_rotation",
        familyRevokedCount: 3,
      });

      // RFC 6819 §5.2.2.3：吊销该用户该 client 下全部活跃 refresh token
      expect(mockRt.updateMany).toHaveBeenNthCalledWith(2, {
        where: { userId: "user-1", clientId: "client-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      // 不应继续签发新 token
      expect(mockRt.create).not.toHaveBeenCalled();

      // 记录合规敏感审计事件
      expect(recordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          clientId: "client-1",
          success: false,
          detail: expect.objectContaining({
            action: "refresh_token_family_revoked",
            reason: "concurrent_rotation",
            familyRevokedCount: 3,
          }),
        })
      );
    });

    it("revoked（顺序重用已撤销 token）应吊销整个 token 家族、撤销 OAuthSession 并记录审计", async () => {
      const { prisma } = await import("../prisma");
      const mockRt = await getMockRefreshToken();
      const mockSession = await getMockOAuthSession();
      const { recordSsoEvent } = await import("@/lib/sso-audit");

      // token 存在但已被撤销 → 顺序重用攻击
      mockRt.findFirst.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
        clientId: "client-1",
        revokedAt: new Date(),
      });
      mockRt.updateMany.mockResolvedValueOnce({ count: 2 });
      mockSession.updateMany.mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      const result = await atomicallyRotateRefreshToken(
        "user-1",
        "old-token",
        "new-token",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        undefined,
        "client-1"
      );

      expect(result).toEqual({
        valid: false,
        reason: "revoked",
        familyRevokedCount: 2,
      });

      // RFC 6819 §5.2.2.3：吊销该用户该 client 下全部活跃 refresh token
      expect(mockRt.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      // 同步撤销对应 OAuthSession（携带 sid 的 access token 即时失效）
      expect(mockSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      // 不应继续签发新 token
      expect(mockRt.create).not.toHaveBeenCalled();

      // 记录合规敏感审计事件
      expect(recordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          clientId: "client-1",
          success: false,
          detail: expect.objectContaining({
            action: "refresh_token_family_revoked",
            reason: "revoked",
            familyRevokedCount: 2,
          }),
        })
      );
    });

    it("missing（token 不存在/已过期）应吊销整个 token 家族、撤销 OAuthSession 并记录审计", async () => {
      const { prisma } = await import("../prisma");
      const mockRt = await getMockRefreshToken();
      const mockSession = await getMockOAuthSession();
      const { recordSsoEvent } = await import("@/lib/sso-audit");

      mockRt.findFirst.mockResolvedValueOnce(null);
      mockRt.updateMany.mockResolvedValueOnce({ count: 1 });
      mockSession.updateMany.mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      const result = await atomicallyRotateRefreshToken(
        "user-1",
        "old-token",
        "new-token",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        undefined,
        "client-1"
      );

      expect(result).toEqual({
        valid: false,
        reason: "missing",
        familyRevokedCount: 1,
      });

      expect(mockRt.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockRt.create).not.toHaveBeenCalled();
      expect(recordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          clientId: "client-1",
          success: false,
          detail: expect.objectContaining({
            action: "refresh_token_family_revoked",
            reason: "missing",
          }),
        })
      );
    });

    it("重用检测的家族吊销是幂等的：重复触发不报错", async () => {
      const { prisma } = await import("../prisma");
      const mockRt = await getMockRefreshToken();
      const mockSession = await getMockOAuthSession();

      mockRt.findFirst.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        clientId: "client-1",
        revokedAt: new Date(),
      });
      // 第二次触发时家族已无活跃 token（updateMany count=0），不应抛错
      mockRt.updateMany.mockResolvedValue({ count: 0 });
      mockSession.updateMany.mockResolvedValue({ count: 0 });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma as unknown as never);
      });

      const first = await atomicallyRotateRefreshToken(
        "user-1",
        "old-token",
        "new-token",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        undefined,
        "client-1"
      );
      const second = await atomicallyRotateRefreshToken(
        "user-1",
        "old-token",
        "new-token",
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        undefined,
        "client-1"
      );

      expect(first.valid).toBe(false);
      expect(second).toEqual({ valid: false, reason: "revoked", familyRevokedCount: 0 });
    });
  });

  describe("cleanupRevokedSessionsAndTokens", () => {
    it("应物理删除撤销超过 30 天或过期超过 30 天的会话、撤销超过 30 天的 Token", async () => {
      const mockSession = await getMockOAuthSession();
      const mockRt = await getMockRefreshToken();
      mockSession.deleteMany.mockResolvedValue({ count: 2 });
      mockRt.deleteMany.mockResolvedValue({ count: 5 });

      const result = await cleanupRevokedSessionsAndTokens();

      expect(result).toEqual({ sessions: 2, tokens: 5 });
      // 过期但未撤销的会话也需被清理（OR 条件），阈值均为 30 天前
      expect(mockSession.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { revokedAt: { lt: expect.any(Date) } },
            { expiresAt: { lt: expect.any(Date) } },
          ],
        },
      });
      expect(mockRt.deleteMany).toHaveBeenCalledWith({
        where: { revokedAt: { lt: expect.any(Date) } },
      });
    });

    it("清理失败应返回零计数而不抛错", async () => {
      const mockSession = await getMockOAuthSession();
      mockSession.deleteMany.mockRejectedValue(new Error("db down"));

      const result = await cleanupRevokedSessionsAndTokens();
      expect(result).toEqual({ sessions: 0, tokens: 0 });
    });
  });

  describe("cleanupRevokedUserConsents", () => {
    it("应物理删除撤销超过 30 天的用户授权记录", async () => {
      const mockConsent = await getMockUserConsent();
      mockConsent.deleteMany.mockResolvedValue({ count: 4 });

      const result = await cleanupRevokedUserConsents();

      expect(result).toBe(4);
      expect(mockConsent.deleteMany).toHaveBeenCalledWith({
        where: { revokedAt: { lt: expect.any(Date) } },
      });
    });

    it("清理失败应返回 0 而不抛错", async () => {
      const mockConsent = await getMockUserConsent();
      mockConsent.deleteMany.mockRejectedValue(new Error("db down"));

      const result = await cleanupRevokedUserConsents();
      expect(result).toBe(0);
    });
  });
});
