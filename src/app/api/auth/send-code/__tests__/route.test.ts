/**
 * POST /api/auth/send-code 路由测试（type=bind 通道）
 * 覆盖：type=bind 无 Origin 豁免 CSRF（小程序 wx.request 不携带来源头）；
 *       携带 Origin/Referer 的 bind 请求不豁免（浏览器跨站必带 Origin，仍走 CSRF 校验）；
 *       无凭证未注册手机号假发送（防枚举）；已注册真实发码；
 *       带 bindToken / Bearer 凭证时未注册号码也真实发码（修复绑定死胡同）；
 *       60 秒频控仍生效；其余 type 回归（无 CSRF 仍 403）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockVerifyUserToken, mockVerifyBindToken } = vi.hoisted(() => ({
  mockVerifyUserToken: vi.fn(),
  mockVerifyBindToken: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  verifyUserToken: (...args: unknown[]) => mockVerifyUserToken(...args),
  verifyWechatBindToken: (...args: unknown[]) => mockVerifyBindToken(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: {
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendLoginCode: vi.fn(),
  generateVerifyCode: vi.fn().mockReturnValue("123456"),
  hashVerifyCode: vi.fn().mockReturnValue("hashed-code"),
  simulateSmsSendLatency: vi.fn().mockResolvedValue(undefined),
  recordFakeSmsThrottleEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  getSubsiteProxiedClientIP: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn(),
  csrfForbiddenResponse: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendLoginCode, recordFakeSmsThrottleEntry } from "@/lib/sms";
import { rateLimit } from "@/lib/ratelimit";
import { getSubsiteProxiedClientIP } from "@/lib/client-ip";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { POST } from "@/app/api/auth/send-code/route";

const mockPrisma = prisma as unknown as {
  smsCode: {
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockSendLoginCode = sendLoginCode as ReturnType<typeof vi.fn>;
const mockRecordFakeSmsThrottleEntry = recordFakeSmsThrottleEntry as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockGetSubsiteProxiedClientIP = getSubsiteProxiedClientIP as ReturnType<typeof vi.fn>;
const mockValidateCSRF = validateCSRFToken as ReturnType<typeof vi.fn>;

function createRequest(body: unknown, extraHeaders?: Record<string, string>): NextRequest {
  // 默认不带任何 CSRF 头/Cookie/Origin，模拟小程序无 Cookie 环境（wx.request 不带 Origin）
  return new NextRequest(new URL("/api/auth/send-code", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  } as never);
}

const bindBody = { phone: "13800138000", type: "bind" };

describe("POST /api/auth/send-code type=bind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockPrisma.smsCode.findFirst.mockResolvedValue(null); // 60 秒内无发送记录
    mockPrisma.smsCode.count.mockResolvedValue(0); // 小时内未达上限
    mockPrisma.smsCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.smsCode.create.mockResolvedValue({ id: "sms-1" });
    mockSendLoginCode.mockResolvedValue({ success: true, messageId: "mock_1" });
    mockVerifyUserToken.mockResolvedValue(null);
    mockVerifyBindToken.mockResolvedValue(null);
  });

  it("type=bind 无 CSRF 头也应豁免校验并真实发码（已注册手机号）", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest(bindBody));
    const data = await res.json();

    expect(mockValidateCSRF).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 真实发码：以 type=bind 入库并调用短信通道
    expect(mockPrisma.smsCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: bindBody.phone, type: "bind" }),
      })
    );
    expect(mockSendLoginCode).toHaveBeenCalledWith(bindBody.phone, "123456");
  });

  it("type=bind 携带 Origin 头不豁免：无有效 CSRF 应 403（防浏览器跨站滥用豁免）", async () => {
    mockValidateCSRF.mockReturnValue(false);
    (csrfForbiddenResponse as ReturnType<typeof vi.fn>).mockReturnValue(
      NextResponse.json(
        { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
        { status: 403 }
      )
    );

    const res = await POST(createRequest(bindBody, { Origin: "https://evil.example.com" }));
    const data = await res.json();

    // 浏览器跨站请求必带 Origin，不享受小程序豁免，回到 CSRF 校验
    expect(mockValidateCSRF).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe("CSRF_INVALID");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("type=bind 携带 Referer 头同样不豁免：无有效 CSRF 应 403", async () => {
    mockValidateCSRF.mockReturnValue(false);
    (csrfForbiddenResponse as ReturnType<typeof vi.fn>).mockReturnValue(
      NextResponse.json(
        { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
        { status: 403 }
      )
    );

    const res = await POST(createRequest(bindBody, { Referer: "https://evil.example.com/x" }));

    expect(mockValidateCSRF).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("type=bind 携带 Origin 头但 CSRF 校验通过应正常发码", async () => {
    mockValidateCSRF.mockReturnValue(true);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      createRequest(bindBody, { Origin: "http://localhost:3000" })
    );
    const data = await res.json();

    expect(mockValidateCSRF).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendLoginCode).toHaveBeenCalledWith(bindBody.phone, "123456");
  });

  it("type=bind 未注册手机号应假发送：返回成功、不发真实短信，但写入限流占位记录", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(createRequest(bindBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 防枚举假发送：不调短信通道，但写入 used=true 占位记录
    //（冷却/小时计数对注册与未注册号码表现一致，限流层不泄露注册状态）
    expect(mockRecordFakeSmsThrottleEntry).toHaveBeenCalledWith(
      bindBody.phone,
      "bind",
      "127.0.0.1",
      5
    );
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  }, 10000);

  it("type=bind 未注册手机号 + 有效 bindToken：真实发码（修复绑定死胡同）", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockVerifyBindToken.mockResolvedValue({ openid: "o1", jti: "j1" });

    const res = await POST(createRequest({ ...bindBody, bindToken: "signed-token" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockVerifyBindToken).toHaveBeenCalledWith("signed-token");
    expect(mockSendLoginCode).toHaveBeenCalledWith(bindBody.phone, "123456");
  });

  it("type=bind 未注册手机号 + 伪造 bindToken：仍假发送（防枚举）", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockVerifyBindToken.mockResolvedValue(null);

    const res = await POST(createRequest({ ...bindBody, bindToken: "forged" }));

    expect(res.status).toBe(200);
    expect(mockSendLoginCode).not.toHaveBeenCalled();
    expect(mockRecordFakeSmsThrottleEntry).toHaveBeenCalledWith(bindBody.phone, "bind", "127.0.0.1", 5);
  });

  it("type=bind 未注册手机号 + Bearer 本人号码：真实发码（小程序关联账户）", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1", phone: bindBody.phone, status: "ACTIVE" })
      .mockResolvedValueOnce(null); // 待绑定手机号未注册
    mockVerifyUserToken.mockResolvedValue({ id: "u1" });

    const res = await POST(
      createRequest(bindBody, { Authorization: "Bearer access-token" })
    );

    expect(res.status).toBe(200);
    expect(mockSendLoginCode).toHaveBeenCalledWith(bindBody.phone, "123456");
  });

  it("type=bind Bearer 非本人号码：未注册号码仍假发送（不得借通道给任意号码发码）", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1", phone: "13900139000", status: "ACTIVE" })
      .mockResolvedValueOnce(null); // 目标号码未注册
    mockVerifyUserToken.mockResolvedValue({ id: "u1" });

    const res = await POST(
      createRequest(bindBody, { Authorization: "Bearer access-token" })
    );

    expect(res.status).toBe(200);
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("假发送与真实发送的响应体结构完全一致（防枚举 oracle）", async () => {
    // 真实发送：已注册手机号，走真实短信通道
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    const realRes = await POST(createRequest({ phone: "13800138000", type: "bind" }));
    const realData = await realRes.json();

    // 假发送：未注册手机号
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const fakeRes = await POST(createRequest({ phone: "13900139000", type: "bind" }));
    const fakeData = await fakeRes.json();

    expect(fakeRes.status).toBe(realRes.status);
    // 响应体逐字段相等（data.expiresIn，无 message 字段差异）
    expect(fakeData).toEqual(realData);
  }, 10000);

  it("type=bind 已注册手机号应真实发送（短信通道被调用）", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest(bindBody));

    expect(res.status).toBe(200);
    expect(mockSendLoginCode).toHaveBeenCalledTimes(1);
  });

  it("type=bind 60 秒频控仍生效（豁免 CSRF 不豁免限流）", async () => {
    mockPrisma.smsCode.findFirst.mockResolvedValue({
      id: "sms-recent",
      createdAt: new Date(),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest(bindBody));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.code).toBe("TOO_FREQUENT");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("type=login 无 CSRF 仍应 403（其余 type 不豁免，回归校验）", async () => {
    mockValidateCSRF.mockReturnValue(false);
    (csrfForbiddenResponse as ReturnType<typeof vi.fn>).mockReturnValue(
      NextResponse.json(
        { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
        { status: 403 }
      )
    );

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(mockValidateCSRF).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(data.error.code).toBe("CSRF_INVALID");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/send-code 生产环境短信通道守卫", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockValidateCSRF.mockReturnValue(true);
    mockPrisma.smsCode.findFirst.mockResolvedValue(null); // 60 秒内无发送记录
    mockPrisma.smsCode.count.mockResolvedValue(0); // 小时内未达上限
    mockPrisma.smsCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.smsCode.create.mockResolvedValue({ id: "sms-1" });
    mockSendLoginCode.mockResolvedValue({ success: true, messageId: "mock_1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("生产 + SMS_PROVIDER=mock：返回 503 SMS_UNAVAILABLE，不发码不入库", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "mock");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error.code).toBe("SMS_UNAVAILABLE");
    expect(data.error.message).toBe("短信服务暂不可用");
    expect(mockPrisma.smsCode.create).not.toHaveBeenCalled();
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("生产 + SMS_PROVIDER 未设置：同样返回 503 SMS_UNAVAILABLE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error.code).toBe("SMS_UNAVAILABLE");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("生产 + SMS_PROVIDER 为未知值：同样返回 503 SMS_UNAVAILABLE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "some-unknown-provider");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error.code).toBe("SMS_UNAVAILABLE");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });

  it("生产 + mock：已注册与未注册号码得到完全相同的 503 响应（防枚举口径不受影响）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "mock");

    // 守卫在手机号存在性判断之前短路：两个号码都不会触发查库
    const registeredRes = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const registeredData = await registeredRes.json();

    const unregisteredRes = await POST(createRequest({ phone: "13900139000", type: "login" }));
    const unregisteredData = await unregisteredRes.json();

    expect(registeredRes.status).toBe(503);
    expect(unregisteredRes.status).toBe(503);
    expect(unregisteredData).toEqual(registeredData);
    // 存在性查库从未发生，两种存在性天然不可区分
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("生产 + 真实 provider（aliyun）：正常发码流程不受影响", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "aliyun");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendLoginCode).toHaveBeenCalledWith("13800138000", "123456");
  });

  it("开发环境 + mock：行为不变，正常发码", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SMS_PROVIDER", "mock");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(createRequest({ phone: "13800138000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendLoginCode).toHaveBeenCalledWith("13800138000", "123456");
  });
});

describe("POST /api/auth/send-code 防枚举限流一致性回归", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockValidateCSRF.mockReturnValue(true);
    mockGetSubsiteProxiedClientIP.mockReturnValue(null);
    mockPrisma.smsCode.findFirst.mockResolvedValue(null);
    mockPrisma.smsCode.count.mockResolvedValue(0);
    mockPrisma.smsCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.smsCode.create.mockResolvedValue({ id: "sms-1" });
    mockPrisma.smsCode.deleteMany.mockResolvedValue({ count: 1 });
    mockSendLoginCode.mockResolvedValue({ success: true, messageId: "mock_1" });
    mockVerifyUserToken.mockResolvedValue(null);
    mockVerifyBindToken.mockResolvedValue(null);
  });

  it("已注册与未注册号码两次快速请求的状态码完全一致（第二次均为 429 TOO_FREQUENT）", async () => {
    mockPrisma.user.findUnique.mockImplementation(
      async (args: { where: { phone: string } }) =>
        args.where.phone === "13800138000" ? { id: "user-1" } : null
    );
    // 假发送同样写入占位记录：第二次请求两者都命中 60 秒冷却
    mockPrisma.smsCode.findFirst
      .mockResolvedValueOnce(null) // 已注册 第 1 次
      .mockResolvedValueOnce({ id: "sms-r2", createdAt: new Date() }) // 已注册 第 2 次
      .mockResolvedValueOnce(null) // 未注册 第 1 次
      .mockResolvedValueOnce({ id: "sms-u2", createdAt: new Date() }); // 未注册 第 2 次

    const r1 = await POST(createRequest({ phone: "13800138000", type: "bind" }));
    const r2 = await POST(createRequest({ phone: "13800138000", type: "bind" }));
    const u1 = await POST(createRequest({ phone: "13900139000", type: "bind" }));
    const u2 = await POST(createRequest({ phone: "13900139000", type: "bind" }));

    expect(r1.status).toBe(u1.status);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(u2.status);
    expect(r2.status).toBe(429);
    expect((await r2.json()).error.code).toBe("TOO_FREQUENT");
    expect((await u2.json()).error.code).toBe("TOO_FREQUENT");
  });

  it("假发送写入 used=true 限流占位记录（recordFakeSmsThrottleEntry），不发真实短信", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(createRequest({ phone: "13900139000", type: "login" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, data: { expiresIn: 300 } });
    expect(mockRecordFakeSmsThrottleEntry).toHaveBeenCalledWith(
      "13900139000",
      "login",
      "127.0.0.1",
      5
    );
    expect(mockSendLoginCode).not.toHaveBeenCalled();
    // 占位记录由 recordFakeSmsThrottleEntry 内部写入（used=true 断言见 sms.test.ts）
    expect(mockPrisma.smsCode.create).not.toHaveBeenCalled();
  });

  it("子站代理凭证有效：限流键与 SmsCode.ipAddress 均使用透传的客户端 IP", async () => {
    mockGetSubsiteProxiedClientIP.mockReturnValue("203.0.113.5");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      createRequest(bindBody, {
        "x-subsite-proxy-key": "subsite-secret",
        "x-forwarded-for": "203.0.113.5",
      })
    );

    expect(res.status).toBe(200);
    expect(mockRateLimit).toHaveBeenCalledWith("203.0.113.5", "form");
    expect(mockRateLimit).toHaveBeenCalledWith("sms-ip:203.0.113.5", "sms-daily-ip");
    expect(mockPrisma.smsCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipAddress: "203.0.113.5" }),
      })
    );
  });

  it("子站代理凭证无效/缺失：忽略 XFF，回退到连接层 IP", async () => {
    mockGetSubsiteProxiedClientIP.mockReturnValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      createRequest(bindBody, { "x-forwarded-for": "203.0.113.5" })
    );

    expect(res.status).toBe(200);
    expect(mockRateLimit).toHaveBeenCalledWith("127.0.0.1", "form");
    expect(mockRateLimit).toHaveBeenCalledWith("sms-ip:127.0.0.1", "sms-daily-ip");
    expect(mockPrisma.smsCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipAddress: "127.0.0.1" }),
      })
    );
  });

  it("运营商发送失败：删除已入库行（deleteMany），立即重发不受 60 秒冷却阻塞", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockSendLoginCode.mockResolvedValueOnce({ success: false, error: "运营商故障" });

    const res1 = await POST(createRequest(bindBody));
    const data1 = await res1.json();

    expect(res1.status).toBe(500);
    expect(data1.error.code).toBe("SMS_FAILED");
    expect(mockPrisma.smsCode.deleteMany).toHaveBeenCalledWith({
      where: { phone: bindBody.phone, type: "bind", used: false },
    });

    // 失败后行已删除：立即重发时冷却查询无记录，可正常发码
    const res2 = await POST(createRequest(bindBody));
    expect(res2.status).toBe(200);
    expect(mockSendLoginCode).toHaveBeenCalledTimes(2);
  });

  it("手机号每日上限（sms-daily-phone）超限应返回 429 RATE_LIMITED", async () => {
    mockRateLimit.mockImplementation(async (_key: string, preset: string) =>
      preset === "sms-daily-phone" ? { success: false } : { success: true }
    );

    const res = await POST(createRequest(bindBody));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.code).toBe("RATE_LIMITED");
    expect(mockRateLimit).toHaveBeenCalledWith(`sms-phone:${bindBody.phone}`, "sms-daily-phone");
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  });
});
