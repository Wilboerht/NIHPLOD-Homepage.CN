import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  const admin = {
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role: "owner" as const,
    ver: 2,
    jti: "session-1",
  };
  return {
    admin,
    rateLimit: vi.fn(),
    requireTotp: vi.fn(),
    issueGrant: vi.fn(),
    audit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/auth", () => ({
  withAuth:
    (handler: (request: NextRequest, admin: typeof mocks.admin) => Promise<unknown>) =>
    (request: NextRequest) =>
      handler(request, mocks.admin),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/admin-totp", () => ({
  requireMoneyOperationTotp: mocks.requireTotp,
}));

vi.mock("@/lib/admin-step-up", () => ({
  ADMIN_STEP_UP_COOKIE_NAME: "nihplod_admin_step_up",
  ADMIN_STEP_UP_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 600,
  },
  ADMIN_STEP_UP_TTL_SECONDS: 600,
  issueAdminStepUpGrant: mocks.issueGrant,
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: mocks.audit,
  createAuditLogStrict: mocks.audit,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/step-up", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function callPost(request: NextRequest) {
  return POST(request, undefined as never);
}

describe("POST /api/admin/step-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({
      success: true,
      remaining: 2,
      reset: Date.now() + 1000,
      limit: 3,
    });
    mocks.requireTotp.mockResolvedValue(null);
    mocks.issueGrant.mockResolvedValue({
      token: "step-token",
      expiresAt: new Date(Date.now() + 600_000),
    });
  });

  it("verifies TOTP and sets an HttpOnly step-up cookie", async () => {
    const res = await callPost(createRequest({ totpCode: "123456" }));

    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toContain("nihplod_admin_step_up=step-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/admin");
    expect(mocks.requireTotp).toHaveBeenCalledWith("admin-1", "123456");
    expect(mocks.issueGrant).toHaveBeenCalledWith(mocks.admin);
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60_000,
      limit: 3,
    });

    const res = await callPost(createRequest({ totpCode: "123456" }));
    expect(res.status).toBe(429);
    expect(mocks.issueGrant).not.toHaveBeenCalled();
  });

  it("returns the TOTP error without issuing a grant", async () => {
    mocks.requireTotp.mockResolvedValue(
      NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "invalid code" } },
        { status: 400 }
      )
    );

    const res = await callPost(createRequest({ totpCode: "000000" }));
    expect(res.status).toBe(400);
    expect(mocks.issueGrant).not.toHaveBeenCalled();
  });

  it("rejects malformed codes", async () => {
    const res = await callPost(createRequest({ totpCode: "123" }));
    expect(res.status).toBe(400);
    expect(mocks.requireTotp).not.toHaveBeenCalled();
  });
});
