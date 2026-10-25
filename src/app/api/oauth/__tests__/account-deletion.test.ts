/**
 * OAuth AccountDeletion 端点单元测试
 * GET/POST/DELETE /api/oauth/account/deletion
 *
 * 覆盖：未认证 401 / 缺 scope 403（读需 profile、写需 profile:write）/
 * 查询透传（无申请 / 进行中）/ 提交成功（冷静期默认 7 天 + 手机号哈希不落明文）/
 * 提交频控 429 / 撤回成功 / 无进行中申请 409
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

// === Mock audit / auth-logger / auth-security ===
vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));
vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (s: string) => `hmac-${s}`,
}));
vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn().mockReturnValue(true),
  recordSmsCodeFailure: vi.fn(),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

// === Mock prisma ===
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  accountDeletionRequest: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  pointRedemption: { count: vi.fn() },
  pointBalance: { findUnique: vi.fn() },
  smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// === Mock OAuth CORS（避免测试依赖真实数据库查询 redirectUris）===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { GET, POST, DELETE } from "../account/deletion/route";
import { rateLimit } from "@/lib/ratelimit";

const mockRateLimit = vi.mocked(rateLimit);

function makeRequest(method: "GET" | "POST" | "DELETE", body?: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost/api/oauth/account/deletion"), {
    method,
    headers: {
      Authorization: "Bearer valid-token",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  } as never);
}

const activeUser = { id: "user-1", phone: "13800138000", status: "ACTIVE" };

const pendingRequest = {
  id: "req-1",
  userId: "user-1",
  status: "PENDING",
  requestedAt: new Date("2026-10-09T00:00:00Z"),
  scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
};

describe("/api/oauth/account/deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockRateLimit.mockResolvedValue({ success: true } as never);
    prismaMock.user.findUnique.mockResolvedValue(activeUser);
    prismaMock.accountDeletionRequest.findUnique.mockResolvedValue(null);
    prismaMock.accountDeletionRequest.create.mockResolvedValue(pendingRequest);
    prismaMock.pointRedemption.count.mockResolvedValue(0);
    prismaMock.pointBalance.findUnique.mockResolvedValue(null);
    prismaMock.smsCode.findFirst.mockResolvedValue({
      id: "sms-1",
      codeHash: "hash",
      attempts: 0,
    });
    prismaMock.smsCode.updateMany.mockResolvedValue({ count: 1 });
  });

  it("缺少 Authorization 返回 401", async () => {
    const req = new NextRequest(new URL("http://localhost/api/oauth/account/deletion"));
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it("GET scope 不含 profile 返回 403 insufficient_scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid",
    });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("GET 无进行中申请返回 request: null", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile",
    });
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.request).toBeNull();
  });

  it("GET 返回进行中申请（含剩余天数）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile",
    });
    prismaMock.accountDeletionRequest.findUnique.mockResolvedValue(pendingRequest);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.request.status).toBe("PENDING");
    expect(body.data.request.remainingDays).toBeGreaterThan(0);
  });

  it("POST scope 不含 profile:write 返回 403", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile",
    });
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("POST 提交成功：冷静期默认 7 天，手机号哈希落库且不落明文", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile profile:write",
    });
    const before = Date.now();
    const res = await POST(makeRequest("POST", { reason: "不再需要", smsCode: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.request.status).toBe("PENDING");

    const createArgs = prismaMock.accountDeletionRequest.create.mock.calls[0][0];
    const scheduledAt = createArgs.data.scheduledAt as Date;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(scheduledAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays + 1000);
    expect(createArgs.data.phoneHash).toBe("hmac-13800138000");
    expect(JSON.stringify(createArgs.data)).not.toContain('"13800138000"');

    // 频控与主站共享桶
    expect(mockRateLimit).toHaveBeenCalledWith("user:user-1", "account-deletion");
  });

  it("POST 触发频控返回 429", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile profile:write",
    });
    mockRateLimit.mockResolvedValueOnce({ success: false } as never);
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(429);
    expect(prismaMock.accountDeletionRequest.create).not.toHaveBeenCalled();
  });

  it("DELETE 撤回成功", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile profile:write",
    });
    prismaMock.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockRateLimit).toHaveBeenCalledWith("user:user-1", "account-deletion-cancel");
    expect(prismaMock.accountDeletionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "PENDING" },
      })
    );
  });

  it("DELETE 无进行中申请返回 409", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile profile:write",
    });
    prismaMock.accountDeletionRequest.updateMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NO_PENDING_REQUEST");
  });
});
