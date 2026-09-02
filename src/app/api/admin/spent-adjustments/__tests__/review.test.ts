/**
 * 消费补录审核 API 测试（管理端）
 * POST /api/admin/spent-adjustments/[id]/review - 权限、CSRF、参数校验、审核结果映射
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
  reviewApplication: vi.fn(),
  MAX_REVIEW_AMOUNT: 1_000_000,
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
import { reviewApplication } from "@/lib/spent-adjustments";
import { createAuditLog } from "@/lib/audit";
import { POST } from "@/app/api/admin/spent-adjustments/[id]/review/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockReview = reviewApplication as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL("/api/admin/spent-adjustments/app-1/review", "http://localhost:3000"),
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    } as never
  );
}

describe("POST /api/admin/spent-adjustments/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockValidateCSRF.mockReturnValue(true);
    mockReview.mockResolvedValue({ ok: true, status: "APPROVED" });
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await POST(
      createRequest({ decision: "approve", reviewAmount: 1000 }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("CSRF 校验失败返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);

    const res = await POST(
      createRequest({ decision: "approve", reviewAmount: 1000 }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("通过审核：调用 reviewApplication 并写审计日志", async () => {
    const res = await POST(
      createRequest({ decision: "approve", reviewAmount: 1280, reviewNote: "已核实" }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockReview).toHaveBeenCalledWith({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-1",
      reviewAmount: 1280,
      reviewNote: "已核实",
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approve_spent_adjustment",
        targetType: "spent_adjustment",
        targetId: "app-1",
      })
    );
    expect(checkAdminRateLimit).toHaveBeenCalled();
  });

  it("通过但未填核实金额返回 400", async () => {
    const res = await POST(
      createRequest({ decision: "approve" }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("驳回但未填原因返回 400", async () => {
    const res = await POST(
      createRequest({ decision: "reject", reviewNote: " " }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("驳回审核：写 reject 审计日志", async () => {
    mockReview.mockResolvedValue({ ok: true, status: "REJECTED" });

    const res = await POST(
      createRequest({ decision: "reject", reviewNote: "订单号无法核实" }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject_spent_adjustment" })
    );
  });

  it("已被处理（ALREADY_REVIEWED）返回 409", async () => {
    mockReview.mockResolvedValue({
      ok: false,
      code: "ALREADY_REVIEWED",
      message: "该申请已处理",
    });

    const res = await POST(
      createRequest({ decision: "approve", reviewAmount: 100 }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(409);
  });
});
