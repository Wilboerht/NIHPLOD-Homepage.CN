/**
 * 代客提交消费补录 API 测试（管理端）
 * POST /api/admin/spent-adjustments - 权限、CSRF、参数校验、目标用户校验与结果映射
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
  default: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/spent-adjustment-applications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spent-adjustment-applications")>();
  return {
    ...actual,
    createSpentApplication: vi.fn(),
  };
});

vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { createSpentApplication } from "@/lib/spent-adjustment-applications";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { POST } from "@/app/api/admin/spent-adjustments/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockCreate = createSpentApplication as ReturnType<typeof vi.fn>;
const mockBeginAudit = beginAuditLog as ReturnType<typeof vi.fn>;

const USER_ID = "cjld2cjxh0000qzrmn831i7rn";

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/admin/spent-adjustments", "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  } as never);
}

const validBody = {
  userId: USER_ID,
  channel: "TMALL",
  orderNo: "TM2026001",
  amountClaimed: 1280,
};

describe("POST /api/admin/spent-adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({
      id: "admin-1",
      role: "support",
      name: "客服A",
      email: "support@example.com",
    });
    mockValidateCSRF.mockReturnValue(true);
    mockFindUser.mockResolvedValue({ status: "ACTIVE" });
    mockBeginAudit.mockResolvedValue("audit-1");
    mockCreate.mockResolvedValue({
      ok: true,
      application: { id: "app-1", status: "PENDING", statusLabel: "待审核" },
      idempotent: false,
    });
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("无 spent:create 权限返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "admin-2", role: "finance" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("CSRF 校验失败返回 403", async () => {
    mockValidateCSRF.mockReturnValue(false);

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("用户 ID 非法返回 400", async () => {
    const res = await POST(createRequest({ ...validBody, userId: "not-a-cuid" }));

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("缺少订单号返回 400", async () => {
    const res = await POST(createRequest({ ...validBody, orderNo: "" }));

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("目标用户不存在返回 404", async () => {
    mockFindUser.mockResolvedValue(null);

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("目标用户非正常状态返回 409", async () => {
    mockFindUser.mockResolvedValue({ status: "SUSPENDED" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("客服代客提交成功并记录管理员操作者（无审核权限也可提交）", async () => {
    const res = await POST(createRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.application).toEqual({
      id: "app-1",
      status: "PENDING",
      statusLabel: "待审核",
    });
    expect(mockBeginAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_create_spent_adjustment",
        targetType: "spent_adjustment",
        detail: expect.objectContaining({ targetUserId: USER_ID }),
        adminId: "admin-1",
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        skipAudit: true,
        actor: {
          adminId: "admin-1",
          adminName: "客服A",
          adminEmail: "support@example.com",
          adminRole: "support",
        },
        input: expect.objectContaining({
          channel: "TMALL",
          orderNo: "TM2026001",
          amountClaimed: 1280,
        }),
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.anything(), "app-1");
    expect(checkAdminRateLimit).toHaveBeenCalled();
  });

  it("审计预写失败时返回 503，且不创建申请", async () => {
    mockBeginAudit.mockResolvedValueOnce(null);

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("同一订单重复提交返回 409", async () => {
    mockCreate.mockResolvedValue({ ok: false, kind: "duplicate" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("ORDER_NO_DUPLICATE");
  });

  it("订单号已成功导入返回 409 ORDER_ALREADY_IMPORTED", async () => {
    mockCreate.mockResolvedValue({ ok: false, kind: "order_imported" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("ORDER_ALREADY_IMPORTED");
  });

  it("订单号已被其他来源占用返回 409 ORDER_CONFLICT", async () => {
    mockCreate.mockResolvedValue({ ok: false, kind: "order_claimed" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error.code).toBe("ORDER_CONFLICT");
  });

  it("目标用户待审核数量达到上限返回 400", async () => {
    mockCreate.mockResolvedValue({ ok: false, kind: "pending_limit" });

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("PENDING_LIMIT");
  });
});
