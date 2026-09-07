/**
 * applyExternalSpentSync 消费入账 webhook 触发测试
 * 覆盖：消费额/等级变化时携带 membership 实时推送、等级不变但 totalSpent 变化也推送、
 * 无实际变化/重复上报不推送、推送失败不影响入账主流程
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTxSpentSyncFindUnique = vi.fn();
const mockTxSpentSyncCreate = vi.fn();
const mockTxUserFindUnique = vi.fn();
const mockTxUserUpdateMany = vi.fn();
const mockTxLevelChangeCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockSendProfileUpdateWebhook = vi.fn();

const tx = {
  spentSyncRecord: { findUnique: mockTxSpentSyncFindUnique, create: mockTxSpentSyncCreate },
  user: { findUnique: mockTxUserFindUnique, updateMany: mockTxUserUpdateMany },
  membershipLevelChange: { create: mockTxLevelChangeCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (cb: (txArg: unknown) => unknown) => cb(tx),
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));

vi.mock("@/lib/points-ledger", () => ({
  creditSpendPoints: vi.fn().mockResolvedValue(undefined),
  refundSpendPoints: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/profile-webhook", () => ({
  sendProfileUpdateWebhook: (...args: unknown[]) => mockSendProfileUpdateWebhook(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { applyExternalSpentSync } from "@/lib/points";

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 10));

describe("applyExternalSpentSync 会员信息 webhook 触发", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSpentSyncFindUnique.mockResolvedValue(null);
    mockTxSpentSyncCreate.mockResolvedValue({});
    mockTxUserUpdateMany.mockResolvedValue({ count: 1 });
    mockTxLevelChangeCreate.mockResolvedValue({});
    mockSendProfileUpdateWebhook.mockResolvedValue(undefined);
    mockUserFindUnique.mockResolvedValue({
      nickname: "张三",
      avatar: "https://cdn.example.com/a.png",
      birthday: new Date("1995-06-01T00:00:00.000Z"),
    });
  });

  it("入账后消费额/等级变化时推送携带 membership 的 webhook", async () => {
    mockTxUserFindUnique.mockResolvedValue({
      totalSpent: 800,
      membershipLevel: "REGULAR",
      silverActivatedAt: null,
      goldActivatedAt: null,
      diamondActivatedAt: null,
    });

    const result = await applyExternalSpentSync({
      userId: "user-1",
      spentDelta: 500,
      reference: "ORDER-1",
    });

    expect(result).toEqual({ totalSpent: 1300, membershipLevel: "SILVER", duplicated: false });
    await vi.waitFor(() => expect(mockSendProfileUpdateWebhook).toHaveBeenCalledTimes(1));
    // profile 快照与现有调用方一致（birthday 转 ISO 字符串），membership 为入账后权威值
    expect(mockSendProfileUpdateWebhook).toHaveBeenCalledWith(
      "user-1",
      {
        nickname: "张三",
        avatar: "https://cdn.example.com/a.png",
        birthday: "1995-06-01T00:00:00.000Z",
      },
      { level: "SILVER", totalSpent: 1300 }
    );
  });

  it("等级不变但 totalSpent 变化时也推送（银卡按消费额阶梯配额依赖 totalSpent）", async () => {
    mockTxUserFindUnique.mockResolvedValue({
      totalSpent: 1300,
      membershipLevel: "SILVER",
      silverActivatedAt: new Date("2026-01-01T00:00:00.000Z"),
      goldActivatedAt: null,
      diamondActivatedAt: null,
    });

    const result = await applyExternalSpentSync({
      userId: "user-1",
      spentDelta: 500,
      reference: "ORDER-2",
    });

    expect(result).toEqual({ totalSpent: 1800, membershipLevel: "SILVER", duplicated: false });
    await vi.waitFor(() => expect(mockSendProfileUpdateWebhook).toHaveBeenCalledTimes(1));
    expect(mockSendProfileUpdateWebhook).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ nickname: "张三" }),
      { level: "SILVER", totalSpent: 1800 }
    );
  });

  it("消费额/等级均无实际变化（spentDelta=0）时不推送", async () => {
    mockTxUserFindUnique.mockResolvedValue({
      totalSpent: 1300,
      membershipLevel: "SILVER",
      silverActivatedAt: new Date("2026-01-01T00:00:00.000Z"),
      goldActivatedAt: null,
      diamondActivatedAt: null,
    });

    const result = await applyExternalSpentSync({
      userId: "user-1",
      spentDelta: 0,
      reference: "ORDER-3",
    });

    expect(result?.duplicated).toBe(false);
    await flushMicrotasks();
    expect(mockSendProfileUpdateWebhook).not.toHaveBeenCalled();
  });

  it("重复上报（幂等命中）时不推送", async () => {
    mockTxSpentSyncFindUnique.mockResolvedValue({ id: "rec-1" });
    mockTxUserFindUnique.mockResolvedValue({ totalSpent: 1300, membershipLevel: "SILVER" });

    const result = await applyExternalSpentSync({
      userId: "user-1",
      spentDelta: 500,
      reference: "ORDER-1",
    });

    expect(result?.duplicated).toBe(true);
    await flushMicrotasks();
    expect(mockSendProfileUpdateWebhook).not.toHaveBeenCalled();
  });

  it("webhook 推送失败不影响入账主流程", async () => {
    mockTxUserFindUnique.mockResolvedValue({
      totalSpent: 800,
      membershipLevel: "REGULAR",
      silverActivatedAt: null,
      goldActivatedAt: null,
      diamondActivatedAt: null,
    });
    mockSendProfileUpdateWebhook.mockRejectedValue(new Error("network down"));

    const result = await applyExternalSpentSync({
      userId: "user-1",
      spentDelta: 500,
      reference: "ORDER-4",
    });

    expect(result).toEqual({ totalSpent: 1300, membershipLevel: "SILVER", duplicated: false });
    // 推送为 fire-and-forget：rejection 被 .catch 兜底，不产生未处理异常
    await vi.waitFor(() => expect(mockSendProfileUpdateWebhook).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
  });
});
