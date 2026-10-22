import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const admin = {
    id: "admin-1",
    email: "admin@test.com",
    name: "Admin",
    role: "admin" as string,
    jti: "session-1",
    ver: 0,
  };
  return {
    admin,
    findUnique: vi.fn(),
    update: vi.fn(),
    verifyPassword: vi.fn(),
    verifyTOTP: vi.fn(),
    consumeBackupCode: vi.fn(),
    consumeOnce: vi.fn(),
    rateLimit: vi.fn(),
    beginAudit: vi.fn(),
    finishAudit: vi.fn(),
    revokeStepUp: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  withAuth:
    (handler: (request: NextRequest, admin: typeof mocks.admin) => Promise<unknown>) =>
    (request: NextRequest) =>
      handler(request, mocks.admin),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { admin: { findUnique: mocks.findUnique, update: mocks.update } },
  prisma: { admin: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/totp", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/totp")>();
  return {
    ...original,
    decryptTOTPSecret: vi.fn().mockReturnValue("secret"),
    verifyTOTP: mocks.verifyTOTP,
  };
});

vi.mock("@/lib/admin-backup-code", () => ({
  consumeAdminBackupCode: mocks.consumeBackupCode,
}));

vi.mock("@/lib/token-blacklist", () => ({
  consumeAccessTokenOnce: mocks.consumeOnce,
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/audit", () => ({
  beginAuditLog: mocks.beginAudit,
  finishAuditLog: mocks.finishAudit,
}));

vi.mock("@/lib/admin-step-up", () => ({
  revokeAllAdminStepUpGrants: mocks.revokeStepUp,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/totp/backup-codes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const enabledAdmin = {
  id: "admin-1",
  password: "hashed-password",
  totpEnabled: true,
  totpSecret: "encrypted-secret",
  totpBackupCodes: JSON.stringify(["hashed-old-1", "hashed-old-2"]),
};

describe("POST /api/admin/totp/backup-codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(enabledAdmin);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.verifyTOTP.mockReturnValue(true);
    mocks.consumeOnce.mockResolvedValue(true);
    mocks.consumeBackupCode.mockResolvedValue({ ok: false, reason: "invalid" });
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.beginAudit.mockResolvedValue("audit-1");
    mocks.finishAudit.mockResolvedValue(true);
    mocks.revokeStepUp.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue({});
  });

  it("未启用 TOTP 时拒绝（TOTP_NOT_ENABLED）", async () => {
    mocks.findUnique.mockResolvedValue({ ...enabledAdmin, totpEnabled: false });

    const res = await POST(request({ password: "pw", totpCode: "123456" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("TOTP_NOT_ENABLED");
  });

  it("密码错误时拒绝（PASSWORD_INVALID）", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const res = await POST(request({ password: "wrong", totpCode: "123456" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("PASSWORD_INVALID");
  });

  it("动态码校验失败时拒绝（TOTP_INVALID）", async () => {
    mocks.verifyTOTP.mockReturnValue(false);

    const res = await POST(request({ password: "pw", totpCode: "000000" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("TOTP_INVALID");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("密码 + 动态码正确时作废旧码并返回新备用码明文（仅哈希落库）", async () => {
    const res = await POST(request({ password: "pw", totpCode: "123456" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.backupCodes).toHaveLength(10);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    // 落库的是哈希 JSON，不包含任何明文备用码
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const updateArg = mocks.update.mock.calls[0][0];
    const stored: string = updateArg.data.totpBackupCodes;
    for (const plain of data.data.backupCodes as string[]) {
      expect(stored).not.toContain(plain);
    }
    expect(JSON.parse(stored)).toHaveLength(10);

    // 审计动作与完成记录
    expect(mocks.beginAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_totp_backup_regenerate" })
    );
    expect(mocks.finishAudit).toHaveBeenCalledWith("audit-1", "SUCCESS", expect.anything());
  });

  it("允许使用备用码完成验证（消费后整体替换）", async () => {
    mocks.verifyTOTP.mockReturnValue(false);
    mocks.consumeBackupCode.mockResolvedValue({ ok: true, remainingCodes: ["hashed-old-2"] });

    const res = await POST(request({ password: "pw", totpCode: "ABCD1234" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.backupCodes).toHaveLength(10);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("TOTP 专用限流触发时返回 429", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });

    const res = await POST(request({ password: "pw", totpCode: "123456" }), undefined);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.code).toBe("TOTP_RATE_LIMITED");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
