import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stableStringify } from "@/lib/audit-chain";

const { prismaMock, createAuditLogMock, sendWecomMock, executeApprovalPolicyMock } = vi.hoisted(
  () => ({
    prismaMock: {
      $transaction: vi.fn(),
      $executeRaw: vi.fn().mockResolvedValue(0),
      user: { findUnique: vi.fn() },
      admin: { findUnique: vi.fn(), findMany: vi.fn() },
      pointRedemption: { findUnique: vi.fn() },
      spentAdjustmentApplication: { findUnique: vi.fn() },
      adminApprovalRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    createAuditLogMock: vi.fn().mockResolvedValue(true),
    sendWecomMock: vi.fn().mockResolvedValue({ success: true }),
    executeApprovalPolicyMock: vi.fn(),
  })
);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));
vi.mock("@/lib/admin-approval-executors", () => ({
  executeApprovalPolicy: executeApprovalPolicyMock,
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: createAuditLogMock }));
vi.mock("@/lib/wecom", () => ({ sendWecomNotification: sendWecomMock }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));
vi.mock("@/lib/admin-totp", () => ({
  requireFreshAdminTotp: vi.fn().mockResolvedValue(null),
}));

import {
  approveApprovalRequest,
  createApprovalRequest,
  expirePendingApprovals,
  retryApprovalRequest,
} from "@/lib/admin-approval";
import { AdminApprovalError } from "@/lib/admin-approval-errors";

beforeEach(() => {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
});

const OPS = {
  id: "admin-1",
  email: "ops@test.com",
  name: "Ops",
  role: "ops" as const,
  permissionOverrides: ["approvals:request"],
};

const OWNER = {
  id: "owner-1",
  email: "owner@test.com",
  name: "Owner",
  role: "owner" as const,
  permissionOverrides: [],
};

function makeRequest(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const payload = (overrides.payload as Record<string, unknown> | undefined) ?? {
    userId: "cjld2cjxh0000qzrmn831i7rn",
    amount: 1000,
    note: "test",
  };
  const payloadHash = createHash("sha256").update(stableStringify(payload)).digest("hex");
  return {
    id: "approval-1",
    policyKey: "points.adjust",
    action: "user_points_adjust",
    executionMode: "AUTO",
    targetType: "user",
    targetId: "cjld2cjxh0000qzrmn831i7rn",
    targetLabel: "Test",
    targetSnapshot: { status: "ACTIVE" },
    payload,
    payloadHash,
    reason: "test reason",
    requesterId: OPS.id,
    requesterEmail: OPS.email,
    requesterName: OPS.name,
    requesterRole: OPS.role,
    status: "PENDING",
    approverId: null,
    approverEmail: null,
    approverName: null,
    approvedAt: null,
    approvalTotpVerifiedAt: null,
    decisionNote: null,
    executionResult: null,
    executedAt: null,
    error: null,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("createApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "cjld2cjxh0000qzrmn831i7rn",
      nickname: "Test",
      phone: "13800138000",
      status: "ACTIVE",
    });
    prismaMock.adminApprovalRequest.create.mockResolvedValue(makeRequest());
    prismaMock.adminApprovalRequest.findFirst.mockResolvedValue(null);
  });

  it("owner 不能发起审批，应直接执行", async () => {
    await expect(
      createApprovalRequest({
        admin: { ...OPS, role: "owner" },
        policyKey: "points.adjust",
        payload: { userId: "cjld2cjxh0000qzrmn831i7rn", amount: 1000, note: "test" },
        reason: "test reason",
      })
    ).rejects.toMatchObject({ code: "OWNER_DIRECT_EXECUTION" });
  });

  it("无 approvals:request 权限时拒绝", async () => {
    await expect(
      createApprovalRequest({
        admin: { ...OPS, permissionOverrides: ["!approvals:request"] },
        policyKey: "points.adjust",
        payload: { userId: "cjld2cjxh0000qzrmn831i7rn", amount: 1000, note: "test" },
        reason: "test reason",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("未达到阈值时拒绝发起审批", async () => {
    await expect(
      createApprovalRequest({
        admin: OPS,
        policyKey: "points.adjust",
        payload: { userId: "cjld2cjxh0000qzrmn831i7rn", amount: 999, note: "test" },
        reason: "test reason",
      })
    ).rejects.toMatchObject({ code: "APPROVAL_NOT_REQUIRED" });
  });

  it("相同待审批申请已存在时拒绝重复创建", async () => {
    prismaMock.adminApprovalRequest.findFirst.mockResolvedValue({ id: "dup" });
    await expect(
      createApprovalRequest({
        admin: OPS,
        policyKey: "points.adjust",
        payload: { userId: "cjld2cjxh0000qzrmn831i7rn", amount: 1000, note: "test" },
        reason: "test reason",
      })
    ).rejects.toMatchObject({ code: "DUPLICATE_REQUEST" });
  });

  it("达到阈值时创建申请并写审计", async () => {
    const result = await createApprovalRequest({
      admin: OPS,
      policyKey: "points.adjust",
      payload: { userId: "cjld2cjxh0000qzrmn831i7rn", amount: 1000, note: "test" },
      reason: "test reason",
    });

    expect(result.id).toBe("approval-1");
    expect(prismaMock.adminApprovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyKey: "points.adjust",
          action: "user_points_adjust",
          executionMode: "AUTO",
          targetType: "user",
          targetId: "cjld2cjxh0000qzrmn831i7rn",
          requesterId: OPS.id,
          reason: "test reason",
        }),
      })
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_approval_requested" })
    );
  });

  it("不支持的策略拒绝", async () => {
    await expect(
      createApprovalRequest({
        admin: OPS,
        policyKey: "unknown",
        payload: {},
        reason: "test reason",
      })
    ).rejects.toBeInstanceOf(AdminApprovalError);
  });
});

describe("retryApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.adminApprovalRequest.findUnique.mockReset();
    executeApprovalPolicyMock.mockResolvedValue({ resultMeta: {} });
  });

  it("owner 可以用 fresh TOTP 重试 AUTO 执行失败", async () => {
    const failed = makeRequest({
      status: "EXECUTION_FAILED",
      approverId: "owner-2",
      approverEmail: "owner2@test.com",
      approverName: "Owner 2",
      approvedAt: new Date(),
      error: "transient error",
    });
    const executed = { ...failed, status: "EXECUTED", error: null };
    prismaMock.adminApprovalRequest.findUnique
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(executed);
    prismaMock.adminApprovalRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await retryApprovalRequest({
      admin: OWNER,
      id: "approval-1",
      totpCode: "123456",
    });

    expect(result.execution.ok).toBe(true);
    expect(executeApprovalPolicyMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminApprovalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval-1", status: "EXECUTION_FAILED" },
        data: expect.objectContaining({ status: "EXECUTING" }),
      })
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_approval_retried" })
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_approval_executed" })
    );
  });

  it("非 owner 不能重试 AUTO 审批", async () => {
    prismaMock.adminApprovalRequest.findUnique.mockResolvedValue(
      makeRequest({ status: "EXECUTION_FAILED" })
    );
    await expect(
      retryApprovalRequest({
        admin: OPS,
        id: "approval-1",
        totpCode: "123456",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(executeApprovalPolicyMock).not.toHaveBeenCalled();
  });
});

describe("approveApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.adminApprovalRequest.findUnique.mockReset();
  });

  it("不能批准针对自己的高风险申请", async () => {
    prismaMock.adminApprovalRequest.findUnique.mockResolvedValue(
      makeRequest({
        policyKey: "totp.recovery.issue",
        executionMode: "REQUESTER",
        targetType: "admin",
        targetId: OWNER.id,
      })
    );

    await expect(
      approveApprovalRequest({
        admin: OWNER,
        id: "approval-1",
        totpCode: "123456",
      })
    ).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
  });
});

describe("expirePendingApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("将超时 EXECUTING 标记为执行失败，便于重试", async () => {
    prismaMock.adminApprovalRequest.findMany
      .mockResolvedValueOnce([makeRequest({ status: "EXECUTING" })])
      .mockResolvedValueOnce([]);
    prismaMock.adminApprovalRequest.updateMany.mockResolvedValueOnce({ count: 1 });

    const count = await expirePendingApprovals();

    expect(count).toBe(1);
    expect(prismaMock.adminApprovalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EXECUTION_FAILED" }),
      })
    );
    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin_approval_execution_failed" })
    );
  });
});
