/**
 * 通知失败队列路由测试
 * GET/POST /api/admin/webhook-failures
 *
 * 覆盖：
 * - 非 owner 403
 * - GET：展示信息（用户手机号脱敏、client 名称）与分页
 * - POST：重投成功/失败写审计 webhook_failure_retry；丢弃不存在记录 404
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    webhookDeliveryFailure: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    backchannelLogoutFailure: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    oAuthClient: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/profile-webhook", () => ({
  retryWebhookFailureById: vi.fn(),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  retryBackchannelFailureById: vi.fn(),
}));

import { GET, POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { retryWebhookFailureById } from "@/lib/profile-webhook";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest(method: "GET" | "POST", body?: unknown, query = "") {
  return new NextRequest(`http://localhost/api/admin/webhook-failures${query}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("GET /api/admin/webhook-failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.webhookDeliveryFailure.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.webhookDeliveryFailure.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.backchannelLogoutFailure.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("返回脱敏用户信息与 client 名称", async () => {
    (prisma.webhookDeliveryFailure.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "wf-1",
        userId: "user-1",
        clientId: "client-a",
        attempts: 2,
        nextRetryAt: new Date("2026-09-17T10:00:00Z"),
        createdAt: new Date("2026-09-17T09:00:00Z"),
        payload: { profile: { nickname: "小美" } },
      },
    ]);
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "user-1", phone: "13800000000", nickname: "小美" },
    ]);
    (prisma.oAuthClient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { clientId: "client-a", name: "商城" },
    ]);

    const res = await GET(createRequest("GET"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.items[0].userPhone).toBe("138****0000");
    expect(data.data.items[0].clientName).toBe("商城");
    expect(data.data.counts).toEqual({ webhook: 1, backchannel: 2 });
  });
});

describe("POST /api/admin/webhook-failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await POST(
      createRequest("POST", { kind: "webhook", id: "clx0000000000000000000001", action: "retry" })
    );
    expect(res.status).toBe(403);
  });

  it("重投成功写审计 webhook_failure_retry", async () => {
    vi.mocked(retryWebhookFailureById).mockResolvedValue({ ok: true, status: "delivered" });

    const res = await POST(
      createRequest("POST", { kind: "webhook", id: "clx0000000000000000000001", action: "retry" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.status).toBe("delivered");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook_failure_retry", targetType: "system" })
    );
  });

  it("丢弃不存在的记录返回 404", async () => {
    (prisma.webhookDeliveryFailure.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    const res = await POST(
      createRequest("POST", { kind: "webhook", id: "clx0000000000000000000001", action: "delete" })
    );
    expect(res.status).toBe(404);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
