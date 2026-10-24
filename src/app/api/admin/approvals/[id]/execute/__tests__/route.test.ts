import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockHasPermission,
  mockExecute,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockCheckAdminRateLimit: vi.fn(),
  mockValidateCSRFToken: vi.fn(),
  mockHasPermission: vi.fn(),
  mockExecute: vi.fn(),
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
  executeRequesterApproval: (...args: unknown[]) => mockExecute(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

const ADMIN = {
  id: "admin-1",
  email: "ops@test.com",
  name: "Ops",
  role: "ops",
  permissionOverrides: ["approvals:request"],
};

function makeRequest(body: unknown = { totpCode: "123456" }) {
  return new NextRequest("http://localhost/api/admin/approvals/a1/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/approvals/[id]/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(ADMIN);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
    mockExecute.mockResolvedValue({
      request: { id: "a1", status: "EXECUTED" },
      execution: { ok: true, status: "EXECUTED" },
      secret: "one-time-secret",
    });
  });

  it("无执行权限返回 403", async () => {
    mockHasPermission.mockReturnValue(false);
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("执行成功返回一次性密钥且禁止缓存", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.secret).toBe("one-time-secret");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(mockExecute).toHaveBeenCalledWith(ADMIN, "a1", "123456");
  });

  it("缺少二次验证码返回 400", async () => {
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
