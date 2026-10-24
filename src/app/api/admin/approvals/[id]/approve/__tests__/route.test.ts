import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockHasPermission,
  mockApprove,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockCheckAdminRateLimit: vi.fn(),
  mockValidateCSRFToken: vi.fn(),
  mockHasPermission: vi.fn(),
  mockApprove: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  checkAdminRateLimit: (...args: unknown[]) => mockCheckAdminRateLimit(...args),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

vi.mock("@/lib/admin-approval", () => ({
  approveApprovalRequest: (...args: unknown[]) => mockApprove(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

const OWNER = { id: "owner-1", email: "owner@test.com", name: "Owner", role: "owner" };
const REQUESTER = { id: "admin-1", email: "ops@test.com", name: "Ops", role: "ops" };

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/approvals/a1/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("POST /api/admin/approvals/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
    mockApprove.mockResolvedValue({ request: { id: "a1" }, execution: null });
  });

  it("非 owner 返回 403", async () => {
    mockVerifyAuth.mockResolvedValue(REQUESTER);
    const res = await POST(createRequest({ totpCode: "123456" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(403);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("缺少 TOTP 返回 400", async () => {
    const res = await POST(createRequest({}), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(400);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("合法审批调用服务并返回 200", async () => {
    const res = await POST(createRequest({ totpCode: "123456", note: "ok" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(200);
    expect(mockApprove).toHaveBeenCalledWith({
      admin: OWNER,
      id: "a1",
      totpCode: "123456",
      note: "ok",
    });
  });
});
