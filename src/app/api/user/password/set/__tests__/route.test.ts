/**
 * POST /api/user/password/set 路由测试（验证码防爆破）
 * 覆盖：错误验证码递增单码失败计数（attempts）、查询带 attempts 上限过滤、
 *       无可用码统一 CODE_INVALID、成功路径不触发失败计数
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { UserJWTPayload } from "@/types/auth";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  // 直接以内置用户身份调用 handler，跳过真实 JWT 校验
  withUserAuth:
    (handler: (request: NextRequest, user: UserJWTPayload) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request, { id: "user-1", type: "user" } as UserJWTPayload),
}));

vi.mock("@/lib/sms", () => ({
  verifyCode: vi.fn(),
  recordSmsCodeFailure: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedNotification: vi.fn().mockResolvedValue(undefined),
  SMS_CODE_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/password-policy", () => ({
  updateUserPassword: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
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
import { POST } from "@/app/api/user/password/set/route";

const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;
const mockRecordSmsCodeFailure = recordSmsCodeFailure as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/user/password/set", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const setBody = { code: "123456", password: "Abc12345!", confirmPassword: "Abc12345!" };
const noPasswordUser = { id: "user-1", phone: "13800138000", password: null };

describe("POST /api/user/password/set 验证码防爆破", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(noPasswordUser);
    mockSmsFindFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash" });
    mockSmsUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("验证码错误应返回 CODE_INVALID 并递增单码失败计数", async () => {
    mockVerifyCode.mockReturnValue(false);

    const res = await POST(createRequest(setBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockRecordSmsCodeFailure).toHaveBeenCalledWith("sms-1");
    // 不核销验证码
    expect(mockSmsUpdateMany).not.toHaveBeenCalled();
  });

  it("查询可用验证码时应带 attempts 上限过滤", async () => {
    mockSmsFindFirst.mockResolvedValue(null);

    await POST(createRequest(setBody));

    expect(mockSmsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: noPasswordUser.phone,
          type: "reset",
          used: false,
          attempts: { lt: 5 },
        }),
      })
    );
  });

  it("无可用验证码（含已达 attempts 上限）应统一返回 CODE_INVALID", async () => {
    mockSmsFindFirst.mockResolvedValue(null);

    const res = await POST(createRequest(setBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockRecordSmsCodeFailure).not.toHaveBeenCalled();
  });

  it("验证码正确应核销并设置密码成功（不触发失败计数）", async () => {
    mockVerifyCode.mockReturnValue(true);

    const res = await POST(createRequest(setBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRecordSmsCodeFailure).not.toHaveBeenCalled();
  });
});
