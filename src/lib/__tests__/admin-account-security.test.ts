import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  tokenUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));
const tx = {
  user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
  refreshToken: { updateMany: mocks.tokenUpdateMany },
  oAuthSession: { updateMany: mocks.sessionUpdateMany },
  $queryRaw: mocks.queryRaw,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/audit", () => ({ createAuditLogTx: mocks.audit }));
vi.mock("@/lib/auth-security", () => ({ hashIdentifier: (value: string) => `hash:${value}` }));
vi.mock("@/lib/security-notify", () => ({ enqueueSecurityActionNotification: mocks.notify }));
vi.mock("@/lib/logger", () => ({ apiConsole: { warn: vi.fn() } }));

import { changeUserPhoneByAdmin, getPhoneChangePreflight } from "@/lib/admin-account-security";

const account = {
  id: "user-1",
  phone: "13800138000",
  status: "ACTIVE",
  nickname: "测试用户",
};
const actor = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

describe("admin phone recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockImplementation(
      ({ where }: { where: { id?: string; phone?: string } }) => {
        if (where.id === account.id || where.phone === account.phone)
          return Promise.resolve(account);
        return Promise.resolve(null);
      }
    );
    mocks.queryRaw.mockResolvedValue([{ phone: account.phone, status: account.status }]);
    mocks.userUpdate.mockResolvedValue({});
    mocks.tokenUpdateMany.mockResolvedValue({ count: 2 });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue("audit-1");
    mocks.notify.mockResolvedValue(undefined);
  });

  it("预检返回当前手机号哈希并识别占用", async () => {
    const available = await getPhoneChangePreflight(account.id, "13900139000");
    expect(available.available).toBe(true);
    expect(available.currentPhoneHash).toBe(`hash:${account.phone}`);

    mocks.userFindUnique.mockImplementation(
      ({ where }: { where: { id?: string; phone?: string } }) => {
        if (where.id === account.id) return Promise.resolve(account);
        if (where.phone === "13900139000")
          return Promise.resolve({ id: "user-2", status: "ACTIVE", nickname: null });
        return Promise.resolve(null);
      }
    );
    const occupied = await getPhoneChangePreflight(account.id, "13900139000");
    expect(occupied.available).toBe(false);
    expect(occupied.occupant?.id).toBe("user-2");
  });

  it("快照变化时拒绝换绑", async () => {
    await expect(
      changeUserPhoneByAdmin({
        userId: account.id,
        newPhone: "13900139000",
        expectedPhoneHash: "hash:old",
        reason: "工单 123",
        actor,
      })
    ).rejects.toMatchObject({ code: "STALE" });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("成功换绑并撤销全部会话，通知新旧手机号", async () => {
    const result = await changeUserPhoneByAdmin({
      userId: account.id,
      newPhone: "13900139000",
      expectedPhoneHash: `hash:${account.phone}`,
      reason: "工单 123",
      actor,
      approvalId: "approval-1",
    });
    expect(result.sessionsRevoked).toBe(true);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: "13900139000", phoneVerified: true }),
      })
    );
    expect(mocks.tokenUpdateMany).toHaveBeenCalled();
    expect(mocks.sessionUpdateMany).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "user_phone_changed" })
    );
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });
});
