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

vi.mock("@/lib/validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validation")>();
  return {
    ...actual,
    validateCUID: vi.fn().mockReturnValue(true),
    invalidIdResponse: () =>
      new Response(JSON.stringify({ success: false, error: { code: "INVALID_ID" } }), {
        status: 400,
      }),
  };
});

vi.mock("@/lib/spent-adjustments", () => ({
  reviewApplication: vi.fn(),
  MAX_REVIEW_AMOUNT: 1_000_000,
  SPENT_STATUS_LABELS: {
    PENDING: "待审核",
    APPROVED: "已通过",
    REJECTED: "已驳回",
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    spentAdjustmentApplication: {
      findUnique: vi.fn().mockResolvedValue({ amountClaimed: 1000, createdByAdminId: null }),
    },
  },
  default: {
    spentAdjustmentApplication: {
      findUnique: vi.fn().mockResolvedValue({ amountClaimed: 1000, createdByAdminId: null }),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

// 资金类操作二次验证（本测试聚焦审核逻辑，TOTP 视为通过）
vi.mock("@/lib/admin-totp", () => ({
  requireMoneyOperationTotp: vi.fn().mockResolvedValue(null),
  isMoneyOperationTotpEnforced: vi.fn().mockReturnValue(true),
}));

import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken } from "@/lib/csrf";
import { reviewApplication } from "@/lib/spent-adjustments";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/admin/spent-adjustments/[id]/review/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockReview = reviewApplication as ReturnType<typeof vi.fn>;
const mockFindApplication = prisma.spentAdjustmentApplication.findUnique as ReturnType<
  typeof vi.fn
>;

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
    mockFindApplication.mockResolvedValue({ amountClaimed: 1000, createdByAdminId: null });
  });

  it("非 owner 审核自己提交的补录返回 403，不调用审核服务", async () => {
    mockFindApplication.mockResolvedValue({ amountClaimed: 1000, createdByAdminId: "admin-1" });

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 1000 }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe("SELF_REVIEW_FORBIDDEN");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("owner 审核自己提交的补录允许通过，并传递 allowSelfReview", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "owner-1", role: "owner" });
    mockFindApplication.mockResolvedValue({ amountClaimed: 1000, createdByAdminId: "owner-1" });

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 1000 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockReview).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: "owner-1", allowSelfReview: true })
    );
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 1000 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("CSRF 校验失败返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 1000 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

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
      allowSelfReview: false,
    });
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approve_spent_adjustment",
        targetType: "spent_adjustment",
        targetId: "app-1",
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.anything());
    expect(checkAdminRateLimit).toHaveBeenCalled();
  });

  it("审计预写失败时返回 503，且不执行业务审核", async () => {
    vi.mocked(beginAuditLog).mockResolvedValueOnce(null);

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 100 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(503);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("通过但未填核实金额返回 400", async () => {
    const res = await POST(createRequest({ decision: "approve" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("驳回但未填原因返回 400", async () => {
    const res = await POST(createRequest({ decision: "reject", reviewNote: " " }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(400);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("驳回审核：写 reject 审计日志", async () => {
    mockReview.mockResolvedValue({ ok: true, status: "REJECTED" });

    const res = await POST(createRequest({ decision: "reject", reviewNote: "订单号无法核实" }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(200);
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject_spent_adjustment" })
    );
  });

  it("用户状态不可入账（USER_INACTIVE）返回 409", async () => {
    mockReview.mockResolvedValue({
      ok: false,
      code: "USER_INACTIVE",
      message: "用户当前状态不可入账",
    });

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 100 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(409);
  });

  it("已被处理（ALREADY_REVIEWED）返回 409", async () => {
    mockReview.mockResolvedValue({
      ok: false,
      code: "ALREADY_REVIEWED",
      message: "该申请已处理",
    });

    const res = await POST(createRequest({ decision: "approve", reviewAmount: 100 }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(res.status).toBe(409);
  });
});
