import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockHasPermission,
  mockCreateApprovalRequest,
  mockListApprovalRequests,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockCheckAdminRateLimit: vi.fn(),
  mockValidateCSRFToken: vi.fn(),
  mockHasPermission: vi.fn(),
  mockCreateApprovalRequest: vi.fn(),
  mockListApprovalRequests: vi.fn(),
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
  createApprovalRequest: (...args: unknown[]) => mockCreateApprovalRequest(...args),
  listApprovalRequests: (...args: unknown[]) => mockListApprovalRequests(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET, POST } from "../route";

const ADMIN = {
  id: "admin-1",
  email: "ops@test.com",
  name: "Ops",
  role: "ops",
  permissionOverrides: ["approvals:request"],
};

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/approvals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("/api/admin/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(ADMIN);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
    mockCreateApprovalRequest.mockResolvedValue({ id: "approval-1" });
    mockListApprovalRequests.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it("POST 未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(401);
  });

  it("POST 无发起权限返回 403", async () => {
    mockHasPermission.mockReturnValue(false);
    const res = await POST(
      createPostRequest({
        policyKey: "points.adjust",
        payload: { userId: "u1", amount: 1000, note: "test" },
        reason: "test reason",
      })
    );
    expect(res.status).toBe(403);
  });

  it("POST 缺少 CSRF 返回 403", async () => {
    mockValidateCSRFToken.mockReturnValue(false);
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(403);
  });

  it("POST 参数不合法返回 400", async () => {
    const res = await POST(
      createPostRequest({
        policyKey: "unknown",
        payload: {},
        reason: "x",
      })
    );
    expect(res.status).toBe(400);
    expect(mockCreateApprovalRequest).not.toHaveBeenCalled();
  });

  it("POST 合法请求调用服务并返回 201", async () => {
    const res = await POST(
      createPostRequest({
        policyKey: "points.adjust",
        payload: { userId: "u1", amount: 1000, note: "test" },
        reason: "test reason",
      })
    );
    expect(res.status).toBe(201);
    expect(mockCreateApprovalRequest).toHaveBeenCalledWith({
      admin: ADMIN,
      policyKey: "points.adjust",
      payload: { userId: "u1", amount: 1000, note: "test" },
      reason: "test reason",
    });
  });

  it("GET 无权限返回 403", async () => {
    mockHasPermission.mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/admin/approvals"));
    expect(res.status).toBe(403);
  });

  it("GET 返回列表并传递筛选参数", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/admin/approvals?status=PENDING&page=2&pageSize=10")
    );
    expect(res.status).toBe(200);
    expect(mockListApprovalRequests).toHaveBeenCalledWith(ADMIN, {
      page: 2,
      pageSize: 10,
      status: "PENDING",
      policyKey: undefined,
    });
  });
});
