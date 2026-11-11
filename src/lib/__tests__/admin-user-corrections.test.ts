import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
  userUpdate: vi.fn(),
  addressCount: vi.fn(),
  addressCreate: vi.fn(),
  audit: vi.fn(),
  prepareAvatar: vi.fn(),
}));
const tx = {
  $queryRaw: mocks.queryRaw,
  user: { findUniqueOrThrow: mocks.userFindUniqueOrThrow, update: mocks.userUpdate },
  userAddress: {
    count: mocks.addressCount,
    create: mocks.addressCreate,
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pointRedemption: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  pointRedemptionEvent: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/audit", () => ({ createAuditLogTx: mocks.audit }));
vi.mock("@/lib/avatar-assets", () => ({ prepareAvatarReplacement: mocks.prepareAvatar }));

import {
  correctRedemptionRecipient,
  correctUserProfile,
  createUserAddressByAdmin,
} from "@/lib/admin-user-corrections";

const request = new NextRequest("http://localhost/api/admin/users/user-1");
const admin = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" } as const;
const ctx = { admin, request, reason: "工单 123" };
const address = {
  recipient: "张三",
  phone: "13800138000",
  region: "浙江省杭州市",
  detail: "测试路 1 号",
  isDefault: true,
};

describe("admin user corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ status: "ACTIVE" }]);
    mocks.userFindUniqueOrThrow.mockResolvedValue({
      nickname: "旧昵称",
      avatar: null,
      birthday: null,
      gender: null,
    });
    mocks.userUpdate.mockResolvedValue({
      nickname: "新昵称",
      avatar: null,
      birthday: new Date("2000-01-01"),
      birthdayLocked: true,
      gender: "female",
    });
    mocks.addressCount.mockResolvedValue(1);
    mocks.addressCreate.mockResolvedValue(address);
    mocks.audit.mockResolvedValue("audit-1");
    mocks.prepareAvatar.mockResolvedValue({ previousAvatar: null });
  });

  it("资料纠错在同一事务更新并记录变更字段", async () => {
    const result = await correctUserProfile(
      "user-1",
      {
        nickname: "新昵称",
        birthday: new Date("2000-01-01"),
        gender: "female",
      },
      ctx
    );
    expect(result.changedFields).toEqual(["nickname", "birthday", "gender"]);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ birthdayLocked: true, gender: "female" }),
      })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "user_profile_admin_update" })
    );
  });

  it("地址达到 20 条时拒绝新增", async () => {
    mocks.addressCount.mockResolvedValue(20);
    await expect(createUserAddressByAdmin("user-1", address, ctx)).rejects.toMatchObject({
      code: "ADDRESS_LIMIT",
    });
    expect(mocks.addressCreate).not.toHaveBeenCalled();
  });

  it("非待履约兑换不能改收货快照", async () => {
    mocks.queryRaw.mockResolvedValue([{ userId: "user-1", status: "FULFILLED" }]);
    await expect(
      correctRedemptionRecipient("redemption-1", address, "request-1", ctx)
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(tx.pointRedemption.update).not.toHaveBeenCalled();
  });
});
