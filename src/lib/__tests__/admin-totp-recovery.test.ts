import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    adminTotpRecovery: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    admin: {
      update: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/oauth-constants", () => ({ getIssuer: () => "https://test.example" }));

import {
  consumeAdminTotpRecoveryAndReset,
  createAdminTotpRecovery,
  generateAdminTotpRecoveryCode,
  isAdminTotpRecoveryCodeFormat,
  signAdminTotpSetupToken,
  verifyAdminTotpSetupToken,
} from "@/lib/admin-totp-recovery";

describe("admin-totp-recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ADMIN_SECRET = "x".repeat(32);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) =>
      fn(mocks.tx)
    );
  });

  it("生成 32 位十六进制恢复码", () => {
    const code = generateAdminTotpRecoveryCode();
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(isAdminTotpRecoveryCodeFormat(code)).toBe(true);
    expect(isAdminTotpRecoveryCodeFormat("short")).toBe(false);
  });

  it("签发的恢复码只存哈希并替换旧未使用码", async () => {
    mocks.tx.adminTotpRecovery.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.adminTotpRecovery.create.mockResolvedValue({});

    const result = await createAdminTotpRecovery({
      adminId: "admin-1",
      createdBy: "owner-1",
      reason: "lost phone",
    });

    expect(result.code).toMatch(/^[0-9a-f]{32}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mocks.tx.adminTotpRecovery.deleteMany).toHaveBeenCalledWith({
      where: { adminId: "admin-1", usedAt: null },
    });
    const createArgs = mocks.tx.adminTotpRecovery.create.mock.calls[0][0] as {
      data: { tokenHash: string; reason: string; createdBy: string };
    };
    expect(createArgs.data.tokenHash).not.toBe(result.code);
    expect(createArgs.data.reason).toBe("lost phone");
    expect(createArgs.data.createdBy).toBe("owner-1");
  });

  it("恢复码消费成功时在同一事务内清空 TOTP 并递增 tokenVersion", async () => {
    mocks.tx.adminTotpRecovery.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.admin.update.mockResolvedValue({ tokenVersion: 4 });

    const result = await consumeAdminTotpRecoveryAndReset("admin-1", "a".repeat(32));

    expect(result).toEqual({ tokenVersion: 4 });
    expect(mocks.tx.admin.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: {
        totpEnabled: false,
        totpResetRequired: true,
        totpSecret: null,
        totpBackupCodes: null,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });
  });

  it("恢复码无效、过期或并发消费时不重置 TOTP", async () => {
    mocks.tx.adminTotpRecovery.updateMany.mockResolvedValue({ count: 0 });

    const result = await consumeAdminTotpRecoveryAndReset("admin-1", "a".repeat(32));

    expect(result).toBeNull();
    expect(mocks.tx.admin.update).not.toHaveBeenCalled();
  });

  it("setup token 绑定管理员和 tokenVersion", async () => {
    const token = await signAdminTotpSetupToken({ adminId: "admin-1", tokenVersion: 7 });
    const payload = await verifyAdminTotpSetupToken(token);

    expect(payload).toEqual({ adminId: "admin-1", tokenVersion: 7 });
    expect(await verifyAdminTotpSetupToken(`${token}x`)).toBeNull();
  });
});
