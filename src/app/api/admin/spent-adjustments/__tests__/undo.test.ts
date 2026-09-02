/**
 * 撤销消费补录审核 API 测试（管理端）
 * POST /api/admin/spent-adjustments/[id]/undo - 权限、CSRF、撤销结果映射
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    new Response(JSON.stringify({ success: false, error: { code: "CSRF_INVALID" } }), {
      status: 403,
    }),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: () =>
    new Response(JSON.stringify({ success: false, error: { code: "INVALID_ID" } }), {
      status: 400,
    }),
}));

vi.mock("@/lib/spent-adjustments", () => ({
  undoApplication: vi.fn(),
  SPENT_STATUS_LABELS: {
    PENDING: "待审核",
    APPROVED: "已通过",
    REJECTED: "已驳回",
  },
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken } from "@/lib/csrf";
import { undoApplication } from "@/lib/spent-adjustments";
import { createAuditLog } from "@/lib/audit";
import { POST } from "@/app/api/admin/spent-adjustments/[id]/undo/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockUndo = undoApplication as ReturnType<typeof vi.fn>;

function createRequest(): NextRequest {
  return new NextRequest(
    new URL("/api/admin/spent-adjustments/app-1/undo", "http://localhost:3000"),
    { method: "POST" } as never
  );
}

describe("POST /api/admin/spent-adjustments/[id]/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockValidateCSRF.mockReturnValue(true);
    mockUndo.mockResolvedValue({ ok: true, status: "PENDING" });
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await POST(createRequest(), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(401);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it("CSRF 校验失败返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);

    const res = await POST(createRequest(), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(403);
  });

  it("撤销成功：写 undo 审计日志", async () => {
    const res = await POST(createRequest(), { params: Promise.resolve({ id: "app-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUndo).toHaveBeenCalledWith({
      applicationId: "app-1",
      adminId: "admin-1",
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "undo_spent_adjustment",
        targetType: "spent_adjustment",
        targetId: "app-1",
      })
    );
    expect(checkAdminRateLimit).toHaveBeenCalled();
  });

  it("非已通过状态（NOT_APPROVED）返回 409", async () => {
    mockUndo.mockResolvedValue({
      ok: false,
      code: "NOT_APPROVED",
      message: "仅已通过的申请可撤销审核",
    });

    const res = await POST(createRequest(), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(409);
  });

  it("申请不存在返回 404", async () => {
    mockUndo.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "申请不存在",
    });

    const res = await POST(createRequest(), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(404);
  });
});
