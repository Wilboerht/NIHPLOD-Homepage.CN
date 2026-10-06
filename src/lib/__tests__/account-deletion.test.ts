/**
 * 账号注销执行任务测试（lib/account-deletion.ts）
 * 覆盖：抢占幂等（未抢到不执行）、会话撤销调用、子站 purge 失败置 FAILED 待重试（含目标名）、
 *       匿名化字段与 PII 清理（UserConsent 撤销 / sessionsInvalidatedAt / 兑换单快照脱敏 /
 *       SpentImportRow 手机号匿名化 / 双手机号哈希清理 LoginAttempt）、
 *       占位手机号含 userId（同号复用二次注销不冲突）、头像 OSS 清理 fail-soft、
 *       ExternalIdentity 删除、回执短信 fail-soft 与 notifyUser 开关、
 *       重试上限转人工告警、24 小时到期提醒
 */
import { createHash } from "crypto";
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
const mockTxUserConsentUpdateMany = vi.fn();
const mockTxPointRedemptionUpdateMany = vi.fn();
const mockTxSpentImportRowUpdateMany = vi.fn();
const mockTxUserUpdate = vi.fn();

const mockPurgeUserFromSubsites = vi.fn();
const mockDeleteOSSFiles = vi.fn();
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
  purgeUserFromSubsites: (...args: unknown[]) => mockPurgeUserFromSubsites(...args),
}));

vi.mock("@/lib/ali-oss", () => ({
  deleteOSSFiles: (...args: unknown[]) => mockDeleteOSSFiles(...args),
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
  // 用真实 SHA-256 保留输入敏感性：H1 回归测试依赖「同号不同 userId → 不同占位值」
  hashIdentifier: (s: string) => createHash("sha256").update(s).digest("hex"),
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

const activeUser = { id: "user-1", phone: "13800138000", avatar: null, status: "ACTIVE" };

/** 与实现一致的占位手机号期望值（哈希输入含 userId） */
function expectedPlaceholder(phone: string, userId: string): string {
  return `deleted_${createHash("sha256").update(`${phone}:${userId}`).digest("hex").slice(0, 16)}`;
}

/** 与实现一致的标识符哈希期望值 */
function expectedHash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

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
      userConsent: { updateMany: mockTxUserConsentUpdateMany },
      pointRedemption: { updateMany: mockTxPointRedemptionUpdateMany },
      spentImportRow: { updateMany: mockTxSpentImportRowUpdateMany },
      user: { update: mockTxUserUpdate },
    })
  );
}

describe("executeAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：抢占成功 + 用户 ACTIVE + 子站 purge 成功 + 事务成功
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({ userId: "user-1", phoneHash: expectedHash("13800138000") });
    mockUserFindUnique.mockResolvedValue(activeUser);
    mockPurgeUserFromSubsites.mockResolvedValue({ ok: true });
    mockDeleteOSSFiles.mockResolvedValue(undefined);
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
    expect(mockPurgeUserFromSubsites).not.toHaveBeenCalled();
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
    // 子站 purge 携带 userId（多目标遍历逻辑由 purgeUserFromSubsites 内部负责）
    expect(mockPurgeUserFromSubsites).toHaveBeenCalledWith("user-1");

    // 事务内：ExternalIdentity 删除 + PII 衍生数据清理
    expect(mockTxIdentityDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockTxSmsCodeDeleteMany).toHaveBeenCalledWith({ where: { phone: "13800138000" } });
    expect(mockTxRefreshTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockTxUserAddressDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    // 登录尝试：userId 维度 + 手机号哈希维度（申请时/执行时两个哈希去重后合并清理）
    expect(mockTxLoginAttemptDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockTxLoginAttemptDeleteMany).toHaveBeenCalledWith({
      where: { identifier: { in: [expectedHash("13800138000")] } },
    });

    // 匿名化字段：phone 占位（含 userId 哈希）、凭据/资料/微信列清空、status=DELETED（不物理删除）
    const updateArgs = mockTxUserUpdate.mock.calls[0][0];
    expect(updateArgs.data.phone).toBe(expectedPlaceholder("13800138000", "user-1"));
    expect(updateArgs.data.phone).toMatch(/^deleted_/);
    expect(updateArgs.data.phone.length).toBeLessThanOrEqual(24);
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
    // sessionsInvalidatedAt：本地校验的 JWT 即时失效
    expect(updateArgs.data.sessionsInvalidatedAt).toBeInstanceOf(Date);

    // UserConsent 撤销（与管理端删除同口径）
    expect(mockTxUserConsentUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    // 积分兑换单：待履约取消 + 全量清空收货快照 PII
    expect(mockTxPointRedemptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(mockTxPointRedemptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { recipient: null, phone: null, address: null },
    });

    // 消费导入行内手机号匿名化为同一占位值
    expect(mockTxSpentImportRowUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { phone: expectedPlaceholder("13800138000", "user-1") },
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

  it("H1 回归：同一手机号被复用后两个用户先后注销，占位值不同且均成功（不再 P2002）", async () => {
    mockFindUnique.mockResolvedValueOnce({ userId: "user-1", phoneHash: null });
    mockUserFindUnique.mockResolvedValueOnce(activeUser);
    const first = await executeAccountDeletion("req-1");
    const firstPhone = mockTxUserUpdate.mock.calls[0][0].data.phone;

    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValueOnce({ userId: "user-2", phoneHash: null });
    mockUserFindUnique.mockResolvedValueOnce({ ...activeUser, id: "user-2" });
    mockPurgeUserFromSubsites.mockResolvedValue({ ok: true });
    mockCascade.mockResolvedValue(undefined);
    mockTxSuccess();
    mockRequestUpdate.mockResolvedValue({ attempts: 1 });
    const second = await executeAccountDeletion("req-2");
    const secondPhone = mockTxUserUpdate.mock.calls[0][0].data.phone;

    expect(first).toBe("completed");
    expect(second).toBe("completed");
    expect(firstPhone).toBe(expectedPlaceholder("13800138000", "user-1"));
    expect(secondPhone).toBe(expectedPlaceholder("13800138000", "user-2"));
    expect(firstPhone).not.toBe(secondPhone);
  });

  it("L7：冷静期内换绑手机号——LoginAttempt 按申请时与执行时两个号码哈希清理", async () => {
    // 申请时号码 13900139000（phoneHash），执行时已换绑为 13800138000
    mockFindUnique.mockResolvedValue({ userId: "user-1", phoneHash: expectedHash("13900139000") });

    await executeAccountDeletion("req-1");

    expect(mockTxLoginAttemptDeleteMany).toHaveBeenCalledWith({
      where: {
        identifier: { in: [expectedHash("13900139000"), expectedHash("13800138000")] },
      },
    });
  });

  it("L7 兼容：存量申请无 phoneHash 时仅按当前号码哈希清理", async () => {
    mockFindUnique.mockResolvedValue({ userId: "user-1", phoneHash: null });

    await executeAccountDeletion("req-1");

    expect(mockTxLoginAttemptDeleteMany).toHaveBeenCalledWith({
      where: { identifier: { in: [expectedHash("13800138000")] } },
    });
  });

  it("M4：头像为站内相对路径时去前导斜杠后删除 OSS 对象", async () => {
    mockUserFindUnique.mockResolvedValue({ ...activeUser, avatar: "/uploads/2026-01-01/abc.png" });

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    expect(mockDeleteOSSFiles).toHaveBeenCalledWith(["uploads/2026-01-01/abc.png"]);
    // 删除发生在匿名化事务之前（purge-first 策略同口径）
    const ossOrder = mockDeleteOSSFiles.mock.invocationCallOrder[0];
    const txOrder = mockTransaction.mock.invocationCallOrder[0];
    expect(ossOrder).toBeLessThan(txOrder);
  });

  it("M4：头像为完整 URL 时原样传给 deleteOSSFiles", async () => {
    mockUserFindUnique.mockResolvedValue({
      ...activeUser,
      avatar: "https://cdn.example.com/uploads/x.png",
    });

    await executeAccountDeletion("req-1");

    expect(mockDeleteOSSFiles).toHaveBeenCalledWith(["https://cdn.example.com/uploads/x.png"]);
  });

  it("M4：OSS 删除失败不阻断注销（fail-soft），审计详情记录 avatarPurgeFailed", async () => {
    mockUserFindUnique.mockResolvedValue({ ...activeUser, avatar: "/uploads/a.png" });
    mockDeleteOSSFiles.mockRejectedValue(new Error("oss timeout"));

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("头像 OSS 删除失败"),
      expect.anything()
    );
    const auditDetail = mockCreateAuditLog.mock.calls[0][0].detail;
    expect(auditDetail.avatarPurgeFailed).toBe(true);
  });

  it("无头像时跳过 OSS 清理", async () => {
    await executeAccountDeletion("req-1");
    expect(mockDeleteOSSFiles).not.toHaveBeenCalled();
  });

  it("notifyUser=false（管理端删除路径）不发送回执短信", async () => {
    const result = await executeAccountDeletion("req-1", { notifyUser: false });

    expect(result).toBe("completed");
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it("子站 purge 失败：置 FAILED + lastError（含目标名），匿名化事务未执行，待下次重试", async () => {
    mockPurgeUserFromSubsites.mockResolvedValue({
      ok: false,
      target: "advisor",
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
        lastError: expect.stringContaining("subsite_purge_failed:advisor"),
      }),
    });
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it("子站 purge 全部成功（含未配置目标被跳过后返回 ok）：注销继续执行", async () => {
    // NOT_CONFIGURED 目标的跳过逻辑在 purgeUserFromSubsites 内部（见其单测）；
    // 执行器只需确认 ok 结果下全流程完成
    mockPurgeUserFromSubsites.mockResolvedValue({ ok: true });

    const result = await executeAccountDeletion("req-1");

    expect(result).toBe("completed");
    expect(mockTxUserUpdate).toHaveBeenCalled();
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
    expect(mockPurgeUserFromSubsites).not.toHaveBeenCalled();
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
