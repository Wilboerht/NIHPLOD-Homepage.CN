/**
 * POST /api/auth/reset-password 路由测试（验证码防爆破）
 * 覆盖：错误验证码递增单码失败计数（attempts）+ 账户级失败记录、
 *       查询带 attempts 上限过滤、无可用码统一 CODE_INVALID
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    oAuthSession: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-security", () => ({
  checkAccountLockout: vi.fn().mockResolvedValue({ locked: false }),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  clearLoginAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedNotification: vi.fn().mockResolvedValue(undefined),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/password-policy", () => ({
  updateUserPassword: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
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
import { POST } from "@/app/api/auth/reset-password/route";

const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;
const mockRecordSmsCodeFailure = recordSmsCodeFailure as ReturnType<typeof vi.fn>;
const mockRecordLoginAttempt = recordLoginAttempt as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/auth/reset-password", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const resetBody = {
  phone: "13800138000",
  code: "123456",
  password: "Abc12345!",
  confirmPassword: "Abc12345!",
};

describe("POST /api/auth/reset-password 验证码防爆破", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmsFindFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash" });
    mockSmsUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("验证码错误应返回 CODE_INVALID 并递增单码失败计数", async () => {
    mockVerifyCode.mockReturnValue(false);

    const res = await POST(createRequest(resetBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockRecordSmsCodeFailure).toHaveBeenCalledWith("sms-1");
    // 账户级失败记录保留（与既有锁定逻辑叠加）
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      resetBody.phone,
      false,
      expect.anything(),
      "code_invalid",
      "sms"
    );
    // 不核销验证码
    expect(mockSmsUpdateMany).not.toHaveBeenCalled();
  });

  it("查询可用验证码时应带 attempts 上限过滤", async () => {
    mockSmsFindFirst.mockResolvedValue(null);

    await POST(createRequest(resetBody));

    expect(mockSmsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: resetBody.phone,
          type: "reset",
          used: false,
          attempts: { lt: 5 },
        }),
      })
    );
  });

  it("无可用验证码（含已达 attempts 上限）应统一返回 CODE_INVALID", async () => {
    mockSmsFindFirst.mockResolvedValue(null);

    const res = await POST(createRequest(resetBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockRecordSmsCodeFailure).not.toHaveBeenCalled();
  });
});
