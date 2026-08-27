/**
 * POST /api/auth/register 路由测试（注册枚举 oracle 修复）
 * 覆盖：手机号查重移至验证码校验之后 —— 无有效验证码时已注册号码同样返回
 *       CODE_INVALID（而非 409 PHONE_EXISTS），与 send-code 假发送防枚举口径一致；
 *       验证码通过后查重仍兜底返回 PHONE_EXISTS；新号码正常注册
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockTxUserFindUnique = vi.fn();
const mockTxUserCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsCode: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({ user: { findUnique: mockTxUserFindUnique, create: mockTxUserCreate } })
    ),
  },
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
}));

vi.mock("@/lib/auth-security", () => ({
  saveRefreshToken: vi.fn().mockResolvedValue(undefined),
  extractDeviceInfo: vi.fn().mockReturnValue({}),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  checkAccountLockout: vi.fn().mockResolvedValue({ locked: false }),
  clearLoginAttempts: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/lib/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/password")>();
  return { ...actual, hashPassword: vi.fn().mockResolvedValue("hashed-pw") };
});

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

vi.mock("@/lib/password-policy", () => ({
  recordPasswordHistory: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/sms";
import { POST } from "@/app/api/auth/register/route";

const mockSmsFindFirst = prisma.smsCode.findFirst as ReturnType<typeof vi.fn>;
const mockSmsUpdateMany = prisma.smsCode.updateMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockVerifyCode = verifyCode as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/auth/register", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const registerBody = {
  phone: "13800138000",
  code: "123456",
  password: "Abc12345!",
  confirmPassword: "Abc12345!",
};

describe("POST /api/auth/register 防枚举（查重后置）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmsFindFirst.mockResolvedValue({ id: "sms-1", codeHash: "hash" });
    mockSmsUpdateMany.mockResolvedValue({ count: 1 });
    mockVerifyCode.mockReturnValue(true);
    mockTxUserFindUnique.mockResolvedValue(null);
    mockTxUserCreate.mockResolvedValue({
      id: "user-1",
      phone: registerBody.phone,
      nickname: null,
      avatar: null,
    });
  });

  it("已注册手机号 + 无有效验证码：返回 CODE_INVALID 而非 PHONE_EXISTS（消除枚举 oracle）", async () => {
    // 攻击者无有效验证码：已注册号码也不得暴露存在性
    mockUserFindUnique.mockResolvedValue({ id: "user-existing" });
    mockSmsFindFirst.mockResolvedValue(null); // 无可用验证码

    const res = await POST(createRequest(registerBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    // 查重不得先于验证码校验执行
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("已注册手机号 + 验证码错误：同样返回 CODE_INVALID，不触发查重", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-existing" });
    mockVerifyCode.mockReturnValue(false);

    const res = await POST(createRequest(registerBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("CODE_INVALID");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("已注册手机号 + 有效验证码：查重兜底返回 PHONE_EXISTS（防御性分支）", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-existing" });

    const res = await POST(createRequest(registerBody));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("PHONE_EXISTS");
    // 验证码已核销后才执行查重
    expect(mockSmsUpdateMany).toHaveBeenCalled();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { phone: registerBody.phone },
      select: { id: true },
    });
  });

  it("未注册手机号 + 有效验证码：注册成功并签发双 Token（refresh token 不带 phone）", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(createRequest(registerBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.isNewUser).toBe(true);

    const { signRefreshToken } = await import("@/lib/jwt");
    expect(signRefreshToken).toHaveBeenCalledWith({ id: "user-1" });
    expect(signRefreshToken).toHaveBeenCalledWith(
      expect.not.objectContaining({ phone: expect.anything() })
    );
  });
});
