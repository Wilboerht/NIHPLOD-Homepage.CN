import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn(),
  validateCSRFToken: vi.fn(),
  csrfForbiddenResponse: vi.fn(),
  hasAdminPermission: vi.fn(),
  createAuditLog: vi.fn(),
  push: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  checkAdminRateLimit: mocks.checkAdminRateLimit,
}));
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: mocks.validateCSRFToken,
  csrfForbiddenResponse: mocks.csrfForbiddenResponse,
}));
vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: mocks.hasAdminPermission,
}));
vi.mock("@/lib/audit", () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/advisor-product-sync", () => ({
  pushAdvisorProductSnapshot: mocks.push,
}));

import { POST } from "../route";

function fakeRequest(): NextRequest {
  return {
    url: "http://localhost/api/admin/products/sync-advisor",
    nextUrl: new URL("http://localhost/api/admin/products/sync-advisor"),
    headers: new Headers(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateCSRFToken.mockReturnValue(true);
  mocks.verifyAuth.mockResolvedValue({ id: "admin-1", role: "owner" });
  mocks.hasAdminPermission.mockReturnValue(true);
  mocks.checkAdminRateLimit.mockResolvedValue(null);
  mocks.createAuditLog.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue({
    ok: true,
    productCount: 9,
    data: { updated: 9, created: 0, deactivated: 0, warnings: [] },
  });
});

describe("POST /api/admin/products/sync-advisor", () => {
  it("CSRF 失败返回 403", async () => {
    mocks.validateCSRFToken.mockReturnValue(false);
    mocks.csrfForbiddenResponse.mockReturnValue(
      new Response(JSON.stringify({ success: false }), { status: 403 })
    );
    const res = await POST(fakeRequest());
    expect(res.status).toBe(403);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("未登录返回 401", async () => {
    mocks.verifyAuth.mockResolvedValue(null);
    const res = await POST(fakeRequest());
    expect(res.status).toBe(401);
  });

  it("无产品编辑权限返回 403", async () => {
    mocks.hasAdminPermission.mockReturnValue(false);
    const res = await POST(fakeRequest());
    expect(res.status).toBe(403);
  });

  it("成功返回同步统计并写审计", async () => {
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(9);
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sync_products_to_advisor" })
    );
  });

  it("停用开关返回 skipped", async () => {
    mocks.push.mockResolvedValue({ ok: true, skipped: true, reason: "disabled" });
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ skipped: true, reason: "disabled" });
  });

  it("子站同步中返回 409", async () => {
    mocks.push.mockResolvedValue({
      ok: false,
      code: "SYNC_IN_PROGRESS",
      message: "busy",
      status: 409,
    });
    const res = await POST(fakeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("SYNC_IN_PROGRESS");
  });

  it("未配置密钥返回 503", async () => {
    mocks.push.mockResolvedValue({
      ok: false,
      code: "NOT_CONFIGURED",
      message: "not configured",
      status: 0,
    });
    const res = await POST(fakeRequest());
    expect(res.status).toBe(503);
  });
});
