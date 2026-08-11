/**
 * 管理端 OAuth Client CRUD 路由测试
 *
 * 覆盖：
 * - GET  /api/admin/oauth-clients      未认证 401 / 非 owner 403 / 超限 429 / 正常分页
 * - POST /api/admin/oauth-clients      未认证 401 / 非 owner 403 / 创建成功返回一次性明文 secret /
 *                                      私网 redirectUri 400 / 带 fragment redirectUri 400 /
 *                                      scopes 非白名单 400
 * - GET    /api/admin/oauth-clients/:id  非 owner 403 / 404 / 响应不含 clientSecret
 * - PATCH  /api/admin/oauth-clients/:id  非 owner 403 / 404 / 停用时级联撤销 session
 * - DELETE /api/admin/oauth-clients/:id  非 owner 403 / 404 / 删除后审计事件保留
 *                                        （ssoAuditEvent.deleteMany 不被调用）/
 *                                        联动 blacklistUserTokens
 *
 * 注意：@/lib/oauth-client 使用真实实现（zod 校验、toSafeClientResponse 白名单、
 * deleteOAuthClient 级联清理逻辑均真实执行），仅 mock prisma / auth / 限流 / CSRF 等外部依赖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock（vi.mock 被提升到文件顶部，必须先定义）
// ============================================

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockRateLimit,
  mockValidateCSRFToken,
  mockBlacklistUserTokens,
  mockRecordSsoEvent,
  mockCreateAuditLog,
  mockSendBackchannelLogout,
  prismaMock,
} = vi.hoisted(() => {
  const createMockModel = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  });
  const prisma: Record<string, unknown> = {
    oAuthClient: createMockModel(),
    oAuthSession: createMockModel(),
    userConsent: createMockModel(),
    refreshToken: createMockModel(),
    oAuthAuthorizationCode: createMockModel(),
    ssoAuditEvent: createMockModel(),
  };
  // $transaction 直接以同一 mock 对象执行回调
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return {
    mockVerifyAuth: vi.fn(),
    mockCheckAdminRateLimit: vi.fn(),
    mockRateLimit: vi.fn(),
    mockValidateCSRFToken: vi.fn(),
    mockBlacklistUserTokens: vi.fn(),
    mockRecordSsoEvent: vi.fn(),
    mockCreateAuditLog: vi.fn(),
    mockSendBackchannelLogout: vi.fn(),
    prismaMock: prisma as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
      $transaction: ReturnType<typeof vi.fn>;
    },
  };
});

// ============================================
// Mock 模块
// ============================================

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

vi.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  checkAdminRateLimit: (...args: unknown[]) => mockCheckAdminRateLimit(...args),
  verifyUserAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    ),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: (...args: unknown[]) => mockBlacklistUserTokens(...args),
  removeFromBlacklist: vi.fn(),
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
  isAccessTokenRevoked: vi.fn().mockReturnValue(false),
}));

// backchannel-logout：isBlockedHostname 保留真实实现（redirectUri 私网校验依赖它），
// 仅 stub sendBackchannelLogout 避免真实网络/JWT 逻辑
vi.mock("@/lib/backchannel-logout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backchannel-logout")>();
  return {
    ...actual,
    sendBackchannelLogout: (...args: unknown[]) => mockSendBackchannelLogout(...args),
  };
});

vi.mock("@/lib/validation", () => ({
  validateCUID: (id: string) => typeof id === "string" && id.length > 0,
  invalidIdResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
      { status: 400 }
    ),
}));

// bcryptjs：以可逆伪哈希加速测试（真实 bcrypt cost 12 会拖慢套件）
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (s: string) => `hashed:${s}`),
    compare: vi.fn(async (s: string, h: string) => h === `hashed:${s}`),
  },
  hash: vi.fn(async (s: string) => `hashed:${s}`),
  compare: vi.fn(async (s: string, h: string) => h === `hashed:${s}`),
}));

// ============================================
// 工具函数
// ============================================

function createRequest(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const url = new URL(path, "http://localhost:3000");
  const init: RequestInit = { method: options?.method || "GET" };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json", ...options?.headers };
  } else if (options?.headers) {
    init.headers = { ...options.headers };
  }
  return new NextRequest(url, init as never);
}

const OWNER = { id: "admin-owner-1", email: "owner@test.com", name: "Owner", role: "owner" };
const NORMAL_ADMIN = { id: "admin-2", email: "admin@test.com", name: "Admin", role: "admin" };

/** 构造一条完整的 OAuthClient 数据库记录 */
function makeClientRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-db-id-1",
    clientId: "abc123clientid",
    clientSecret: "hashed:old-plain-secret",
    name: "Test App",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
    scopes: ["openid", "profile"],
    isActive: true,
    isPublic: false,
    backchannelLogoutUri: null,
    codeTtlSeconds: 300,
    accessTokenTtlSeconds: 900,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const routeContext = (id: string) => ({ params: Promise.resolve({ id }) });

// ============================================
// 测试套件
// ============================================

describe("管理端 OAuth Client CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：owner 认证通过、限流通过、CSRF 通过
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 30 });
    mockValidateCSRFToken.mockReturnValue(true);
    mockBlacklistUserTokens.mockResolvedValue(undefined);
    mockRecordSsoEvent.mockResolvedValue(undefined);
    mockCreateAuditLog.mockResolvedValue(true);
    mockSendBackchannelLogout.mockResolvedValue(undefined);
    prismaMock.oAuthSession.groupBy.mockResolvedValue([]);
    prismaMock.ssoAuditEvent.groupBy.mockResolvedValue([]);
  });

  // ------------------------------------------
  // GET /api/admin/oauth-clients
  // ------------------------------------------

  describe("GET /api/admin/oauth-clients", () => {
    it("未认证应返回 401", async () => {
      mockVerifyAuth.mockResolvedValue(null);
      const { GET } = await import("@/app/api/admin/oauth-clients/route");
      const res = await GET(createRequest("/api/admin/oauth-clients"));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue(NORMAL_ADMIN);
      const { GET } = await import("@/app/api/admin/oauth-clients/route");
      const res = await GET(createRequest("/api/admin/oauth-clients"));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    });

    it("限流触发应返回 429", async () => {
      mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 99999, limit: 30 });
      const { GET } = await import("@/app/api/admin/oauth-clients/route");
      const res = await GET(createRequest("/api/admin/oauth-clients"));
      expect(res.status).toBe(429);
      expect((await res.json()).error.code).toBe("RATE_LIMITED");
    });

    it("owner 应返回 200 且响应不含 clientSecret", async () => {
      const record = makeClientRecord();
      prismaMock.oAuthClient.findMany.mockResolvedValue([record]);
      prismaMock.oAuthClient.count.mockResolvedValue(1);

      const { GET } = await import("@/app/api/admin/oauth-clients/route");
      const res = await GET(createRequest("/api/admin/oauth-clients"));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.clients).toHaveLength(1);
      expect(data.data.pagination.total).toBe(1);
      // toSafeClientResponse 显式白名单：secret 绝不出现在列表响应中
      expect(data.data.clients[0]).not.toHaveProperty("clientSecret");
      // 使用统计填充（聚合失败容错路径之外）
      expect(data.data.clients[0]).toHaveProperty("activeUserCount", 0);
    });
  });

  // ------------------------------------------
  // POST /api/admin/oauth-clients
  // ------------------------------------------

  describe("POST /api/admin/oauth-clients", () => {
    const validBody = {
      name: "New App",
      redirectUris: ["https://newapp.example.com/callback"],
      scopes: ["openid", "profile"],
    };

    it("CSRF 校验失败应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(createRequest("/api/admin/oauth-clients", { method: "POST", body: validBody }));
      expect(res.status).toBe(403);
    });

    it("未认证应返回 401", async () => {
      mockVerifyAuth.mockResolvedValue(null);
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(createRequest("/api/admin/oauth-clients", { method: "POST", body: validBody }));
      expect(res.status).toBe(401);
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue(NORMAL_ADMIN);
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(createRequest("/api/admin/oauth-clients", { method: "POST", body: validBody }));
      expect(res.status).toBe(403);
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("创建成功应返回一次性明文 secret，且 client 字段不含 clientSecret", async () => {
      prismaMock.oAuthClient.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
        makeClientRecord({
          clientId: args.data.clientId,
          clientSecret: args.data.clientSecret,
          name: args.data.name,
          redirectUris: args.data.redirectUris,
        })
      );

      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(createRequest("/api/admin/oauth-clients", { method: "POST", body: validBody }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // 明文 secret 仅在创建响应中出现一次
      expect(typeof data.data.plainSecret).toBe("string");
      expect(data.data.plainSecret.length).toBeGreaterThan(20);
      // 安全响应中不含哈希/明文 secret
      expect(data.data.client).not.toHaveProperty("clientSecret");
      // 写入数据库的是哈希而非明文
      const createArg = prismaMock.oAuthClient.create.mock.calls[0][0] as {
        data: { clientSecret: string };
      };
      expect(createArg.data.clientSecret).not.toBe(data.data.plainSecret);
      expect(createArg.data.clientSecret).toBe(`hashed:${data.data.plainSecret}`);
      // SSO 审计事件同步记录
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: "status_change", success: true })
      );
    });

    it("私网 redirectUri（192.168.x.x）应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, redirectUris: ["https://192.168.1.10/callback"] },
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("localhost redirectUri 应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, redirectUris: ["https://localhost/callback"] },
        })
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("带 fragment 的 redirectUri 应返回 400（RFC 6749 §3.1.2）", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, redirectUris: ["https://app.example.com/callback#frag"] },
        })
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("http（非 https）redirectUri 应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, redirectUris: ["http://app.example.com/callback"] },
        })
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("scopes 含非白名单值应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, scopes: ["openid", "admin"] },
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });

    it("scopes 为空数组应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth-clients/route");
      const res = await POST(
        createRequest("/api/admin/oauth-clients", {
          method: "POST",
          body: { ...validBody, scopes: [] },
        })
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthClient.create).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // GET /api/admin/oauth-clients/[id]
  // ------------------------------------------

  describe("GET /api/admin/oauth-clients/[id]", () => {
    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue(NORMAL_ADMIN);
      const { GET } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await GET(createRequest("/api/admin/oauth-clients/client-db-id-1"), routeContext("client-db-id-1"));
      expect(res.status).toBe(403);
    });

    it("Client 不存在应返回 404", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(null);
      const { GET } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await GET(createRequest("/api/admin/oauth-clients/missing"), routeContext("missing"));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    });

    it("正常返回且不含 clientSecret", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(makeClientRecord());
      const { GET } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await GET(createRequest("/api/admin/oauth-clients/client-db-id-1"), routeContext("client-db-id-1"));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.data.client.clientId).toBe("abc123clientid");
      expect(data.data.client).not.toHaveProperty("clientSecret");
    });
  });

  // ------------------------------------------
  // PATCH /api/admin/oauth-clients/[id]
  // ------------------------------------------

  describe("PATCH /api/admin/oauth-clients/[id]", () => {
    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue(NORMAL_ADMIN);
      const { PATCH } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await PATCH(
        createRequest("/api/admin/oauth-clients/client-db-id-1", { method: "PATCH", body: { name: "X" } }),
        routeContext("client-db-id-1")
      );
      expect(res.status).toBe(403);
    });

    it("Client 不存在应返回 404", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(null);
      const { PATCH } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await PATCH(
        createRequest("/api/admin/oauth-clients/missing", { method: "PATCH", body: { name: "X" } }),
        routeContext("missing")
      );
      expect(res.status).toBe(404);
    });

    it("停用 Client 应级联撤销 OAuthSession 与 RefreshToken", async () => {
      const previous = makeClientRecord({ isActive: true });
      prismaMock.oAuthClient.findUnique.mockResolvedValue(previous);
      prismaMock.oAuthClient.update.mockResolvedValue(makeClientRecord({ isActive: false }));
      prismaMock.oAuthSession.findMany.mockResolvedValue([{ userId: "user-1" }]);

      const { PATCH } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await PATCH(
        createRequest("/api/admin/oauth-clients/client-db-id-1", {
          method: "PATCH",
          body: { isActive: false },
        }),
        routeContext("client-db-id-1")
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.client.isActive).toBe(false);
      // 级联撤销：session 与 refresh token 均在事务内标记 revokedAt
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: previous.clientId, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        })
      );
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: previous.clientId, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        })
      );
      // 通知受影响用户 Backchannel Logout
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith(
        "user-1",
        [previous.clientId],
        expect.objectContaining({ includeInactive: true })
      );
    });

    it("未变更 isActive 时不触发级联撤销", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(makeClientRecord({ isActive: true }));
      prismaMock.oAuthClient.update.mockResolvedValue(makeClientRecord({ isActive: true, name: "Renamed" }));

      const { PATCH } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await PATCH(
        createRequest("/api/admin/oauth-clients/client-db-id-1", {
          method: "PATCH",
          body: { name: "Renamed" },
        }),
        routeContext("client-db-id-1")
      );

      expect(res.status).toBe(200);
      expect(prismaMock.oAuthSession.updateMany).not.toHaveBeenCalled();
    });

    it("PATCH 更新 scopes 含非白名单值应返回 400", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(makeClientRecord());
      const { PATCH } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await PATCH(
        createRequest("/api/admin/oauth-clients/client-db-id-1", {
          method: "PATCH",
          body: { scopes: ["openid", "root"] },
        }),
        routeContext("client-db-id-1")
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthClient.update).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // DELETE /api/admin/oauth-clients/[id]
  // ------------------------------------------

  describe("DELETE /api/admin/oauth-clients/[id]", () => {
    it("CSRF 校验失败应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);
      const { DELETE } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth-clients/client-db-id-1", { method: "DELETE" }),
        routeContext("client-db-id-1")
      );
      expect(res.status).toBe(403);
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue(NORMAL_ADMIN);
      const { DELETE } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth-clients/client-db-id-1", { method: "DELETE" }),
        routeContext("client-db-id-1")
      );
      expect(res.status).toBe(403);
    });

    it("Client 不存在应返回 404", async () => {
      prismaMock.oAuthClient.findUnique.mockResolvedValue(null);
      const { DELETE } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth-clients/missing", { method: "DELETE" }),
        routeContext("missing")
      );
      expect(res.status).toBe(404);
    });

    it("删除成功：撤销会话、拉黑用户 token，且审计事件保留不被级联删除", async () => {
      const record = makeClientRecord();
      // 路由层 findUnique（无 select）与 lib 层 findUnique（带 select）均命中同一 mock
      prismaMock.oAuthClient.findUnique.mockResolvedValue(record);
      prismaMock.oAuthSession.findMany.mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]);
      prismaMock.oAuthClient.delete.mockResolvedValue(record);

      const { DELETE } = await import("@/app/api/admin/oauth-clients/[id]/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth-clients/client-db-id-1", { method: "DELETE" }),
        routeContext("client-db-id-1")
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // 活跃 session / refresh token 先被撤销
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: record.clientId, revokedAt: null } })
      );
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: record.clientId, revokedAt: null } })
      );
      // 受影响用户 token 拉黑 + Backchannel Logout
      expect(mockBlacklistUserTokens).toHaveBeenCalledWith("user-1", "oauth_client_deleted");
      expect(mockBlacklistUserTokens).toHaveBeenCalledWith("user-2", "oauth_client_deleted");
      expect(mockSendBackchannelLogout).toHaveBeenCalledTimes(2);

      // 关联数据级联清理
      expect(prismaMock.oAuthSession.deleteMany).toHaveBeenCalledWith({
        where: { clientId: record.clientId },
      });
      expect(prismaMock.userConsent.deleteMany).toHaveBeenCalledWith({
        where: { clientId: record.clientId },
      });
      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { clientId: record.clientId },
      });
      expect(prismaMock.oAuthAuthorizationCode.deleteMany).toHaveBeenCalledWith({
        where: { clientId: record.clientId },
      });
      expect(prismaMock.oAuthClient.delete).toHaveBeenCalledWith({ where: { id: record.id } });

      // 关键回归点：ssoAuditEvent 审计事件刻意保留，绝不被 deleteMany
      expect(prismaMock.ssoAuditEvent.deleteMany).not.toHaveBeenCalled();

      // 生命周期审计事件同步写入
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "status_change",
          clientId: record.clientId,
          detail: expect.objectContaining({ action: "client_deleted" }),
        })
      );
    });
  });
});
