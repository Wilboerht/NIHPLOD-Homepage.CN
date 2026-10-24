import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockHasPermission,
  mockRetry,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockCheckAdminRateLimit: vi.fn(),
  mockValidateCSRFToken: vi.fn(),
  mockHasPermission: vi.fn(),
  mockRetry: vi.fn(),
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
  retryApprovalRequest: (...args: unknown[]) => mockRetry(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

const OWNER = {
  id: "owner-1",
  email: "owner@test.com",
  name: "Owner",
  role: "owner",
  permissionOverrides: [],
};

const OPS = {
  id: "admin-1",
  email: "ops@test.com",
  name: "Ops",
  role: "ops",
  permissionOverrides: ["approvals:request"],
};

function makeRequest(body: unknown = { totpCode: "123456" }) {
  return new NextRequest("http://localhost/api/admin/approvals/a1/retry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/approvals/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
    mockRetry.mockResolvedValue({
      request: { id: "a1", status: "EXECUTED" },
      execution: { ok: true, status: "EXECUTED" },
      secret: null,
    });
  });

  it("无审批权限返回 403", async () => {
    mockVerifyAuth.mockResolvedValue(OPS);
    mockHasPermission.mockReturnValue(false);
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(403);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("缺少二次验证码返回 400", async () => {
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("重试成功且禁止缓存", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.request.status).toBe("EXECUTED");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(mockRetry).toHaveBeenCalledWith({
      admin: OWNER,
      id: "a1",
      totpCode: "123456",
    });
  });
});
