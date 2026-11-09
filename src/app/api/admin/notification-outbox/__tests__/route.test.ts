import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notificationOutbox: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));
vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));
const { requeueMock, discardMock } = vi.hoisted(() => ({
  requeueMock: vi.fn(),
  discardMock: vi.fn(),
}));
vi.mock("@/lib/notification-outbox", () => ({
  requeueNotificationOutbox: (...args: unknown[]) => requeueMock(...args),
  discardNotificationOutbox: (...args: unknown[]) => discardMock(...args),
}));

import { verifyAuth } from "@/lib/auth";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { GET, POST } from "../route";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function request(method: "GET" | "POST", body?: unknown, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/admin/notification-outbox${query}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "content-type": "application/json" },
  } as never);
}

describe("admin notification outbox route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(beginAuditLog).mockResolvedValue("audit-1");
    vi.mocked(finishAuditLog).mockResolvedValue(true);
    prismaMock.notificationOutbox.findMany.mockResolvedValue([]);
    prismaMock.notificationOutbox.count.mockResolvedValue(0);
    prismaMock.notificationOutbox.groupBy.mockResolvedValue([]);
  });

  it("无权限返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...OWNER, role: "hr" } as never);
    const response = await GET(request("GET"));
    expect(response.status).toBe(403);
  });

  it("GET 返回脱敏收件人与状态统计", async () => {
    prismaMock.notificationOutbox.findMany.mockResolvedValue([
      {
        id: "outbox-1",
        idempotencyKey: "event:1",
        channel: "SMS",
        eventType: "spent_review_result",
        aggregateType: "spent_adjustment",
        aggregateId: "app-1",
        userId: "user-1",
        recipient: { phone: "13800138000" },
        templateKey: "spent_review_result",
        status: "DEAD",
        attempts: 6,
        maxAttempts: 6,
        nextAttemptAt: new Date("2026-11-09T00:00:00Z"),
        lastError: "gateway down",
        providerMessageId: null,
        sentAt: null,
        createdAt: new Date("2026-11-08T00:00:00Z"),
        updatedAt: new Date("2026-11-09T00:00:00Z"),
      },
    ]);
    prismaMock.notificationOutbox.count.mockResolvedValue(1);
    prismaMock.notificationOutbox.groupBy.mockResolvedValue([
      { status: "DEAD", _count: { _all: 1 } },
    ]);

    const response = await GET(request("GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0].recipient.phone).toBe("138****8000");
    expect(body.data.counts.DEAD).toBe(1);
  });

  it("POST retry 写审计并重新入队", async () => {
    prismaMock.notificationOutbox.findUnique.mockResolvedValue({
      id: "outbox-1",
      status: "DEAD",
      eventType: "spent_review_result",
      channel: "SMS",
    });
    requeueMock.mockResolvedValue(true);

    const response = await POST(request("POST", { id: "outbox-1", action: "retry" }));

    expect(response.status).toBe(200);
    expect(requeueMock).toHaveBeenCalledWith("outbox-1");
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", { action: "retry" });
  });

  it("POST 状态不允许时返回 409", async () => {
    prismaMock.notificationOutbox.findUnique.mockResolvedValue({
      id: "outbox-1",
      status: "SENT",
      eventType: "spent_review_result",
      channel: "SMS",
    });
    discardMock.mockResolvedValue(false);
    const response = await POST(request("POST", { id: "outbox-1", action: "discard" }));
    expect(response.status).toBe(409);
  });
});
