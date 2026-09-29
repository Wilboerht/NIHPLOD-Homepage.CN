/**
 * 管理端注销申请 API 测试
 * GET  /api/admin/account-deletions - 鉴权 401/403、默认 FAILED 筛选、status 透传、手机号脱敏
 * POST /api/admin/account-deletions - 鉴权 401/403、404、非 FAILED 409、
 *       重试成功/失败路径、审计写入
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    accountDeletionRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/account-deletion", () => ({
  executeAccountDeletion: vi.fn(),
  DELETION_STATUS: {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET, POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { executeAccountDeletion } from "@/lib/account-deletion";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
// support：有 users:read（GET 可用），无 users:security:write（POST 应 403）
const SUPPORT = { id: "admin-2", email: "support@test.com", name: "Support", role: "support" };
// hr：无 users:read（GET 应 403）
const HR = { id: "admin-3", email: "hr@test.com", name: "HR", role: "hr" };

const mockFindMany = prisma.accountDeletionRequest.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.accountDeletionRequest.count as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.accountDeletionRequest.findUnique as ReturnType<typeof vi.fn>;
const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/account-deletions${query}`, {
    method: "GET",
  } as never);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/account-deletions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const failedItem = {
  id: "clx1234567890abcdefghijk", // CUID2 格式（24 位）
  userId: "user-1",
  status: "FAILED",
  reason: null,
  requestedAt: new Date("2026-09-22T00:00:00Z"),
  scheduledAt: new Date("2026-09-29T00:00:00Z"),
  cancelledAt: null,
  completedAt: null,
  attempts: 5,
  lastError: "advisor_purge_failed:UPSTREAM_ERROR:子站服务连接失败",
};

describe("GET /api/admin/account-deletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([]);
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null as never);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("无 users:read 权限（hr 角色）返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(HR as never);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("默认按 FAILED 筛选", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "FAILED" } })
    );
  });

  it("status 查询参数透传", async () => {
    const res = await GET(getRequest("?status=PENDING"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING" } })
    );
  });

  it("support 角色可读列表，手机号脱敏返回", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(SUPPORT as never);
    mockFindMany.mockResolvedValue([failedItem]);
    mockCount.mockResolvedValue(1);
    mockUserFindMany.mockResolvedValue([
      { id: "user-1", phone: "13800138000", nickname: "测试", status: "ACTIVE" },
    ]);

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].userPhone).toBe("138****8000");
    expect(JSON.stringify(body)).not.toContain("13800138000");
    expect(body.data.items[0].attempts).toBe(5);
    expect(body.data.pagination.total).toBe(1);
  });
});

describe("POST /api/admin/account-deletions（人工重试）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockFindUnique.mockResolvedValue({
      id: failedItem.id,
      userId: "user-1",
      status: "FAILED",
      attempts: 5,
    });
    vi.mocked(executeAccountDeletion).mockResolvedValue("completed");
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null as never);
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(401);
  });

  it("无 users:security:write 权限（support 角色）返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(SUPPORT as never);
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(403);
    expect(executeAccountDeletion).not.toHaveBeenCalled();
  });

  it("申请不存在返回 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(404);
  });

  it("非 FAILED 状态返回 409（不触发执行）", async () => {
    mockFindUnique.mockResolvedValue({
      id: failedItem.id,
      userId: "user-1",
      status: "PENDING",
      attempts: 0,
    });
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("RETRY_NOT_ALLOWED");
    expect(executeAccountDeletion).not.toHaveBeenCalled();
  });

  it("重试成功：同步执行 + 写审计（含 adminId，不落明文手机号）", async () => {
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("completed");

    expect(executeAccountDeletion).toHaveBeenCalledWith(failedItem.id);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account_deletion_retry",
        targetType: "user",
        targetId: "user-1",
        adminId: "admin-1",
        detail: expect.objectContaining({ requestId: failedItem.id, result: "completed" }),
      })
    );
  });

  it("重试仍失败：返回 failed 状态与提示文案", async () => {
    vi.mocked(executeAccountDeletion).mockResolvedValue("failed");
    const res = await POST(postRequest({ id: failedItem.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("failed");
    expect(body.data.message).toContain("失败");
  });
});
