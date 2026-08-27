/**
 * 用户系统第三轮修复 · 认证路由测试
 * 覆盖：
 * - register：手机号查重后置到验证码校验之后（防注册枚举 oracle）、
 *   验证码失败统一错误码且不计锁定池
 * - logout：单设备登出无 clientId 不广播 OAuth、allDevices 才全量广播
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
    oAuthSession: { findMany: vi.fn(), updateMany: vi.fn() },
    refreshToken: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma)
  );
  return { prisma };
});

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
  CSRF_COOKIE_NAME: "__Host-csrf_token",
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn().mockReturnValue(true),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/password-policy", () => ({
  recordPasswordHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({}),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  checkAccountLockout: vi.fn().mockResolvedValue({ locked: false }),
  clearLoginAttempts: vi.fn().mockResolvedValue(undefined),
  revokeRefreshToken: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/token-blacklist", () => ({
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { recordLoginAttempt } from "@/lib/auth-security";
import { verifyUserAuth } from "@/lib/auth";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockSessionFindMany = prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>;
const mockSessionUpdateMany = prisma.oAuthSession.updateMany as ReturnType<typeof vi.fn>;
const mockRtFindFirst = prisma.refreshToken.findFirst as ReturnType<typeof vi.fn>;
const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockBackchannel = sendBackchannelLogout as ReturnType<typeof vi.fn>;

function createJsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  } as never);
}

const registerBody = {
  phone: "13800138000",
  code: "123456",
  password: "Abc12345!",
  confirmPassword: "Abc12345!",
};

describe("POST /api/auth/register（第三轮修复）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("手机号已注册但无有效验证码时返回 CODE_INVALID 而非 PHONE_EXISTS（防枚举 oracle）", async () => {
    // 攻击者无有效验证码：已注册号码也不得通过 409/400 差异暴露存在性
    mockSmsFindFirst.mockResolvedValueOnce(null);

    const res = await registerPost(createJsonRequest("/api/auth/register", registerBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    // 查重不得先于验证码校验执行
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("手机号已注册且验证码有效时，查重兜底返回 PHONE_EXISTS", async () => {
    // 验证码通过 + 核销成功后才执行查重（防御性分支，正常流程被 send-code 假发送拦截）
    mockSmsFindFirst.mockResolvedValueOnce({ id: "sms-1", codeHash: "hash" });
    mockSmsUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockUserFindUnique.mockResolvedValueOnce({ id: "user-existing" });

    const res = await registerPost(createJsonRequest("/api/auth/register", registerBody));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("PHONE_EXISTS");
    // 验证码已核销后才查重
    expect(mockSmsUpdateMany).toHaveBeenCalled();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { phone: registerBody.phone },
      select: { id: true },
    });
  });

  it("验证码不存在应统一返回 CODE_INVALID 且不计入账户锁定池", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockSmsFindFirst.mockResolvedValueOnce(null);

    const res = await registerPost(createJsonRequest("/api/auth/register", registerBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(data.error.message).toBe("验证码错误或已过期");
    // 反零门槛锁号：验证码类失败不计入 lockout 池
    expect(recordLoginAttempt).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout（第三轮修复）", () => {
  const cookieHeader = { cookie: `${USER_REFRESH_COOKIE_NAME}=current-rt` };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      jti: "jti-1",
    });
  });

  it("单设备登出且当前会话无 clientId 时，不应广播/撤销其他 OAuth 会话", async () => {
    mockSessionFindMany.mockResolvedValueOnce([{ clientId: "client-1" }]);
    // 当前 refresh token 记录无 OAuth client（普通浏览器登录）
    mockRtFindFirst.mockResolvedValueOnce({ clientId: null });

    const res = await logoutPost(createJsonRequest("/api/auth/logout", {}, cookieHeader));

    expect(res.status).toBe(200);
    // 不触碰其他客户端的第三方授权会话
    expect(mockBackchannel).not.toHaveBeenCalled();
    expect(mockSessionUpdateMany).not.toHaveBeenCalled();
  });

  it("allDevices 登出应广播所有活跃 OAuth client 并撤销全部会话", async () => {
    mockSessionFindMany.mockResolvedValueOnce([
      { clientId: "client-1" },
      { clientId: "client-2" },
      { clientId: "client-1" },
    ]);

    const res = await logoutPost(
      createJsonRequest("/api/auth/logout", { allDevices: true }, cookieHeader)
    );

    expect(res.status).toBe(200);
    expect(mockBackchannel).toHaveBeenCalledWith("user-1", ["client-1", "client-2"]);
    expect(mockSessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("单设备登出且当前会话关联 OAuth client 时，仅撤销该 client 会话", async () => {
    mockSessionFindMany.mockResolvedValueOnce([
      { clientId: "client-1" },
      { clientId: "client-2" },
    ]);
    mockRtFindFirst.mockResolvedValueOnce({ clientId: "client-1" });

    const res = await logoutPost(createJsonRequest("/api/auth/logout", {}, cookieHeader));

    expect(res.status).toBe(200);
    expect(mockBackchannel).toHaveBeenCalledWith("user-1", ["client-1"]);
    expect(mockSessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
