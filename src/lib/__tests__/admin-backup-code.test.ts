import { describe, it, expect, vi, beforeEach } from "vitest";
import { consumeAdminBackupCode } from "@/lib/admin-backup-code";
import { hashBackupCode } from "@/lib/totp";

vi.mock("@/lib/prisma", () => ({ prisma: { admin: { updateMany: vi.fn() } } }));

const updateMany = vi.fn();

describe("consumeAdminBackupCode", () => {
  const code = "A1B2C3D4E5F60718";
  const storedCodes = JSON.stringify([hashBackupCode(code), hashBackupCode("FFFFFFFFFFFFFFFF")]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CAS 成功时返回剩余备用码", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const result = await consumeAdminBackupCode("admin-1", code, storedCodes, {
      admin: { updateMany },
    } as never);

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", totpBackupCodes: storedCodes },
      data: { totpBackupCodes: expect.any(String) },
    });
  });

  it("CAS 冲突时不放行（并发/重放）", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await consumeAdminBackupCode("admin-1", code, storedCodes, {
      admin: { updateMany },
    } as never);

    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("无效备用码不写库", async () => {
    const result = await consumeAdminBackupCode("admin-1", "INVALIDCODE00000", storedCodes, {
      admin: { updateMany },
    } as never);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("备用码为空时直接拒绝", async () => {
    const result = await consumeAdminBackupCode("admin-1", code, null, {
      admin: { updateMany },
    } as never);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
