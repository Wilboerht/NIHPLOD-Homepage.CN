/**
 * 消费补录审核核心逻辑测试（reviewApplication / undoApplication）
 * 覆盖：通过入账、CAS 抢占防重复审核、驳回不产生入账、入账失败补偿回滚、
 * 撤销审核（反向冲正）、撤销补偿恢复、抢占后未知异常补偿
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    spentAdjustmentApplication: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/points", () => ({
  applyExternalSpentSync: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  sendSpentReviewNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/wechat-template", () => ({
  sendSpentAdjustmentReviewMessage: vi.fn().mockResolvedValue({ success: true, sent: false }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/server", () => ({
  after: (cb: () => void) => cb(),
}));

import { prisma } from "@/lib/prisma";
import { applyExternalSpentSync } from "@/lib/points";
import { sendSpentReviewNotification } from "@/lib/sms";
import { sendSpentAdjustmentReviewMessage } from "@/lib/wechat-template";
import { reviewApplication, undoApplication } from "@/lib/spent-adjustments";

const mockUpdateMany = prisma.spentAdjustmentApplication.updateMany as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.spentAdjustmentApplication.findUnique as ReturnType<typeof vi.fn>;
const mockApplySync = applyExternalSpentSync as ReturnType<typeof vi.fn>;

const pendingApp = {
  status: "PENDING",
  userId: "user-1",
  channel: "TMALL",
  orderNo: "ORDER123",
  user: { phone: "13800138000" },
};

describe("reviewApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("通过：入账（reference 周期唯一）并发送通知", async () => {
    mockFindUnique.mockResolvedValue(pendingApp);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockApplySync.mockResolvedValue({
      totalSpent: 2280,
      membershipLevel: "ADVANCED",
      duplicated: false,
    });

    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-1",
      reviewAmount: 1280,
    });

    expect(result).toEqual({ ok: true, status: "APPROVED" });
    expect(mockApplySync).toHaveBeenCalledWith({
      userId: "user-1",
      spentDelta: 1280,
      reference: expect.stringContaining("manual:app-1:"),
      note: expect.stringContaining("ORDER123"),
    });
    expect(sendSpentReviewNotification).toHaveBeenCalledWith("13800138000", "已通过");
    expect(sendSpentAdjustmentReviewMessage).toHaveBeenCalled();
  });

  it("驳回：不入账，仅更新状态", async () => {
    mockFindUnique.mockResolvedValue(pendingApp);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "reject",
      adminId: "admin-1",
      reviewNote: "订单号无法核实",
    });

    expect(result).toEqual({ ok: true, status: "REJECTED" });
    expect(mockApplySync).not.toHaveBeenCalled();
    expect(sendSpentReviewNotification).toHaveBeenCalledWith("13800138000", "未通过");
  });

  it("前置校验：已处理申请返回 ALREADY_REVIEWED（不发起 CAS）", async () => {
    mockFindUnique.mockResolvedValue({ ...pendingApp, status: "APPROVED" });

    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-2",
      reviewAmount: 100,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "ALREADY_REVIEWED" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("申请不存在：返回 NOT_FOUND", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await reviewApplication({
      applicationId: "app-missing",
      decision: "reject",
      adminId: "admin-1",
      reviewNote: "x",
    });

    expect(result).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "申请不存在",
    });
  });

  it("入账异常：补偿回滚申请状态为 PENDING", async () => {
    mockFindUnique.mockResolvedValue(pendingApp);
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // 抢占
      .mockResolvedValueOnce({ count: 1 }); // 补偿回滚
    mockApplySync.mockRejectedValue(new Error("DB down"));

    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-1",
      reviewAmount: 1280,
    });

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "入账失败，请稍后重试",
    });
    // 补偿回滚：第二次 updateMany 将状态重置为 PENDING
    expect(mockUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "app-1", status: "APPROVED" },
      data: {
        status: "PENDING",
        reviewAmount: null,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
  });

  it("抢占后未知异常：外层补偿回滚，避免卡在已审核未入账", async () => {
    mockFindUnique.mockResolvedValue(pendingApp);
    mockUpdateMany
      .mockRejectedValueOnce(new Error("claim error")) // 抢占本身失败
      .mockResolvedValueOnce({ count: 1 }); // 补偿

    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-1",
      reviewAmount: 100,
    });

    expect(result).toEqual({ ok: false, code: "INTERNAL_ERROR", message: "服务器错误" });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("通过但缺少核实金额：返回 INVALID_PARAMS", async () => {
    const result = await reviewApplication({
      applicationId: "app-1",
      decision: "approve",
      adminId: "admin-1",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "INVALID_PARAMS" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("undoApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("撤销已通过申请：反向冲正 + 状态回到 PENDING", async () => {
    mockFindUnique.mockResolvedValue({
      status: "APPROVED",
      userId: "user-1",
      reviewAmount: 1280,
      reviewNote: "已核实",
      reviewedById: "admin-1",
      reviewedAt: new Date("2026-09-02T10:00:00Z"),
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockApplySync.mockResolvedValue({
      totalSpent: 1000,
      membershipLevel: "REGULAR",
      duplicated: false,
    });

    const result = await undoApplication({
      applicationId: "app-1",
      adminId: "admin-2",
    });

    expect(result).toEqual({ ok: true, status: "PENDING" });
    expect(mockApplySync).toHaveBeenCalledWith({
      userId: "user-1",
      spentDelta: -1280,
      reference: expect.stringContaining("manual-undo:app-1:"),
      note: expect.stringContaining("撤销"),
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "app-1", status: "APPROVED" },
      data: {
        status: "PENDING",
        reviewAmount: null,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
  });

  it("非已通过状态不可撤销", async () => {
    mockFindUnique.mockResolvedValue({ status: "PENDING" });

    const result = await undoApplication({
      applicationId: "app-1",
      adminId: "admin-1",
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_APPROVED" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("冲正失败：补偿恢复 APPROVED 与原始审核字段", async () => {
    const original = {
      status: "APPROVED",
      userId: "user-1",
      reviewAmount: 500,
      reviewNote: "已核实",
      reviewedById: "admin-1",
      reviewedAt: new Date("2026-09-02T10:00:00Z"),
    };
    mockFindUnique.mockResolvedValue(original);
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // 撤销抢占
      .mockResolvedValueOnce({ count: 1 }); // 补偿恢复
    mockApplySync.mockRejectedValue(new Error("DB down"));

    const result = await undoApplication({
      applicationId: "app-1",
      adminId: "admin-2",
    });

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "撤销失败，请稍后重试",
    });
    expect(mockUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "app-1", status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewAmount: 500,
        reviewNote: "已核实",
        reviewedById: "admin-1",
        reviewedAt: original.reviewedAt,
      },
    });
  });

  it("申请不存在：返回 NOT_FOUND", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await undoApplication({
      applicationId: "app-missing",
      adminId: "admin-1",
    });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: "申请不存在" });
  });
});
