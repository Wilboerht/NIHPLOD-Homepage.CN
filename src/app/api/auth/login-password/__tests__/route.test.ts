/**
 * POST /api/auth/login-password 路由测试（审计顺序修复）
 * 覆盖：密码过期时不得先写入 success 登录记录（先查过期，后记成功）；
 *       正常登录仍记录 success 并清除失败记录
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/jwt", () => ({
  signUserToken: vi.fn().mockResolvedValue("access-token"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token"),
}));

vi.mock("@/lib/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/password")>();
  return { ...actual, verifyPassword: vi.fn() };
});

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

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { recordLoginAttempt } from "@/lib/auth-security";
import { POST } from "@/app/api/auth/login-password/route";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockVerifyPassword = verifyPassword as ReturnType<typeof vi.fn>;
const mockRecordLoginAttempt = recordLoginAttempt as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/auth/login-password", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const loginBody = { phone: "13800138000", password: "Abc12345!" };
const activeUser = {
  id: "user-1",
  phone: "13800138000",
  nickname: "测试用户",
  avatar: null,
  status: "ACTIVE",
  password: "hashed-pw",
  passwordExpiresAt: null,
};

describe("POST /api/auth/login-password 审计顺序", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(activeUser);
    mockVerifyPassword.mockResolvedValue(true);
  });

  it("密码过期：返回 403 PASSWORD_EXPIRED，且不写入 success 登录记录", async () => {
    mockUserFindUnique.mockResolvedValue({
      ...activeUser,
      passwordExpiresAt: new Date(Date.now() - 1000), // 已过期
    });

    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe("PASSWORD_EXPIRED");
    // 关键断言：未实际登录成功，审计中不得出现 success 记录
    expect(mockRecordLoginAttempt).not.toHaveBeenCalledWith(
      loginBody.phone,
      true,
      expect.anything(),
      undefined,
      "password",
      "user-1"
    );
    expect(mockRecordLoginAttempt).not.toHaveBeenCalled();
  });

  it("密码未过期：正常登录并记录 success（顺序在过期检查之后）", async () => {
    const res = await POST(createRequest(loginBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      loginBody.phone,
      true,
      expect.anything(),
      undefined,
      "password",
      "user-1"
    );
    // 新 refresh token 不携带明文手机号 claim
    const { signRefreshToken } = await import("@/lib/jwt");
    expect(signRefreshToken).toHaveBeenCalledWith({ id: "user-1" });
  });

  it("密码错误：记录失败尝试（锁定池口径不变）", async () => {
    mockVerifyPassword.mockResolvedValue(false);

    const res = await POST(createRequest(loginBody));

    expect(res.status).toBe(400);
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      loginBody.phone,
      false,
      expect.anything(),
      "password_incorrect",
      "password"
    );
  });
});
