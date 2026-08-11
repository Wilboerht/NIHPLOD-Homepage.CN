/**
 * OAuth Client 密钥轮换路由测试
 * POST /api/admin/oauth-clients/[id]/rotate-secret
 *
 * 覆盖：
 * - CSRF 403 / 未认证 401 / 非 owner 403 / 缺少 confirm 400 / Client 不存在 404
 * - 成功轮换：返回一次性明文 secret、数据库写入新哈希、审计事件记录
 * - 旧 secret 5 分钟过渡期内仍可通过 verifyOAuthClientSecret 校验（lib 真实缓存联动）
 * - 未缓存的旧 secret 在轮换后立即失效
 *
 * 注意：@/lib/oauth-client 使用真实实现，cacheOldSecret / verifyOAuthClientSecret
 * 的过渡期缓存逻辑真实执行；bcryptjs 以可逆伪哈希 mock 以加速测试。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock
// ============================================

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockRecordSsoEvent,
  mockCreateAuditLog,
  prismaMock,
} = vi.hoisted(() => {
  const createMockModel = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  });
  return {
    mockVerifyAuth: vi.fn(),
    mockCheckAdminRateLimit: vi.fn(),
    mockValidateCSRFToken: vi.fn(),
    mockRecordSsoEvent: vi.fn(),
    mockCreateAuditLog: vi.fn(),
    prismaMock: {
      oAuthClient: createMockModel(),
      oAuthSession: createMockModel(),
    } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
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
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 30 }),
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

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
  isBlockedHostname: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: (id: string) => typeof id === "string" && id.length > 0,
  invalidIdResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
      { status: 400 }
    ),
}));

// bcryptjs：可逆伪哈希（hash: `hashed:${s}`，compare: 前缀比对），避免 cost 12 拖慢测试
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

function createRequest(body?: unknown) {
  const url = new URL("/api/admin/oauth-clients/client-db-id-1/rotate-secret", "http://localhost:3000");
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as never);
}

const OWNER = { id: "admin-owner-1", email: "owner@test.com", name: "Owner", role: "owner" };

function makeClientRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-db-id-1",
    clientId: "rotate-client-id",
    clientSecret: "hashed:old-plain-secret",
    name: "Rotate App",
    redirectUris: ["https://app.example.com/callback"],
    postLogoutRedirectUris: [],
    scopes: ["openid"],
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

describe("POST /api/admin/oauth-clients/[id]/rotate-secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockRecordSsoEvent.mockResolvedValue(undefined);
    mockCreateAuditLog.mockResolvedValue(true);
  });

  it("CSRF 校验失败应返回 403", async () => {
    mockValidateCSRFToken.mockReturnValue(false);
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("client-db-id-1"));
    expect(res.status).toBe(403);
  });

  it("未认证应返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("client-db-id-1"));
    expect(res.status).toBe(401);
  });

  it("非 owner 角色应返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "admin-2", email: "a@t.com", name: "A", role: "admin" });
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("client-db-id-1"));
    expect(res.status).toBe(403);
    expect(prismaMock.oAuthClient.update).not.toHaveBeenCalled();
  });

  it("缺少 confirm:true 二次确认应返回 400", async () => {
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({}), routeContext("client-db-id-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    expect(prismaMock.oAuthClient.findUnique).not.toHaveBeenCalled();
  });

  it("confirm 为 false 应返回 400", async () => {
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: false }), routeContext("client-db-id-1"));
    expect(res.status).toBe(400);
  });

  it("Client 不存在应返回 404", async () => {
    prismaMock.oAuthClient.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("missing-id"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("成功轮换：返回一次性明文 secret，数据库写入新哈希，审计同步记录", async () => {
    prismaMock.oAuthClient.findUnique.mockResolvedValue(makeClientRecord());
    prismaMock.oAuthClient.update.mockResolvedValue(makeClientRecord());

    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("client-db-id-1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 明文 secret 仅在轮换响应中出现一次（64 字节 base64url ≈ 86 字符）
    expect(typeof data.data.plainSecret).toBe("string");
    expect(data.data.plainSecret.length).toBeGreaterThan(60);

    // 数据库写入的是新 secret 的哈希，而非明文，也不等于旧哈希
    expect(prismaMock.oAuthClient.update).toHaveBeenCalledWith({
      where: { id: "client-db-id-1" },
      data: { clientSecret: `hashed:${data.data.plainSecret}` },
    });

    // SSO 审计事件 + 操作审计日志
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "status_change",
        clientId: "rotate-client-id",
        detail: expect.objectContaining({ action: "client_secret_rotated" }),
      })
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "oauth_client_rotate_secret" })
    );
  });

  it("轮换后旧 secret 在 5 分钟过渡期内仍可通过 verifyOAuthClientSecret 校验", async () => {
    const oldRecord = makeClientRecord({
      clientId: "rotate-transition-client",
      clientSecret: "hashed:transition-old-secret",
    });
    prismaMock.oAuthClient.findUnique.mockResolvedValue(oldRecord);
    prismaMock.oAuthClient.update.mockResolvedValue(oldRecord);

    const { POST } = await import("@/app/api/admin/oauth-clients/[id]/rotate-secret/route");
    const res = await POST(createRequest({ confirm: true }), routeContext("client-db-id-1"));
    const data = await res.json();
    expect(res.status).toBe(200);

    // 模拟轮换后的数据库状态：clientSecret 已是新哈希
    prismaMock.oAuthClient.findFirst.mockResolvedValue(
      makeClientRecord({
        clientId: "rotate-transition-client",
        clientSecret: `hashed:${data.data.plainSecret}`,
      })
    );

    // lib 层真实校验：当前哈希不匹配 → 回退到过渡期缓存的旧哈希 → 通过
    const { verifyOAuthClientSecret } = await import("@/lib/oauth-client");
    const result = await verifyOAuthClientSecret("rotate-transition-client", "transition-old-secret");
    expect(result.reason).toBe("ok");
    expect(result.client?.clientId).toBe("rotate-transition-client");

    // 新 secret 当然也可用
    const newResult = await verifyOAuthClientSecret("rotate-transition-client", data.data.plainSecret);
    expect(newResult.reason).toBe("ok");
  });

  it("未被缓存的旧 secret 在轮换后立即失效（invalid_secret）", async () => {
    // 数据库已是新哈希，且该 client 未走过 rotate-secret（缓存中无旧哈希）
    prismaMock.oAuthClient.findFirst.mockResolvedValue(
      makeClientRecord({
        clientId: "rotate-no-cache-client",
        clientSecret: "hashed:brand-new-secret",
      })
    );

    const { verifyOAuthClientSecret } = await import("@/lib/oauth-client");
    const result = await verifyOAuthClientSecret("rotate-no-cache-client", "stale-old-secret");
    expect(result.reason).toBe("invalid_secret");
    expect(result.client).toBeNull();
  });
});
