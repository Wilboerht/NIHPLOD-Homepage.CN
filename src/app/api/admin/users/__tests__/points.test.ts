/**
 * 管理端用户积分路由测试
 * GET/POST /api/admin/users/[id]/points
 *
 * 覆盖：
 * - 未授权 401 / 非 owner 调整 403
 * - 参数校验（金额为 0、缺少原因）
 * - owner 调整成功：调用 adjustPoints 并写审计 user_points_adjust
 * - 幂等重复：不重复写审计
 * - GET 返回余额与流水分页（任意管理员可读）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const txMock = {
  pointLedger: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  pointBalance: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)),
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

// 资金类操作二次验证（本测试聚焦积分调整逻辑，TOTP 视为通过）
vi.mock("@/lib/admin-totp", () => ({
  requireMoneyOperationTotp: vi.fn().mockResolvedValue(null),
  isMoneyOperationTotpEnforced: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: () =>
    NextResponse.json({ success: false, error: { code: "INVALID_ID" } }, { status: 400 }),
}));

vi.mock("@/lib/points-ledger", () => ({
  adjustPoints: vi.fn().mockResolvedValue({ duplicated: false }),
  getPointBalanceView: vi.fn().mockResolvedValue({ available: 120, frozen: 0, nextReleaseAt: null }),
}));

import { GET, POST } from "../[id]/points/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { adjustPoints } from "@/lib/points-ledger";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("http://localhost/api/admin/users/user-1/points", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  } as never);
}

const context = { params: Promise.resolve({ id: "user-1" }) };

describe("GET /api/admin/users/[id]/points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1" });
    txMock.pointLedger.findMany.mockResolvedValue([]);
    txMock.pointLedger.count.mockResolvedValue(0);
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null);
    const res = await GET(createRequest("GET"), context);
    expect(res.status).toBe(401);
  });

  it("用户不存在返回 404", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(createRequest("GET"), context);
    expect(res.status).toBe(404);
  });

  it("返回余额与流水分页", async () => {
    txMock.pointLedger.findMany.mockResolvedValue([
      {
        id: "l1",
        type: "ADJUST",
        amount: 100,
        remaining: 100,
        note: "补偿",
        expiresAt: new Date("2027-03-01T00:00:00Z"),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
    txMock.pointLedger.count.mockResolvedValue(1);

    const res = await GET(createRequest("GET"), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.available).toBe(120);
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0].type).toBe("ADJUST");
    expect(data.data.pagination.total).toBe(1);
  });
});

describe("POST /api/admin/users/[id]/points（人工调整）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1" });
    txMock.pointBalance.findUnique.mockResolvedValue({ available: 150 });
    vi.mocked(adjustPoints).mockResolvedValue({ duplicated: false });
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await POST(createRequest("POST", { amount: 10, note: "测试" }), context);
    expect(res.status).toBe(403);
    expect(adjustPoints).not.toHaveBeenCalled();
  });

  it("金额为 0 或缺少原因返回 400", async () => {
    let res = await POST(createRequest("POST", { amount: 0, note: "测试" }), context);
    expect(res.status).toBe(400);

    res = await POST(createRequest("POST", { amount: 10, note: "" }), context);
    expect(res.status).toBe(400);
  });

  it("owner 调整成功并写审计", async () => {
    const res = await POST(createRequest("POST", { amount: 50, note: "客服补偿" }), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.available).toBe(150);
    expect(adjustPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user-1", amount: 50, note: "客服补偿" })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_points_adjust",
        targetType: "user",
        targetId: "user-1",
      })
    );
  });

  it("幂等重复（duplicated）不重复写审计", async () => {
    vi.mocked(adjustPoints).mockResolvedValue({ duplicated: true });

    const res = await POST(
      createRequest("POST", { amount: 50, note: "客服补偿", requestId: "req-1" }),
      context
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.duplicated).toBe(true);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
