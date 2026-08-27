/**
 * resolveWechatBinding 单元测试（provider 写入语义）
 * 覆盖：小程序 provider 不写 User.wechatOpenId 旧列；默认 provider 行为不变；
 * ExternalIdentity 按 provider 双写
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const txClient = {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    externalIdentity: { upsert: vi.fn(), findUnique: vi.fn() },
  };
  return {
    prisma: {
      smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
      // 事务 mock：直接以 txClient 执行回调，并暴露给测试断言
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
      __tx: txClient,
    },
  };
});

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn().mockReturnValue(true),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  generateSecurePassword: vi.fn().mockReturnValue("generated-password"),
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({ deviceName: "test" }),
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { prisma } from "@/lib/prisma";
import { verifyCode, recordSmsCodeFailure } from "@/lib/sms";
import { resolveWechatBinding, type WechatBindingInput } from "@/lib/wechat-binding";

const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;
const mockRecordSmsCodeFailure = recordSmsCodeFailure as ReturnType<typeof vi.fn>;

type TxClient = {
  user: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  externalIdentity: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma = prisma as unknown as {
  smsCode: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  __tx: TxClient;
};

const createdUser = {
  id: "user-1",
  phone: "13800138000",
  password: "hashed-password",
  nickname: "测试用户",
  avatar: null,
};

function buildInput(provider?: string): WechatBindingInput {
  return {
    phone: "13800138000",
    code: "123456",
    allowAutoPassword: true,
    wechatInfo: { type: "wechat_bind", openid: "mini-openid", unionid: "union-1" },
    // 路由层总是传 NextRequest；extractDeviceInfo 已 mock，此处无需真实实例
    request: {} as WechatBindingInput["request"],
    ...(provider ? { provider } : {}),
  };
}

describe("resolveWechatBinding provider 写入语义", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.smsCode.findFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash" });
    mockPrisma.smsCode.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.user.findFirst.mockResolvedValue(null); // 无旧微信账户
    mockPrisma.__tx.user.findUnique.mockResolvedValue(null); // 无该手机号用户
    mockPrisma.__tx.user.create.mockResolvedValue(createdUser);
    mockPrisma.__tx.externalIdentity.upsert.mockResolvedValue({ id: "ei-1" });
    mockPrisma.__tx.externalIdentity.findUnique.mockResolvedValue(null); // 身份行不存在（无冲突）
  });

  it("provider=wechat_miniprogram 时创建用户不应写入 wechatOpenId 旧列", async () => {
    const result = await resolveWechatBinding(buildInput("wechat_miniprogram"));

    expect(result.success).toBe(true);
    const createData = mockPrisma.__tx.user.create.mock.calls[0][0].data;
    // 小程序 openid 不得写入旧列（create 场景为 null）
    expect(createData.wechatOpenId).toBeNull();
    // UnionID 跨平台语义一致，照常写入
    expect(createData.wechatUnionId).toBe("union-1");
    // ExternalIdentity 按小程序 provider 双写
    expect(mockPrisma.__tx.externalIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_subjectId: { provider: "wechat_miniprogram", subjectId: "mini-openid" } },
      })
    );
  });

  it("默认 provider（wechat_open）行为不变：创建用户写入 wechatOpenId", async () => {
    const result = await resolveWechatBinding(buildInput());

    expect(result.success).toBe(true);
    const createData = mockPrisma.__tx.user.create.mock.calls[0][0].data;
    expect(createData.wechatOpenId).toBe("mini-openid");
    expect(mockPrisma.__tx.externalIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_subjectId: { provider: "wechat_open", subjectId: "mini-openid" } },
      })
    );
  });

  it("provider=douyin 创建用户时不写 wechatOpenId/wechatUnionId 微信系旧列", async () => {
    const result = await resolveWechatBinding(buildInput("douyin"));

    expect(result.success).toBe(true);
    const createData = mockPrisma.__tx.user.create.mock.calls[0][0].data;
    // 抖音 openid/unionid 均不得写入微信系旧列
    expect(createData.wechatOpenId).toBeNull();
    expect(createData.wechatUnionId).toBeNull();
    // ExternalIdentity 按 douyin provider 双写（unionId 正常保存用于跨应用聚合）
    expect(mockPrisma.__tx.externalIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_subjectId: { provider: "douyin", subjectId: "mini-openid" } },
        create: expect.objectContaining({ provider: "douyin", unionId: "union-1" }),
      })
    );
  });

  it("provider=douyin 更新已有用户时不覆盖微信系旧列", async () => {
    mockPrisma.__tx.user.findUnique.mockResolvedValue({
      ...createdUser,
      wechatOpenId: "open-platform-openid",
      wechatUnionId: "wx-union",
    });
    mockPrisma.__tx.user.update.mockResolvedValue(createdUser);

    const result = await resolveWechatBinding(buildInput("douyin"));

    expect(result.success).toBe(true);
    const updateData = mockPrisma.__tx.user.update.mock.calls[0][0].data;
    // update 载荷中不应出现任何微信系旧列字段（保持原值）
    expect("wechatOpenId" in updateData).toBe(false);
    expect("wechatUnionId" in updateData).toBe(false);
  });

  it("身份已归属真实账户时应拒绝改绑（WECHAT_ALREADY_BOUND）", async () => {
    mockPrisma.__tx.externalIdentity.findUnique.mockResolvedValue({ userId: "user-other" });
    mockPrisma.__tx.user.findUnique
      .mockResolvedValueOnce(null) // 按手机号查无用户
      .mockResolvedValueOnce({ id: "user-other", phone: "13900139000" }); // 原归属为真实账户

    const result = await resolveWechatBinding(buildInput("douyin"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("WECHAT_ALREADY_BOUND");
    }
    expect(mockPrisma.__tx.externalIdentity.upsert).not.toHaveBeenCalled();
  });

  it("身份已归属占位账户时应允许抢占并改挂到目标用户", async () => {
    mockPrisma.__tx.externalIdentity.findUnique.mockResolvedValue({ userId: "user-placeholder" });
    mockPrisma.__tx.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-placeholder", phone: "wx_placeholder_abc" });

    const result = await resolveWechatBinding(buildInput("douyin"));

    expect(result.success).toBe(true);
    // 身份行随 upsert 改挂到新建用户
    expect(mockPrisma.__tx.externalIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ userId: "user-1" }),
        create: expect.objectContaining({ userId: "user-1", provider: "douyin" }),
      })
    );
  });

  it("provider=wechat_miniprogram 更新已有用户时不应覆盖 wechatOpenId", async () => {
    // 已有该手机号的真实用户（无旧微信账户冲突）
    mockPrisma.__tx.user.findUnique.mockResolvedValue({
      ...createdUser,
      wechatOpenId: "open-platform-openid",
      wechatUnionId: null,
    });
    mockPrisma.__tx.user.update.mockResolvedValue({
      ...createdUser,
      wechatOpenId: "open-platform-openid",
      wechatUnionId: "union-1",
    });

    const result = await resolveWechatBinding(buildInput("wechat_miniprogram"));

    expect(result.success).toBe(true);
    const updateData = mockPrisma.__tx.user.update.mock.calls[0][0].data;
    // update 载荷中不应出现 wechatOpenId（保持原值）
    expect("wechatOpenId" in updateData).toBe(false);
    expect(updateData.wechatUnionId).toBe("union-1");
  });
});

describe("resolveWechatBinding 短信验证码类型（register/bind 双通道）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCode.mockReturnValue(true);
    mockPrisma.smsCode.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.user.findFirst.mockResolvedValue(null);
    mockPrisma.__tx.user.findUnique.mockResolvedValue(null);
    mockPrisma.__tx.user.create.mockResolvedValue(createdUser);
    mockPrisma.__tx.externalIdentity.upsert.mockResolvedValue({ id: "ei-1" });
    mockPrisma.__tx.externalIdentity.findUnique.mockResolvedValue(null);
  });

  it("bind 类型验证码（小程序关联官网账户）应通过校验完成绑定", async () => {
    mockPrisma.smsCode.findFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash", type: "bind" });

    const result = await resolveWechatBinding(buildInput("wechat_miniprogram"));

    expect(result.success).toBe(true);
    // 查询应同时覆盖 register 与 bind 两种类型
    expect(mockPrisma.smsCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: { in: ["register", "bind"] } }),
      })
    );
    // 哈希含 type，校验必须使用记录自身的 type=bind
    expect(mockVerifyCode).toHaveBeenCalledWith("13800138000", "123456", "bind", "hash");
    // 验证通过：验证码被原子核销，绑定完成
    expect(mockPrisma.smsCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "sms-1", used: false }) })
    );
  });

  it("register 类型验证码仍以 register 校验（原有通道行为不变）", async () => {
    mockPrisma.smsCode.findFirst.mockResolvedValue({
      id: "sms-2",
      codeHash: "hash",
      type: "register",
    });

    const result = await resolveWechatBinding(buildInput());

    expect(result.success).toBe(true);
    expect(mockVerifyCode).toHaveBeenCalledWith("13800138000", "123456", "register", "hash");
  });

  it("验证码错误应递增单码失败计数且返回 INVALID_CODE（不锁定手机号）", async () => {
    mockPrisma.smsCode.findFirst.mockResolvedValue({ id: "sms-3", codeHash: "hash", type: "bind" });
    mockVerifyCode.mockReturnValue(false);

    const result = await resolveWechatBinding(buildInput("wechat_miniprogram"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_CODE");
    }
    // 单码防爆破：失败计数递增（达到上限由 sms 模块作废该码）
    expect(mockRecordSmsCodeFailure).toHaveBeenCalledWith("sms-3");
    // 核销不应发生
    expect(mockPrisma.smsCode.updateMany).not.toHaveBeenCalled();
  });
});
