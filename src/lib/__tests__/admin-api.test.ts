/**
 * 管理端 API 集成测试
 * 覆盖认证、授权、CSRF 防护、限流、审计等安全关键路径
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 变量：必须在 vi.mock 之前定义（vi.mock 被提升到文件顶部）
// ============================================

const {
  mockPrismaModel,
  mockSignToken,
  mockVerifyToken,
  mockVerifyPassword,
  mockHashPassword,
  mockRateLimit,
  mockValidateCSRFToken,
  mockRecordSsoEvent,
} = vi.hoisted(() => {
  const createMockModel = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  });
  return {
    mockPrismaModel: createMockModel,
    mockSignToken: vi.fn(),
    mockVerifyToken: vi.fn(),
    mockVerifyPassword: vi.fn(),
    mockHashPassword: vi.fn(),
    mockRateLimit: vi.fn(),
    mockValidateCSRFToken: vi.fn(),
    mockRecordSsoEvent: vi.fn(),
  };
});

// ============================================
// Mock 模块
// ============================================

vi.mock("@/lib/prisma", () => {
  const prisma = {
    admin: mockPrismaModel(),
    user: mockPrismaModel(),
    product: mockPrismaModel(),
    loginAttempt: mockPrismaModel(),
    auditLog: mockPrismaModel(),
    refreshToken: mockPrismaModel(),
    oAuthSession: mockPrismaModel(),
    oAuthClient: mockPrismaModel(),
    ssoAuditEvent: mockPrismaModel(),
    contactMessage: mockPrismaModel(),
    category: mockPrismaModel(),
    job: mockPrismaModel(),
    image: mockPrismaModel(),
    purchaseLink: mockPrismaModel(),
    // 用户详情聚合查询（积分/兑换/地址/消费补录）
    pointBalance: mockPrismaModel(),
    pointRedemption: mockPrismaModel(),
    userAddress: mockPrismaModel(),
    spentAdjustmentApplication: mockPrismaModel(),
    // 外部平台身份（多平台聚合）：删除用户时 removeIdentities 调 deleteMany 需返回 count
    externalIdentity: { ...mockPrismaModel(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return { prisma, default: prisma };
});

// Mock JWT — mockSignToken/mockVerifyToken are already declared via vi.hoisted
vi.mock("@/lib/jwt", () => ({
  signToken: (...args: unknown[]) => mockSignToken(...args),
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  verifyUserToken: vi.fn().mockResolvedValue(null),
  signLogoutToken: vi.fn().mockResolvedValue("mock-logout-token"),
}));

// Mock password — mockVerifyPassword/mockHashPassword are already declared via vi.hoisted
const mockPasswordSchema = {
  parse: vi.fn((v: string) => v),
  safeParse: vi.fn((v: string) => ({ success: true, data: v })),
  optional: function () {
    return this as unknown as typeof mockPasswordSchema;
  },
};
vi.mock("@/lib/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  passwordSchema: mockPasswordSchema,
  validatePasswordStrength: vi.fn(() => ({ valid: true })),
}));

// Mock TOTP
vi.mock("@/lib/totp", () => ({
  verifyTOTP: vi.fn().mockReturnValue(true),
  decryptTOTPSecret: vi.fn().mockReturnValue("MOCK_TOTP_SECRET"),
  verifyBackupCode: vi.fn().mockReturnValue(null),
  generateTOTPSecret: vi.fn().mockReturnValue("MOCK_TOTP_SECRET"),
  generateTOTPQRCodeUrl: vi.fn().mockReturnValue("otpauth://mock"),
  encryptTOTPSecret: vi.fn().mockReturnValue("encrypted-secret"),
  generateBackupCodes: vi.fn().mockReturnValue(["ABCD1234"]),
  hashBackupCode: vi.fn().mockReturnValue("hashed-code"),
}));

// Mock ratelimit — mockRateLimit is already declared via vi.hoisted; just set default impl
mockRateLimit.mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 100 });
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock CSRF — mockValidateCSRFToken is already declared via vi.hoisted; just set default impl
mockValidateCSRFToken.mockReturnValue(true);
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () => {
    return NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    );
  },
}));

// Mock audit
vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
  listAuditLogs: vi.fn().mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  }),
  AUDIT_ACTIONS: ["login", "logout"],
  AUDIT_TARGET_TYPES: ["system", "admin"],
}));

// Mock sso-audit（SSO 审计事件写库）
mockRecordSsoEvent.mockResolvedValue(undefined);
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
  scheduleSsoEvent: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

// Mock validation
vi.mock("@/lib/validation", () => ({
  validateCUID: (id: string) => typeof id === "string" && id.length > 0,
  invalidIdResponse: () => {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
      { status: 400 }
    );
  },
}));

// Mock token-blacklist
vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: vi.fn(),
  removeFromBlacklist: vi.fn(),
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
  isAccessTokenRevoked: vi.fn().mockReturnValue(false),
}));

// Mock admin-stats
vi.mock("@/lib/admin-stats", () => ({
  getAdminStats: vi.fn().mockResolvedValue({
    products: 10,
    categories: 3,
    unreadMessages: 2,
    jobs: 5,
    totalUsers: 100,
    recentMessages: [],
  }),
}));

// Mock oauth-client (创建 OAuth Client 所需)
vi.mock("@/lib/oauth-client", () => ({
  createOAuthClient: vi.fn().mockResolvedValue({
    client: {
      id: "client-1",
      clientId: "abc123",
      name: "Test App",
      redirectUris: [],
      scopes: [],
      isActive: true,
    },
    plainSecret: "plain-secret-123",
  }),
  listOAuthClients: vi.fn().mockResolvedValue({ clients: [], total: 0 }),
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    hashSync: vi.fn().mockReturnValue("$2a$12$dummyhash"),
  },
  compare: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
  hashSync: vi.fn().mockReturnValue("$2a$12$dummyhash"),
}));

// Mock qrcode
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock") },
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
}));

// Mock API schemas — 用真实 zod schema 替代 passwordSchema mock（避免 z.object() 类型冲突）
vi.mock("@/schemas/api", async () => {
  const { z } = await import("zod");
  return {
    AdminLoginSchema: z.object({
      email: z.string().email("请输入有效的邮箱地址"),
      password: z.string().min(1),
      totpCode: z.string().length(6, "二次验证码为6位数字").optional(),
    }),
  };
});

import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ============================================
// 工具函数
// ============================================

function createRequest(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }
) {
  const url = new URL(path, "http://localhost:3000");
  const init: RequestInit = { method: options?.method || "GET" };
  if (options?.body) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json", ...options?.headers };
  }
  if (options?.headers) {
    init.headers = { ...init.headers, ...options.headers };
  }
  const req = new NextRequest(url, init as never);
  if (options?.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

/** 设置管理员认证 mock（包括 token cookie） */
function mockAdminAuth(
  admin: { id: string; email: string; name: string; role: string } | null,
  req?: NextRequest
) {
  if (admin) {
    mockVerifyToken.mockResolvedValue({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      type: "admin",
    });
    mockPrisma.admin.findUnique.mockResolvedValue({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: "ACTIVE",
      deletedAt: null,
    });
    // 在请求上设置 admin token cookie（withAuth/verifyAuth 会读取）
    if (req) {
      req.cookies.set("__Host-admin_token", "mock-admin-token");
    }
  } else {
    mockVerifyToken.mockResolvedValue(null);
  }
}

// ============================================
// 测试套件
// ============================================

describe("管理端 API 集成测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：限流通过、CSRF 通过、密码验证通过
    mockRateLimit.mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 100 });
    mockValidateCSRFToken.mockReturnValue(true);
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("$2a$12$hashedpassword");
    // 默认：无账户锁定（防止跨测试状态泄漏）
    mockPrisma.loginAttempt.count.mockResolvedValue(0);
    mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
  });

  // ============================================
  // 认证系统
  // ============================================

  describe("POST /api/admin/login", () => {
    it("CSRF Token 无效应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("Origin 不合法应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(true);

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://evil.com" },
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("参数格式错误应返回 400", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "not-an-email", password: "short" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("IP 限流触发应返回 429", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 99999, limit: 5 });

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(429);
      expect(data.error.code).toBe("RATE_LIMITED");
    });

    it("账户锁定应返回 429", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      // 模拟 5 次失败登录 → 锁定
      mockPrisma.loginAttempt.count.mockResolvedValue(5);
      mockPrisma.loginAttempt.findFirst.mockResolvedValue({
        createdAt: new Date(), // 最近一次失败刚刚发生
      });

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(429);
      expect(data.error.code).toBe("ACCOUNT_LOCKED");
    });

    it("管理员不存在应返回 401（通用错误，不泄露信息）", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      mockVerifyPassword.mockResolvedValue(false);
      mockPrisma.admin.findUnique.mockResolvedValue(null);

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "notfound@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error.code).toBe("INVALID_CREDENTIALS");
      expect(data.error.message).toBe("邮箱或密码错误");
    });

    it("账号被禁用应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      mockPrisma.admin.findUnique.mockResolvedValue({
        id: "admin-1",
        email: "admin@test.com",
        password: "$2a$12$hash",
        name: "Admin",
        role: "admin",
        status: "DISABLED",
        deletedAt: null,
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      });

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error.code).toBe("ACCOUNT_DISABLED");
    });

    it("正常登录应返回 200 并设置 Cookie", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      mockPrisma.admin.findUnique.mockResolvedValue({
        id: "admin-1",
        email: "admin@test.com",
        password: "$2a$12$hash",
        name: "Admin",
        role: "admin",
        status: "ACTIVE",
        deletedAt: null,
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      });
      mockSignToken.mockResolvedValue("mock-jwt-token-admin-1");

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe("admin@test.com");
      // 验证 cookie 被设置
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("__Host-admin_token");
    });

    it("TOTP 已启用但未提供 code 应返回 TOTP_REQUIRED", async () => {
      mockValidateCSRFToken.mockReturnValue(true);
      mockPrisma.admin.findUnique.mockResolvedValue({
        id: "admin-1",
        email: "admin@test.com",
        password: "$2a$12$hash",
        name: "Admin",
        role: "admin",
        status: "ACTIVE",
        deletedAt: null,
        totpEnabled: true,
        totpSecret: "encrypted-secret",
        totpBackupCodes: "[]",
      });

      const { POST } = await import("@/app/api/admin/login/route");
      const req = createRequest("/api/admin/login", {
        method: "POST",
        body: { email: "admin@test.com", password: "Admin123" },
        headers: { origin: "https://nihplod.cn" },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.error.code).toBe("TOTP_REQUIRED");
    });
  });

  describe("GET /api/admin/me", () => {
    it("未认证应返回 401", async () => {
      const req = createRequest("/api/admin/me");
      mockAdminAuth(null, req);

      const { GET } = await import("@/app/api/admin/me/route");
      const res = await GET(req, undefined!);
      expect(res.status).toBe(401);
    });

    it("已认证应返回用户信息", async () => {
      const req = createRequest("/api/admin/me");
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }, req);

      const { GET } = await import("@/app/api/admin/me/route");
      const res = await GET(req, undefined!);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe("admin@test.com");
      expect(data.data.user.role).toBe("admin");
    });
  });

  describe("POST /api/admin/logout", () => {
    it("未认证应返回 401", async () => {
      const req = createRequest("/api/admin/logout", { method: "POST" });
      mockAdminAuth(null, req);

      const { POST } = await import("@/app/api/admin/logout/route");
      const res = await POST(req, undefined!);
      expect(res.status).toBe(401);
    });

    it("已认证应返回 200 并清除 Cookie", async () => {
      const req = createRequest("/api/admin/logout", { method: "POST" });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }, req);

      const { POST } = await import("@/app/api/admin/logout/route");
      const res = await POST(req, undefined!);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 验证 cookie 被清除 (maxAge=0)
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
    });
  });

  // ============================================
  // 用户管理
  // ============================================

  describe("GET /api/admin/users/:id", () => {
    it("用户详情响应应包含 externalIdentities 多平台身份列表", async () => {
      const req = createRequest("/api/admin/users/user-1");
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" }, req);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        phoneVerified: true,
        nickname: "测试用户",
        avatar: null,
        status: "ACTIVE",
        membershipLevel: "GOLD",
        totalSpent: 5000,
        silverActivatedAt: new Date("2026-08-01T00:00:00.000Z"),
        goldActivatedAt: new Date("2026-08-10T00:00:00.000Z"),
        diamondActivatedAt: null,
        wechatOpenId: null,
        wechatUnionId: null,
        externalIdentities: [
          {
            id: "ei-1",
            provider: "douyin",
            subjectId: "dy-openid",
            unionId: "dy-union",
            metadata: { nickname: "抖音昵称", avatar: null },
            createdAt: new Date("2026-08-21T00:00:00.000Z"),
          },
          {
            id: "ei-2",
            provider: "wechat_miniprogram",
            subjectId: "mp-openid",
            unionId: null,
            metadata: null,
            createdAt: new Date("2026-08-21T01:00:00.000Z"),
          },
        ],
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-21T00:00:00.000Z"),
      });
      mockPrisma.pointBalance.findUnique.mockResolvedValue({ available: 123, frozen: 0, updatedAt: new Date() });
      mockPrisma.pointRedemption.findMany.mockResolvedValue([]);
      mockPrisma.pointRedemption.count.mockResolvedValue(0);
      mockPrisma.userAddress.findMany.mockResolvedValue([]);
      mockPrisma.spentAdjustmentApplication.findMany.mockResolvedValue([]);
      mockPrisma.spentAdjustmentApplication.count.mockResolvedValue(0);

      const { GET } = await import("@/app/api/admin/users/[id]/route");
      const res = await GET(req, { params: Promise.resolve({ id: "user-1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.data.user.externalIdentities)).toBe(true);
      expect(data.data.user.externalIdentities).toHaveLength(2);
      expect(data.data.user.externalIdentities[0]).toMatchObject({
        provider: "douyin",
        subjectId: "dy-openid",
        unionId: "dy-union",
      });
      // 手机号仍应脱敏（平台身份字段不受影响）
      expect(data.data.user.phone).not.toBe("13800138000");
      // 聚合分区：积分/地址/消费记录
      expect(data.data.points).toEqual({
        available: 123,
        frozen: 0,
        redemptions: [],
        redemptionTotal: 0,
      });
      expect(Array.isArray(data.data.addresses)).toBe(true);
      expect(data.data.spentAdjustments.items).toEqual([]);
      // 等级成长字段
      expect(data.data.user.goldActivatedAt).toBe("2026-08-10T00:00:00.000Z");
      expect(data.data.user.diamondActivatedAt).toBeNull();
    });
  });

  describe("PATCH /api/admin/users/:id", () => {
    it("CSRF Token 无效应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);

      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const req = createRequest("/api/admin/users/user-1", {
        method: "PATCH",
        body: { status: "BANNED" },
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) });
      expect(res.status).toBe(403);
    });

    it("封禁用户应级联撤销 Token 并写入 SSO 审计事件", async () => {
      const req = createRequest("/api/admin/users/user-1", {
        method: "PATCH",
        body: { status: "BANNED" },
      });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" }, req);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "ACTIVE",
      });
      mockPrisma.user.update.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "BANNED",
      });

      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 验证级联操作：撤销 refresh token
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
      // 验证写入 SSO 审计事件
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          success: true,
          detail: expect.objectContaining({
            action: "user_banned",
            previousStatus: "ACTIVE",
            newStatus: "BANNED",
          }),
        })
      );
    });

    it("解冻用户应写入 SSO 审计事件（user_unbanned）", async () => {
      const req = createRequest("/api/admin/users/user-1", {
        method: "PATCH",
        body: { status: "ACTIVE" },
      });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" }, req);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "BANNED",
      });
      mockPrisma.user.update.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "ACTIVE",
      });

      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(200);
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          detail: expect.objectContaining({
            action: "user_unbanned",
            previousStatus: "BANNED",
            newStatus: "ACTIVE",
          }),
        })
      );
    });

    it("删除用户应匿名化 PII 并写入 SSO 审计事件（user_deleted）", async () => {
      const req = createRequest("/api/admin/users/user-1", { method: "DELETE" });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" }, req);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "ACTIVE",
      });
      mockPrisma.oAuthSession.findMany.mockResolvedValue([]);

      const { DELETE } = await import("@/app/api/admin/users/[id]/route");
      const res = await DELETE(req, { params: Promise.resolve({ id: "user-1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 软删除：封禁 + 匿名化（含生日等 PII 字段置 null）
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "BANNED",
            nickname: "[已删除]",
            birthday: null,
          }),
        })
      );
      // 验证写入 SSO 审计事件
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          userId: "user-1",
          success: true,
          detail: expect.objectContaining({
            action: "user_deleted",
            previousStatus: "ACTIVE",
            newStatus: "BANNED",
          }),
        })
      );
    });

    it("普通 admin 无权封禁用户", async () => {
      const req = createRequest("/api/admin/users/user-1", {
        method: "PATCH",
        body: { status: "BANNED" },
      });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }, req);

      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(403);
    });

    it("状态未变化应直接返回原数据", async () => {
      const req = createRequest("/api/admin/users/user-1", {
        method: "PATCH",
        body: { status: "ACTIVE" },
      });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" }, req);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        status: "ACTIVE",
      });

      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 不应调用 update（状态未变化）
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 产品管理 — CSRF 防护
  // ============================================

  describe("POST /api/admin/products (CSRF)", () => {
    it("CSRF Token 无效应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);

      const { POST } = await import("@/app/api/admin/products/route");
      const req = createRequest("/api/admin/products", {
        method: "POST",
        body: {
          name: "测试产品",
          nameEn: "Test Product",
          slug: "test-product",
          description: "<p>Test</p>",
          price: 100,
          categoryId: "cat-1",
          images: [],
          benefits: [],
          order: 0,
          featured: false,
          published: false,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // 管理员管理 — 角色权限
  // ============================================

  describe("POST /api/admin/admins (角色权限)", () => {
    it("admin 角色无权创建管理员", async () => {
      const req = createRequest("/api/admin/admins", {
        method: "POST",
        body: { email: "new@test.com", name: "New Admin", password: "Admin123!", role: "admin" },
      });
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }, req);

      const { POST } = await import("@/app/api/admin/admins/route");
      // withRole(["owner"]) 应该拦截 admin 角色（返回 403 FORBIDDEN）
      const res = await POST(req, {
        id: "admin-1",
        email: "admin@test.com",
        name: "Admin",
        role: "admin",
      } as never);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        success: false,
        error: { code: "FORBIDDEN" },
      });
    });
  });

  // ============================================
  // 限流验证
  // ============================================

  describe("限流保护", () => {
    it("用户列表 GET 超限应返回 429", async () => {
      const req = createRequest("/api/admin/users");
      mockAdminAuth({ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }, req);
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 99999, limit: 60 });

      const { GET } = await import("@/app/api/admin/users/route");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error.code).toBe("RATE_LIMITED");
    });
  });
});
