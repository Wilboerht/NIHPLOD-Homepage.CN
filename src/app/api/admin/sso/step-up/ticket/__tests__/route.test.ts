import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  const admin = {
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role: "owner" as const,
    ver: 4,
  };
  return {
    admin,
    session: null as null | { admin: typeof admin; exp: number },
    signTicket: vi.fn(),
    requireTotp: vi.fn(),
    audit: vi.fn(),
    auditStrict: vi.fn(),
    hasPermission: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  withAuth:
    (handler: (request: NextRequest, admin: typeof mocks.admin) => Promise<unknown>) =>
    (request: NextRequest) =>
      handler(request, mocks.admin),
  getCurrentAdminSession: vi.fn(() => mocks.session),
}));

vi.mock("@/lib/admin-sso-clients", () => ({
  getAdminSsoClient: vi.fn(() => ({
    clientId: "ba-admin",
    name: "BA 证书平台",
    clientSecret: "x".repeat(32),
    redirectUri: "https://ba.test/api/admin/auth/sso/callback",
    audience: "ba-admin",
    permissionPrefix: "ba:",
    roleResolver: "ba",
    signing: { alg: "RS256", keyId: "test-key", privateKey: "test-private-key" },
    stepUp: {
      enabled: true,
      audience: "ba-admin-stepup",
      redirectUri: "https://ba.test/api/admin/auth/step-up/callback",
      actions: [
        "ba.certificates.issue",
        "ba.certificates.revoke",
        "ba.certificates.delete",
      ],
      ttlSeconds: 120,
    },
  })),
}));

vi.mock("@/lib/admin-sso", () => ({
  signAdminStepUpTicket: mocks.signTicket,
}));

vi.mock("@/lib/admin-totp", () => ({
  requireFreshAdminTotp: mocks.requireTotp,
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: mocks.hasPermission,
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: mocks.audit,
  createAuditLogStrict: mocks.auditStrict,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/sso/step-up/ticket", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function callPost(request: NextRequest) {
  return POST(request, undefined as never);
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "ba-admin",
    redirectUri: "https://ba.test/api/admin/auth/step-up/callback",
    state: "a".repeat(43),
    action: "ba.certificates.issue",
    resourceId: "new",
    totpCode: "123456",
    ...overrides,
  };
}

describe("POST /api/admin/sso/step-up/ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { admin: mocks.admin, exp: Math.floor(Date.now() / 1000) + 600 };
    mocks.hasPermission.mockReturnValue(true);
    mocks.requireTotp.mockResolvedValue(null);
    mocks.signTicket.mockResolvedValue("signed-ticket");
    mocks.audit.mockResolvedValue(undefined);
    mocks.auditStrict.mockResolvedValue(undefined);
  });

  it("issues a ticket and records strict audit", async () => {
    const res = await callPost(request(validBody()));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.ticket).toBe("signed-ticket");
    expect(payload.data.redirectUri).toBe(
      "https://ba.test/api/admin/auth/step-up/callback",
    );
    expect(mocks.requireTotp).toHaveBeenCalledWith("admin-1", "123456");
    expect(mocks.signTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-1",
        clientId: "ba-admin",
        audience: "ba-admin-stepup",
        state: "a".repeat(43),
        action: "ba.certificates.issue",
        resourceId: "new",
        tokenVersion: 4,
        mainSessionExp: mocks.session?.exp,
        ttlSeconds: 120,
      }),
      expect.anything(),
    );
    expect(mocks.auditStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ba_step_up_ticket_issued" }),
    );
  });

  it("rejects new resource for revoke before consuming TOTP", async () => {
    const res = await callPost(
      request(validBody({ action: "ba.certificates.revoke" })),
    );
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error.code).toBe("INVALID_RESOURCE");
    expect(mocks.requireTotp).not.toHaveBeenCalled();
  });

  it("rejects a redirect URI that does not match the client", async () => {
    const res = await callPost(
      request(validBody({ redirectUri: "https://evil.test/callback" })),
    );
    expect(res.status).toBe(400);
    expect(mocks.requireTotp).not.toHaveBeenCalled();
  });

  it("audits and returns TOTP failures without signing", async () => {
    mocks.requireTotp.mockResolvedValue(
      NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "invalid" } },
        { status: 400 },
      ),
    );
    const res = await callPost(request(validBody()));
    expect(res.status).toBe(400);
    expect(mocks.signTicket).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ba_step_up_ticket_denied" }),
    );
  });

  it("fails closed when strict audit is unavailable", async () => {
    mocks.auditStrict.mockRejectedValue(new Error("audit down"));
    const res = await callPost(request(validBody()));
    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(payload.error.code).toBe("AUDIT_UNAVAILABLE");
  });

  it("rejects a request without a main admin session", async () => {
    mocks.session = null;
    const res = await callPost(request(validBody()));
    expect(res.status).toBe(401);
    expect(mocks.requireTotp).not.toHaveBeenCalled();
  });
});
