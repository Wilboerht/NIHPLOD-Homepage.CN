import { beforeEach, describe, expect, it, vi } from "vitest";

const REDEMPTION_ID = "clredemption000000000001";

const { findUniqueMock, refundMock, createAuditMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  refundMock: vi.fn(),
  createAuditMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { pointRedemption: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

vi.mock("@/lib/redemption-state-machine", () => ({
  refundAfterSales: (...args: unknown[]) => refundMock(...args),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditMock(...args),
  createAuditLogTx: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { executeApprovalPolicy, type ApprovalExecutorContext } from "../admin-approval-executors";

function context(overrides: Partial<ApprovalExecutorContext> = {}): ApprovalExecutorContext {
  return {
    approvalId: "approval-1",
    policyKey: "redemption.refund",
    payload: { redemptionId: REDEMPTION_ID, note: "退款" },
    targetId: REDEMPTION_ID,
    targetLabel: "测试礼品",
    targetSnapshot: { status: "RETURNED", points: 12000 },
    reason: "用户申请售后退款",
    requester: { id: "support-1", email: null, name: "客服", role: "support" },
    approver: { id: "owner-1", email: "owner@test.com", name: "Owner", role: "owner" },
    ...overrides,
  };
}

const redemption = {
  id: REDEMPTION_ID,
  userId: "user-1",
  points: 12000,
  status: "RETURNED",
  productName: "测试礼品",
};

describe("executeApprovalPolicy redemption.refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(redemption);
    refundMock.mockResolvedValue({ ok: true, status: "REFUNDED", points: 12000 });
    createAuditMock.mockResolvedValue(true);
  });

  it("退款成功返回退分数量并写执行审计", async () => {
    const result = await executeApprovalPolicy(context());

    expect(result.resultMeta).toEqual({ refundedPoints: 12000 });
    expect(refundMock).toHaveBeenCalledWith({
      redemptionId: REDEMPTION_ID,
      adminId: "owner-1",
      note: "退款",
    });
    expect(createAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "point_redemption_refund",
        targetType: "point_redemption",
        targetId: REDEMPTION_ID,
        adminId: "owner-1",
        detail: expect.objectContaining({ refundedPoints: 12000 }),
      })
    );
  });

  it("状态已变化时标记 STALE 且不退款", async () => {
    findUniqueMock.mockResolvedValue({ ...redemption, status: "COMPLETED" });

    await expect(executeApprovalPolicy(context())).rejects.toMatchObject({ code: "STALE" });
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("退款服务失败时标记执行失败", async () => {
    refundMock.mockResolvedValue({ ok: false, code: "INVALID_STATUS", message: "不能退款" });

    await expect(executeApprovalPolicy(context())).rejects.toMatchObject({
      code: "EXECUTION_FAILED",
    });
  });
});
