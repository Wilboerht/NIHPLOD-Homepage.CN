/**
 * POST /api/auth/send-code 路由测试（type=bind 通道）
 * 覆盖：type=bind 无 Origin 豁免 CSRF（小程序 wx.request 不携带来源头）；
 *       携带 Origin/Referer 的 bind 请求不豁免（浏览器跨站必带 Origin，仍走 CSRF 校验）；
 *       未注册手机号假发送（防枚举）；已注册真实发码；60 秒频控仍生效；
 *       其余 type 回归（无 CSRF 仍 403）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: {
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendLoginCode: vi.fn(),
  generateVerifyCode: vi.fn().mockReturnValue("123456"),
  hashVerifyCode: vi.fn().mockReturnValue("hashed-code"),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
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
import { sendLoginCode } from "@/lib/sms";
import { rateLimit } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { POST } from "@/app/api/auth/send-code/route";

const mockPrisma = prisma as unknown as {
  smsCode: {
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockSendLoginCode = sendLoginCode as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
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

  it("type=bind 未注册手机号应假发送：返回成功但不发码不入库", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(createRequest(bindBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 防枚举假发送：不写库、不调短信通道、不记审计
    expect(mockPrisma.smsCode.create).not.toHaveBeenCalled();
    expect(mockSendLoginCode).not.toHaveBeenCalled();
  }, 10000);

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
