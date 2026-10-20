import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findAdmin: vi.fn(),
  verifyPassword: vi.fn(),
  verifyTOTP: vi.fn(),
  consumeBackup: vi.fn(),
  consumeRecovery: vi.fn(),
  signSetupToken: vi.fn(),
  beginAudit: vi.fn(),
  finishAudit: vi.fn(),
  createAudit: vi.fn(),
  clearLoginAttempts: vi.fn(),
  recordAttempt: vi.fn(),
  revokeStepUp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    admin: { findUnique: mocks.findAdmin },
    loginAttempt: { create: mocks.recordAttempt },
  },
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/jwt", () => ({
  signToken: vi.fn().mockResolvedValue("admin-token"),
}));

vi.mock("@/lib/totp", () => ({
  verifyTOTP: mocks.verifyTOTP,
  decryptTOTPSecret: vi.fn().mockReturnValue("secret"),
}));

vi.mock("@/lib/admin-backup-code", () => ({
  consumeAdminBackupCode: mocks.consumeBackup,
}));

vi.mock("@/lib/admin-totp-recovery", () => ({
  ADMIN_TOTP_SETUP_COOKIE_NAME: "__Host-admin_totp_setup",
  ADMIN_TOTP_SETUP_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 600,
  },
  isAdminTotpRecoveryCodeFormat: (code: string) => /^[0-9a-f]{32}$/i.test(code),
  consumeAdminTotpRecoveryAndReset: mocks.consumeRecovery,
  signAdminTotpSetupToken: mocks.signSetupToken,
}));

vi.mock("@/lib/admin-step-up", () => ({
  revokeAllAdminStepUpGrants: mocks.revokeStepUp,
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, reset: 0, limit: 100 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: mocks.beginAudit,
  finishAuditLog: mocks.finishAudit,
  createAuditLog: mocks.createAudit,
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: vi.fn((v: string) => `hash:${v}`),
  clearLoginAttempts: mocks.clearLoginAttempts,
}));

vi.mock("@/lib/token-blacklist", () => ({
  consumeAccessTokenOnce: vi.fn().mockResolvedValue(true),
  removeFromBlacklist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin-lockout", () => ({
  checkAdminLockout: vi.fn().mockResolvedValue({ locked: false }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

function loginRequest(totpCode: string) {
  return new NextRequest("https://nihplod.cn/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      email: "owner@test.com",
      password: "password123",
      totpCode,
    }),
    headers: { "Content-Type": "application/json", origin: "https://nihplod.cn" },
  });
}

describe("POST /api/admin/login TOTP recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAdmin.mockResolvedValue({
      id: "admin-1",
      email: "owner@test.com",
      name: "Owner",
      role: "owner",
      password: "hash",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: true,
      totpSecret: "encrypted",
      totpBackupCodes: "[]",
      tokenVersion: 2,
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.verifyTOTP.mockReturnValue(false);
    mocks.consumeBackup.mockResolvedValue({ ok: false, reason: "invalid" });
    mocks.consumeRecovery.mockResolvedValue({ tokenVersion: 3 });
    mocks.signSetupToken.mockResolvedValue("setup-token");
    mocks.beginAudit.mockResolvedValue("audit-1");
    mocks.finishAudit.mockResolvedValue(true);
    mocks.createAudit.mockResolvedValue(true);
    mocks.recordAttempt.mockResolvedValue({});
    mocks.revokeStepUp.mockResolvedValue(undefined);
    mocks.clearLoginAttempts.mockResolvedValue(undefined);
  });

  it("恢复码登录后只下发 setup cookie，不建立后台会话", async () => {
    const res = await POST(loginRequest("a".repeat(32)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totpSetupRequired).toBe(true);
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toContain("__Host-admin_totp_setup=setup-token");
    expect(cookie).not.toContain("__Host-admin_token=");
    expect(mocks.consumeRecovery).toHaveBeenCalledWith("admin-1", "a".repeat(32));
    expect(mocks.revokeStepUp).toHaveBeenCalledWith("admin-1");
  });

  it("恢复码无效时返回 TOTP_INVALID", async () => {
    mocks.consumeRecovery.mockResolvedValue(null);

    const res = await POST(loginRequest("a".repeat(32)));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("TOTP_INVALID");
    expect(res.headers.get("set-cookie") || "").not.toContain("__Host-admin_totp_setup=");
    expect(mocks.finishAudit).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.objectContaining({ reason: "recovery_code_rejected" })
    );
  });

  it("恢复后未重新绑定 TOTP 时，密码登录不能建立后台会话", async () => {
    mocks.findAdmin.mockResolvedValue({
      id: "admin-1",
      email: "owner@test.com",
      name: "Owner",
      role: "owner",
      password: "hash",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpResetRequired: true,
      totpSecret: null,
      totpBackupCodes: null,
      tokenVersion: 3,
    });

    const res = await POST(loginRequest("123456"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("TOTP_RECOVERY_REQUIRED");
    expect(res.headers.get("set-cookie") || "").not.toContain("__Host-admin_token=");
    expect(mocks.consumeRecovery).not.toHaveBeenCalled();
  });

  it("恢复后仍可用新的恢复码进入重绑流程", async () => {
    mocks.findAdmin.mockResolvedValue({
      id: "admin-1",
      email: "owner@test.com",
      name: "Owner",
      role: "owner",
      password: "hash",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpResetRequired: true,
      totpSecret: null,
      totpBackupCodes: null,
      tokenVersion: 3,
    });

    const res = await POST(loginRequest("b".repeat(32)));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.totpSetupRequired).toBe(true);
    expect(mocks.consumeRecovery).toHaveBeenCalledWith("admin-1", "b".repeat(32));
    expect(res.headers.get("set-cookie") || "").toContain("__Host-admin_totp_setup=setup-token");
  });
});
