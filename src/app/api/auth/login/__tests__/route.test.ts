/**
 * POST /api/auth/login 路由测试（验证码防爆破）
 * 覆盖：错误验证码递增单码失败计数（attempts）、查询带 attempts 上限过滤、
 *       核销竞争失败统一 CODE_INVALID、成功路径正常核销
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
}));

vi.mock("@/lib/auth-security", () => ({
  checkAccountLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  clearLoginAttempts: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { verifyCode, recordSmsCodeFailure } from "@/lib/sms";
import { recordLoginAttempt } from "@/lib/auth-security";
import { POST } from "@/app/api/auth/login/route";

const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;
const mockRecordSmsCodeFailure = recordSmsCodeFailure as ReturnType<typeof vi.fn>;
const mockRecordLoginAttempt = recordLoginAttempt as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/auth/login", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const loginBody = { phone: "13800138000", code: "123456" };
const activeUser = {
  id: "user-1",
  phone: "13800138000",
  nickname: "测试用户",
  avatar: null,
  status: "ACTIVE",
  phoneVerified: true,
  passwordExpiresAt: null,
};

describe("POST /api/auth/login 验证码防爆破", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmsFindFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash" });
    mockSmsUpdateMany.mockResolvedValue({ count: 1 });
    mockUserFindUnique.mockResolvedValue(activeUser);
  });

  it("验证码错误应返回 CODE_INVALID 并递增单码失败计数", async () => {
    mockVerifyCode.mockReturnValue(false);

    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    // 单码失败计数：交给 sms 模块递增 attempts（达到上限作废）
    expect(mockRecordSmsCodeFailure).toHaveBeenCalledWith("sms-1");
    // 账户级失败记录保留（与既有锁定逻辑叠加）
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      loginBody.phone,
      false,
      expect.anything(),
      "code_invalid",
      "sms"
    );
    // 不核销验证码
    expect(mockSmsUpdateMany).not.toHaveBeenCalled();
  });

  it("查询可用验证码时应带 attempts 上限过滤（已作废/超限码不参与校验）", async () => {
    mockVerifyCode.mockReturnValue(true);

    await POST(createRequest(loginBody));

    expect(mockSmsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: loginBody.phone,
          type: "login",
          used: false,
          attempts: { lt: 5 },
        }),
      })
    );
  });

  it("无可用验证码（含已达 attempts 上限）应统一返回 CODE_INVALID", async () => {
    mockSmsFindFirst.mockResolvedValue(null);

    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockRecordSmsCodeFailure).not.toHaveBeenCalled();
  });

  it("核销竞争失败（并发已使用）应返回 CODE_INVALID", async () => {
    mockVerifyCode.mockReturnValue(true);
    mockSmsUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
  });

  it("验证码正确应核销并登录成功（不触发失败计数）", async () => {
    mockVerifyCode.mockReturnValue(true);

    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRecordSmsCodeFailure).not.toHaveBeenCalled();
    expect(mockSmsUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "sms-1", used: false }) })
    );
  });
});
