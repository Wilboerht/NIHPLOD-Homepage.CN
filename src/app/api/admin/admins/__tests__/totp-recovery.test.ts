import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const admin = {
    id: "owner-1",
    email: "owner@test.com",
    name: "Owner",
    role: "owner" as string,
    jti: "session-1",
    ver: 2,
  };
  return {
    admin,
    requireTotp: vi.fn(),
    beginAudit: vi.fn(),
    finishAudit: vi.fn(),
    createRecovery: vi.fn(),
    findUnique: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  withAuth:
    (
      handler: (
        request: NextRequest,
        admin: typeof mocks.admin,
        context: { params: Promise<{ id: string }> }
      ) => Promise<unknown>
    ) =>
    (request: NextRequest, context: { params: Promise<{ id: string }> }) =>
      handler(request, mocks.admin, context),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { admin: { findUnique: mocks.findUnique } },
  prisma: { admin: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/admin-totp", () => ({
  requireMoneyOperationTotp: mocks.requireTotp,
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: mocks.beginAudit,
  finishAuditLog: mocks.finishAudit,
}));

vi.mock("@/lib/admin-totp-recovery", () => ({
  ADMIN_TOTP_RECOVERY_TTL_MINUTES: 10,
  createAdminTotpRecovery: mocks.createRecovery,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../[id]/totp-recovery/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/admins/target-1/totp-recovery", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const context = { params: Promise.resolve({ id: "target-1" }) };

describe("POST /api/admin/admins/[id]/totp-recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.id = "owner-1";
    mocks.admin.role = "owner";
    mocks.requireTotp.mockResolvedValue(null);
    mocks.beginAudit.mockResolvedValue("audit-1");
    mocks.finishAudit.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue({
      id: "target-1",
      email: "target@test.com",
      status: "ACTIVE",
      totpEnabled: true,
    });
    mocks.createRecovery.mockResolvedValue({
      code: "a".repeat(32),
      expiresAt: new Date("2026-10-20T12:10:00.000Z"),
    });
  });

  it("owner 可签发恢复码", async () => {
    const res = await POST(
      request({ reason: "手机丢失且备用码不可用", totpCode: "123456" }),
      context
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.code).toBe("a".repeat(32));
    expect(mocks.beginAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_totp_recovery_issued",
        targetId: "target-1",
      })
    );
    expect(mocks.finishAudit).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.any(Object));
  });

  it("非 owner 拒绝", async () => {
    mocks.admin.role = "admin";

    const res = await POST(request({ reason: "手机丢失且备用码不可用" }), context);

    expect(res.status).toBe(403);
    expect(mocks.createRecovery).not.toHaveBeenCalled();
  });

  it("不能给自己签发", async () => {
    mocks.admin.id = "target-1";

    const res = await POST(request({ reason: "手机丢失且备用码不可用" }), context);

    expect(res.status).toBe(400);
    expect(mocks.createRecovery).not.toHaveBeenCalled();
  });

  it("目标未启用 TOTP 时拒绝", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "target-1",
      email: "target@test.com",
      status: "ACTIVE",
      totpEnabled: false,
    });

    const res = await POST(request({ reason: "手机丢失且备用码不可用" }), context);

    expect(res.status).toBe(400);
    expect(mocks.createRecovery).not.toHaveBeenCalled();
  });

  it("owner TOTP 校验失败时拒绝", async () => {
    mocks.requireTotp.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 400 })
    );

    const res = await POST(
      request({ reason: "手机丢失且备用码不可用", totpCode: "000000" }),
      context
    );

    expect(res.status).toBe(400);
    expect(mocks.createRecovery).not.toHaveBeenCalled();
  });
});
