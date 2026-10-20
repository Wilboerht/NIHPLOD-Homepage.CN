import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = {
    admin: { update: vi.fn() },
    adminTotpRecovery: { deleteMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      admin: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
    verifySetupToken: vi.fn(),
    beginAudit: vi.fn(),
    finishAudit: vi.fn(),
    verifyTOTP: vi.fn(),
    consumeOnce: vi.fn(),
    revokeStepUp: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock("@/lib/auth", () => ({
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
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
  verifyAdminTotpSetupToken: mocks.verifySetupToken,
}));

vi.mock("@/lib/totp", () => ({
  generateTOTPSecret: vi.fn().mockReturnValue("SECRET"),
  generateTOTPQRCodeUrl: vi.fn().mockReturnValue("otpauth://mock"),
  encryptTOTPSecret: vi.fn().mockReturnValue("encrypted-secret"),
  generateBackupCodes: vi.fn().mockReturnValue(["BACKUP1", "BACKUP2"]),
  hashBackupCode: vi.fn((v: string) => `hash:${v}`),
  verifyTOTP: mocks.verifyTOTP,
  decryptTOTPSecret: vi.fn().mockReturnValue("SECRET"),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: mocks.beginAudit,
  finishAuditLog: mocks.finishAudit,
}));

vi.mock("@/lib/token-blacklist", () => ({
  consumeAccessTokenOnce: mocks.consumeOnce,
}));

vi.mock("@/lib/admin-step-up", () => ({
  revokeAllAdminStepUpGrants: mocks.revokeStepUp,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST as startPOST } from "../setup/start/route";
import { POST as verifyPOST } from "../setup/verify/route";

function request(body: unknown = {}) {
  return new NextRequest("https://nihplod.cn/api/admin/totp/recovery/setup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      cookie: "__Host-admin_totp_setup=setup-token",
    },
  });
}

describe("TOTP recovery setup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySetupToken.mockResolvedValue({ adminId: "admin-1", tokenVersion: 3 });
    mocks.prisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "owner",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpResetRequired: true,
      totpSecret: null,
      tokenVersion: 3,
    });
    mocks.prisma.admin.update.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx)
    );
    mocks.tx.admin.update.mockResolvedValue({});
    mocks.tx.adminTotpRecovery.deleteMany.mockResolvedValue({ count: 0 });
    mocks.beginAudit.mockResolvedValue("audit-1");
    mocks.finishAudit.mockResolvedValue(true);
    mocks.verifyTOTP.mockReturnValue(true);
    mocks.consumeOnce.mockResolvedValue(true);
    mocks.revokeStepUp.mockResolvedValue(undefined);
  });

  it("恢复会话可生成新的 TOTP 密钥", async () => {
    const res = await startPOST(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.qrCode).toContain("data:image/png");
    expect(body.data.backupCodes).toEqual(["BACKUP1", "BACKUP2"]);
    expect(mocks.prisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpSecret: "encrypted-secret",
          totpEnabled: false,
        }),
      })
    );
  });

  it("恢复会话过期时拒绝生成密钥", async () => {
    mocks.verifySetupToken.mockResolvedValue(null);

    const res = await startPOST(request());

    expect(res.status).toBe(401);
    expect(mocks.prisma.admin.update).not.toHaveBeenCalled();
  });

  it("验证新 TOTP 后启用并清除 setup cookie", async () => {
    mocks.prisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "owner",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpResetRequired: true,
      totpSecret: "encrypted-secret",
      tokenVersion: 3,
    });

    const res = await verifyPOST(request({ code: "123456" }));

    expect(res.status).toBe(200);
    expect(mocks.tx.admin.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { totpEnabled: true, totpResetRequired: false, tokenVersion: { increment: 1 } },
    });
    expect(res.headers.get("set-cookie") || "").toContain("__Host-admin_totp_setup=;");
  });

  it("未处于恢复状态时拒绝启用", async () => {
    mocks.prisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "owner",
      status: "ACTIVE",
      deletedAt: null,
      totpEnabled: false,
      totpResetRequired: false,
      totpSecret: "encrypted-secret",
      tokenVersion: 3,
    });

    const res = await verifyPOST(request({ code: "123456" }));

    expect(res.status).toBe(400);
    expect(mocks.tx.admin.update).not.toHaveBeenCalled();
  });
});
