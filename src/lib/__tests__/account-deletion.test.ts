/**
 * 账号注销执行任务测试（lib/account-deletion.ts）
 * 覆盖：抢占幂等（未抢到不执行）、会话撤销调用、子站 purge 失败置 FAILED 待重试、
 *       匿名化字段与 PII 清理、ExternalIdentity 删除、回执短信 fail-soft、
 *       重试上限转人工告警、24 小时到期提醒
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockRequestUpdate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockTransaction = vi.fn();
// 事务内操作
const mockTxIdentityDeleteMany = vi.fn();
const mockTxPasswordHistoryDeleteMany = vi.fn();
const mockTxSmsCodeDeleteMany = vi.fn();
const mockTxLoginAttemptDeleteMany = vi.fn();
const mockTxUserAddressDeleteMany = vi.fn();
const mockTxWebhookFailureDeleteMany = vi.fn();
const mockTxRefreshTokenDeleteMany = vi.fn();
const mockTxUserUpdate = vi.fn();

const mockAdvisorRequest = vi.fn();
const mockCascade = vi.fn();
const mockCreateAuditLog = vi.fn();
const mockSendReceipt = vi.fn();
const mockSendReminder = vi.fn();
const mockError = vi.fn();
const mockWarn = vi.fn();
const mockInfo = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accountDeletionRequest: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockRequestUpdate(...args),
    },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/advisor-internal", () => ({
  advisorRequest: (...args: unknown[]) => mockAdvisorRequest(...args),
}));

vi.mock("@/lib/user-status", () => ({
  cascadeUserStatusChange: (...args: unknown[]) => mockCascade(...args),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

vi.mock("@/lib/sms", () => ({
  sendAccountDeletedNotification: (...args: unknown[]) => mockSendReceipt(...args),
  sendAccountDeletionReminder: (...args: unknown[]) => mockSendReminder(...args),
}));

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (s: string) => `hmac-${s}`,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: {
    error: (...args: unknown[]) => mockError(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    info: (...args: unknown[]) => mockInfo(...args),
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  executeAccountDeletion,
  executeDueAccountDeletions,
  MAX_DELETION_ATTEMPTS,
} from "@/lib/account-deletion";

const activeUser = { id: "user-1", phone: "13800138000", status: "ACTIVE" };

/** 构造事务 mock：直接以 tx 调用回调 */
function mockTxSuccess() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      externalIdentity: { deleteMany: mockTxIdentityDeleteMany },
      passwordHistory: { deleteMany: mockTxPasswordHistoryDeleteMany },
      smsCode: { deleteMany: mockTxSmsCodeDeleteMany },
      loginAttempt: { deleteMany: mockTxLoginAttemptDeleteMany },
      userAddress: { deleteMany: mockTxUserAddressDeleteMany },
      webhookDeliveryFailure: { deleteMany: mockTxWebhookFailureDeleteMany },
      refreshToken: { deleteMany: mockTxRefreshTokenDeleteMany },
      user: { update: mockTxUserUpdate },
    })
  );
}

describe("executeAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：抢占成功 + 用户 ACTIVE + 子站 purge 成功 + 事务成功
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue(activeUser);
    mockAdvisorRequest.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    mockCascade.mockResolvedValue(undefined);
    mockTxSuccess();
    mockRequestUpdate.mockResolvedValue({ attempts: 1 });
    mockCreateAuditLog.mockResolvedValue(true);
  });

  it("抢占失败（已撤回/已完成/并发被抢）：返回 skipped，不执行任何副作用", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("skipped");
    expect(mockCascade).not.toHaveBeenCalled();
    expect(mockAdvisorRequest).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("抢占条件含到期与状态约束，且 attempts 递增", async () => {
    await executeAccountDeletion("req-1");
    const claimArgs = mockUpdateMany.mock.calls[0][0];
    expect(claimArgs.where.id).toBe("req-1");
    expect(claimArgs.where.scheduledAt.lte).toBeInstanceOf(Date);
    expect(claimArgs.data).toEqual({
      status: "RUNNING",
      attempts: { increment: 1 },
      lastError: null,
    });
  });

  it("成功路径：会话撤销 → 子站 purge → 事务匿名化 → COMPLETED + 回执短信 + 审计", async () => {
    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    // 会话撤销（含 backchannel/webhook 由 cascade 内部负责）
    expect(mockCascade).toHaveBeenCalledWith({
      userId: "user-1",
      previousStatus: "ACTIVE",
      newStatus: "DELETED",
    });
    // 子站 purge 携带 userId
    expect(mockAdvisorRequest).toHaveBeenCalledWith("/api/internal/user-data/purge", {
      method: "POST",
      query: { userId: "user-1" },
    });

    // 事务内：ExternalIdentity 删除 + PII 衍生数据清理
    expect(mockTxIdentityDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockTxSmsCodeDeleteMany).toHaveBeenCalledWith({ where: { phone: "13800138000" } });
    expect(mockTxRefreshTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockTxUserAddressDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });

    // 匿名化字段：phone 占位、凭据/资料/微信列清空、status=DELETED（不物理删除）
    const updateArgs = mockTxUserUpdate.mock.calls[0][0];
    expect(updateArgs.data.phone).toBe("deleted_hmac-13800138000".slice(0, 24));
    expect(updateArgs.data.phone).toMatch(/^deleted_/);
    expect(updateArgs.data).toMatchObject({
      phoneVerified: false,
      password: null,
      nickname: null,
      avatar: null,
      birthday: null,
      gender: null,
      wechatOpenId: null,
      wechatUnionId: null,
      status: "DELETED",
    });

    // 收尾：COMPLETED + 回执短信发往注销前号码 + 审计不含明文手机号
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(mockSendReceipt).toHaveBeenCalledWith("13800138000");
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account_deletion_execute",
        targetType: "user",
        targetId: "user-1",
      })
    );
    const auditDetail = mockCreateAuditLog.mock.calls[0][0].detail;
    expect(JSON.stringify(auditDetail)).not.toContain("13800138000");
  });

  it("子站 purge 失败：置 FAILED + lastError，匿名化事务未执行，待下次重试", async () => {
    mockAdvisorRequest.mockResolvedValue({
      ok: false,
      status: 0,
      code: "UPSTREAM_ERROR",
      message: "子站服务连接失败",
    });
    mockRequestUpdate.mockResolvedValue({ attempts: 1 });

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("failed");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({
        status: "FAILED",
        lastError: expect.stringContaining("advisor_purge_failed"),
      }),
    });
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it("回执短信异常不阻断：申请仍置 COMPLETED（fail-soft）", async () => {
    mockSendReceipt.mockRejectedValue(new Error("sms gateway down"));

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
  });

  it("事务异常：置 FAILED + lastError", async () => {
    mockTransaction.mockRejectedValue(new Error("db deadlock"));
    mockRequestUpdate.mockResolvedValue({ attempts: 2 });

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("failed");
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { status: "FAILED", lastError: "db deadlock" },
    });
  });

  it("达到重试上限：error 级告警转人工", async () => {
    mockTransaction.mockRejectedValue(new Error("db deadlock"));
    mockRequestUpdate.mockResolvedValue({ attempts: MAX_DELETION_ATTEMPTS });

    await executeAccountDeletion("req-1");

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("转人工处理"));
  });

  it("用户已 DELETED：幂等重入直接置 COMPLETED，不重复执行", async () => {
    mockUserFindUnique.mockResolvedValue({ ...activeUser, status: "DELETED" });

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    expect(mockCascade).not.toHaveBeenCalled();
    expect(mockAdvisorRequest).not.toHaveBeenCalled();
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
  });
});

describe("executeDueAccountDeletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 0 }); // 默认抢占失败（无实际执行）
    mockRequestUpdate.mockResolvedValue({ attempts: 1 });
  });

  it("到期前 24 小时窗口内的 PENDING 申请发送提醒短信", async () => {
    const scheduledAt = new Date(Date.now() + 24.5 * 60 * 60 * 1000);
    mockFindMany
      // 第一次调用：到期申请扫描（空）
      .mockResolvedValueOnce([])
      // 第二次调用：提醒窗口扫描
      .mockResolvedValueOnce([{ userId: "user-1", scheduledAt }]);
    mockUserFindUnique.mockResolvedValue({ phone: "13800138000" });

    const result = await executeDueAccountDeletions();

    expect(result.reminded).toBe(1);
    expect(mockSendReminder).toHaveBeenCalledWith("13800138000", scheduledAt);
  });

  it("提醒短信对占位手机号（wx_）跳过", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: "user-1", scheduledAt: new Date() }]);
    mockUserFindUnique.mockResolvedValue({ phone: "wx_abc123" });

    const result = await executeDueAccountDeletions();

    expect(result.reminded).toBe(0);
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("提醒短信发送失败不影响整体结果（fail-soft）", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: "user-1", scheduledAt: new Date() }]);
    mockUserFindUnique.mockResolvedValue({ phone: "13800138000" });
    mockSendReminder.mockRejectedValue(new Error("sms down"));

    const result = await executeDueAccountDeletions();

    expect(result.reminded).toBe(0);
    expect(mockWarn).toHaveBeenCalled();
  });
});
