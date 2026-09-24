/**
 * OAuth SpentAdjustments 端点单元测试
 * GET/POST /api/oauth/spent-adjustments
 *
 * 覆盖：未认证 401 / 缺 scope 403 / 列表透传 / 提交成功 /
 * 待审上限 400 / 订单号重复 409 / 账户禁用 403
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock token-blacklist ===
const mockIsBlacklisted = vi.fn();
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

// === Mock jwt（verifyOAuthAccessToken）===
const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

// === Mock sso-audit ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock audit ===
vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

// === Mock prisma ===
const prismaMock = vi.hoisted(() => {
  const m = {
    user: { findUnique: vi.fn() },
    spentAdjustmentApplication: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(m)),
  };
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// === Mock OAuth CORS（避免测试依赖真实数据库查询 redirectUris）===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { GET, POST } from "../spent-adjustments/route";

function makeRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost/api/oauth/spent-adjustments"), {
    method,
    headers: {
      Authorization: "Bearer valid-token",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  } as never);
}

describe("/api/oauth/spent-adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it("缺少 Authorization header 返回 401", async () => {
    const req = new NextRequest(new URL("http://localhost/api/oauth/spent-adjustments"));
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it("scope 不含 membership 返回 403 insufficient_scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid profile",
    });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("账户非 ACTIVE 返回 403 account_disabled", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "FROZEN" });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });

  it("GET 返回当前用户申请列表", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prismaMock.spentAdjustmentApplication.findMany.mockResolvedValue([
      { id: "app-1", channel: "TMALL", orderNo: "ORDER123", status: "PENDING" },
    ]);

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.applications).toHaveLength(1);
  });

  it("POST 提交成功（事务内待审上限校验 + 审计）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prismaMock.spentAdjustmentApplication.count.mockResolvedValue(0);
    prismaMock.spentAdjustmentApplication.create.mockResolvedValue({
      id: "app-new",
      status: "PENDING",
    });

    const res = await POST(makeRequest("POST", { channel: "TMALL", orderNo: "ORDER123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.application.id).toBe("app-new");
    expect(body.data.application.statusLabel).toBe("待审核");
  });

  it("POST 待审达到上限返回 400 PENDING_LIMIT", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prismaMock.spentAdjustmentApplication.count.mockResolvedValue(2);

    const res = await POST(makeRequest("POST", { channel: "DOUYIN", orderNo: "DY001" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("PENDING_LIMIT");
  });

  it("POST 订单号重复（P2002）返回 409", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prismaMock.spentAdjustmentApplication.count.mockResolvedValue(0);
    prismaMock.spentAdjustmentApplication.create.mockRejectedValue({ code: "P2002" });

    const res = await POST(makeRequest("POST", { channel: "TMALL", orderNo: "ORDER123" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ORDER_NO_DUPLICATE");
  });

  it("POST 参数非法返回 400", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE" });

    const res = await POST(makeRequest("POST", { channel: "TAOBAO", orderNo: "X" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_PARAMS");
  });
});
