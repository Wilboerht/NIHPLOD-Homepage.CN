/**
 * 资金类操作 TOTP 二次验证单元测试
 *
 * 覆盖：
 * - ADMIN_TOTP_ENFORCE=false 时跳过校验
 * - 未启用 TOTP → TOTP_NOT_ENABLED
 * - 缺少验证码 → TOTP_REQUIRED
 * - 动态验证码正确 → 通过
 * - 动态验证码错误 → TOTP_INVALID
 * - 备用码命中 → 通过并消费
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    admin: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/totp", () => ({
  decryptTOTPSecret: vi.fn().mockReturnValue("secret"),
  verifyTOTP: vi.fn(),
  verifyBackupCode: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import {
  isMoneyOperationTotpEnforced,
  requireMoneyOperationTotp,
} from "@/lib/admin-totp";
import { prisma } from "@/lib/prisma";
import { verifyTOTP, verifyBackupCode } from "@/lib/totp";

const ENFORCE_BACKUP = process.env.ADMIN_TOTP_ENFORCE;

describe("requireMoneyOperationTotp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_TOTP_ENFORCE;
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      totpEnabled: true,
      totpSecret: "encrypted",
      totpBackupCodes: "[]",
    });
  });

  afterEach(() => {
    if (ENFORCE_BACKUP === undefined) delete process.env.ADMIN_TOTP_ENFORCE;
    else process.env.ADMIN_TOTP_ENFORCE = ENFORCE_BACKUP;
  });

  it("ADMIN_TOTP_ENFORCE=false 时跳过校验", async () => {
    process.env.ADMIN_TOTP_ENFORCE = "false";
    expect(isMoneyOperationTotpEnforced()).toBe(false);

    const result = await requireMoneyOperationTotp("admin-1", undefined);

    expect(result).toBeNull();
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("未启用 TOTP 返回 TOTP_NOT_ENABLED", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: null,
    });

    const res = await requireMoneyOperationTotp("admin-1", "123456");
    const data = await res!.json();

    expect(res!.status).toBe(400);
    expect(data.error.code).toBe("TOTP_NOT_ENABLED");
  });

  it("缺少验证码返回 TOTP_REQUIRED", async () => {
    const res = await requireMoneyOperationTotp("admin-1", undefined);
    const data = await res!.json();

    expect(res!.status).toBe(400);
    expect(data.error.code).toBe("TOTP_REQUIRED");
  });

  it("动态验证码正确时通过", async () => {
    (verifyTOTP as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await requireMoneyOperationTotp("admin-1", "123456");

    expect(result).toBeNull();
    expect(verifyTOTP).toHaveBeenCalledWith("123456", "secret");
  });

  it("动态验证码错误返回 TOTP_INVALID", async () => {
    (verifyTOTP as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (verifyBackupCode as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const res = await requireMoneyOperationTotp("admin-1", "000000");
    const data = await res!.json();

    expect(res!.status).toBe(400);
    expect(data.error.code).toBe("TOTP_INVALID");
  });

  it("备用码命中时通过并消费", async () => {
    (verifyTOTP as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (verifyBackupCode as ReturnType<typeof vi.fn>).mockReturnValue({
      remainingCodes: ["hashed-2"],
    });

    const result = await requireMoneyOperationTotp("admin-1", "backup-code");

    expect(result).toBeNull();
    expect(prisma.admin.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { totpBackupCodes: JSON.stringify(["hashed-2"]) },
    });
  });
});
