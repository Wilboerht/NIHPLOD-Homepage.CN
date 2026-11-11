import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  addressCount: vi.fn(),
  addressFindFirst: vi.fn(),
  addressUpdate: vi.fn(),
  balanceFindUnique: vi.fn(),
  balanceUpdate: vi.fn(),
  balanceCreate: vi.fn(),
  ledgerFindMany: vi.fn(),
  ledgerUpdate: vi.fn(),
  levelCreate: vi.fn(),
  advisorRequest: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  deletionFindUnique: vi.fn(),
  deletionFindFirst: vi.fn(),
}));
const writeModel = () => ({
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
});
const tx = {
  $queryRaw: mocks.queryRaw,
  user: { update: mocks.userUpdate },
  userAddress: {
    count: mocks.addressCount,
    findFirst: mocks.addressFindFirst,
    update: mocks.addressUpdate,
    ...writeModel(),
  },
  pointBalance: {
    findUnique: mocks.balanceFindUnique,
    update: mocks.balanceUpdate,
    create: mocks.balanceCreate,
  },
  pointLedger: {
    findMany: mocks.ledgerFindMany,
    update: mocks.ledgerUpdate,
    ...writeModel(),
  },
  membershipLevelChange: { create: mocks.levelCreate, ...writeModel() },
  accountDeletionRequest: { findFirst: mocks.deletionFindFirst, ...writeModel() },
  spentSyncRecord: writeModel(),
  spentOrderClaim: writeModel(),
  spentAdjustmentApplication: writeModel(),
  spentImportRow: writeModel(),
  pointRedemption: writeModel(),
  externalIdentity: writeModel(),
  loginAttempt: writeModel(),
  contactMessage: writeModel(),
  jobApplication: writeModel(),
  avatarAsset: writeModel(),
  refreshToken: writeModel(),
  oAuthSession: writeModel(),
  userConsent: writeModel(),
  oAuthAuthorizationCode: writeModel(),
  passwordHistory: writeModel(),
  webhookDeliveryFailure: writeModel(),
  backchannelLogoutFailure: writeModel(),
  notificationOutbox: writeModel(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    user: { findUnique: mocks.userFindUnique },
    userAddress: { count: mocks.addressCount },
    pointBalance: { findUnique: mocks.balanceFindUnique },
    accountDeletionRequest: { findUnique: mocks.deletionFindUnique },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/advisor-internal", () => ({
  advisorRequest: mocks.advisorRequest,
  getSubsitePurgeTargets: () => [
    { name: "advisor", baseUrl: "https://smart.test", purgePath: "/api/internal/user-data/purge" },
  ],
}));
vi.mock("@/lib/audit", () => ({ createAuditLogTx: mocks.audit }));
vi.mock("@/lib/security-notify", () => ({ enqueueSecurityActionNotification: mocks.notify }));
vi.mock("@/lib/points", () => ({
  calculateLevel: (spent: number) =>
    spent >= 5000 ? "GOLD" : spent >= 1000 ? "SILVER" : "REGULAR",
}));
vi.mock("@/lib/logger", () => ({ apiConsole: { warn: vi.fn() } }));

import { getAccountMergePreflight, mergeUserAccounts } from "@/lib/admin-account-merge";

const source = {
  id: "source-1",
  phone: "13800138000",
  status: "ACTIVE",
  nickname: "源账户",
  totalSpent: 2000,
  membershipLevel: "SILVER",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  wechatOpenId: null,
  wechatUnionId: "union-1",
  lastBirthdayRewardYear: 2025,
  silverActivatedAt: new Date("2025-01-01T00:00:00Z"),
  goldActivatedAt: null,
  diamondActivatedAt: null,
};
const target = {
  ...source,
  id: "target-1",
  phone: "13900139000",
  nickname: "目标账户",
  totalSpent: 4000,
  membershipLevel: "SILVER",
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  lastBirthdayRewardYear: 2026,
  silverActivatedAt: new Date("2025-06-01T00:00:00Z"),
};
const actor = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function mergeInput() {
  return {
    sourceUserId: source.id,
    targetUserId: target.id,
    expectedSourceUpdatedAt: source.updatedAt.toISOString(),
    expectedTargetUpdatedAt: target.updatedAt.toISOString(),
    reason: "已核验同一用户，工单 123",
    actor,
    operationId: "merge-1",
    approvalId: "merge-1",
  };
}

describe("admin account merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === source.id ? source : where.id === target.id ? target : null)
    );
    mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes('FROM "User"')) return Promise.resolve([source, target]);
      return Promise.resolve([]);
    });
    mocks.addressCount.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === source.id ? 1 : 0)
    );
    mocks.addressFindFirst.mockResolvedValue({ id: "address-source" });
    mocks.addressUpdate.mockResolvedValue({});
    mocks.balanceFindUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve({ available: where.userId === source.id ? 100 : 50 })
    );
    mocks.balanceUpdate.mockResolvedValue({});
    mocks.balanceCreate.mockResolvedValue({});
    mocks.ledgerFindMany.mockResolvedValue([
      { id: "ledger-checkin", reference: "checkin:source-1:2026-01-01" },
      { id: "ledger-birthday", reference: "birthday:source-1:2025" },
    ]);
    mocks.ledgerUpdate.mockResolvedValue({});
    mocks.levelCreate.mockResolvedValue({});
    mocks.advisorRequest.mockResolvedValue({ ok: true, data: { success: true, canMerge: true } });
    mocks.audit.mockResolvedValue("audit-1");
    mocks.notify.mockResolvedValue(undefined);
    mocks.deletionFindUnique.mockResolvedValue(null);
    mocks.deletionFindFirst.mockResolvedValue(null);
  });

  it("预检汇总积分、消费和地址，并要求子站明确支持", async () => {
    const result = await getAccountMergePreflight(source.id, target.id);
    expect(result.canMerge).toBe(true);
    expect(result.preview).toMatchObject({
      pointsAfter: 150,
      spentAfter: 6000,
      levelAfter: "GOLD",
      addressesAfter: 1,
    });
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/user-data/merge",
      expect.objectContaining({
        query: expect.objectContaining({ mode: "preflight" }),
      })
    );
  });

  it("任何账本冲突都拒绝合并且不调用子站", async () => {
    mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      if (strings.join(" ").includes('FROM "PointLedger"'))
        return Promise.resolve([{ reference: "duplicate" }]);
      return Promise.resolve([]);
    });
    const result = await getAccountMergePreflight(source.id, target.id);
    expect(result.canMerge).toBe(false);
    expect(result.conflicts[0]?.code).toBe("POINT_LEDGER_CONFLICT");
    expect(mocks.advisorRequest).not.toHaveBeenCalled();
  });

  it("事务内重键用户积分流水、合并财务数据并停用源账户", async () => {
    const result = await mergeUserAccounts(mergeInput());
    expect(result).toMatchObject({ pointsAfter: 150, totalSpentAfter: 6000, levelAfter: "GOLD" });
    expect(mocks.ledgerUpdate).toHaveBeenCalledWith({
      where: { id: "ledger-checkin" },
      data: { reference: "checkin:target-1:2026-01-01" },
    });
    expect(mocks.ledgerUpdate).toHaveBeenCalledWith({
      where: { id: "ledger-birthday" },
      data: { reference: "birthday:target-1:2025" },
    });
    expect(mocks.balanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: target.id }, data: { available: 150, frozen: 0 } })
    );
    expect(mocks.balanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: source.id }, data: { available: 0, frozen: 0 } })
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: target.id },
        data: expect.not.objectContaining({ password: expect.anything() }),
      })
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: source.id },
        data: expect.objectContaining({ status: "DELETED", password: null }),
      })
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedReason: "account_merge" }) })
    );
    expect(tx.userConsent.updateMany).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "user_accounts_merge" })
    );
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/user-data/merge",
      expect.objectContaining({
        query: expect.objectContaining({ mode: "execute", operationId: "merge-1" }),
      })
    );
  });

  it("子站不支持时阻止执行", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      code: "UPSTREAM_ERROR",
      message: "not found",
      status: 404,
    });
    await expect(mergeUserAccounts(mergeInput())).rejects.toMatchObject({
      code: "SUBSITE_MERGE_UNAVAILABLE",
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
