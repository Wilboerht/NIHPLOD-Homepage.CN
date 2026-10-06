/**
 * PUT /api/admin/me 管理员自助改密账户级限次测试
 *
 * 覆盖（防爆破隔离 scope）：
 * - 连续 5 次旧密码错误后，第 6 次请求被账户级锁定拦截（429），不再执行 bcrypt 比对
 * - 改密成功时清除该 scope 的失败记录
 * - scope 为 admin_password:{email}，与管理员登录锁定桶隔离
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    admin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) =>
    (request: unknown, context: unknown) => handler(request, context),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/password", () => ({
  passwordSchema: z.string().min(8),
  hashPassword: vi.fn().mockResolvedValue("hashed-new-password"),
}));

vi.mock("@/lib/auth-security", () => ({
  checkAccountLockout: vi.fn(),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
  clearLoginAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistAdminTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { PUT } from "../route";
import { prisma } from "@/lib/prisma";
import { checkAccountLockout, recordLoginAttempt, clearLoginAttempts } from "@/lib/auth-security";
import bcrypt from "bcryptjs";

const ADMIN = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  role: "ops",
  permissionOverrides: [],
};
const SCOPE_ID = `admin_password:${ADMIN.email}`;

const mockCheckLockout = checkAccountLockout as ReturnType<typeof vi.fn>;
const mockRecordAttempt = recordLoginAttempt as ReturnType<typeof vi.fn>;
const mockClearAttempts = clearLoginAttempts as ReturnType<typeof vi.fn>;
const mockCompare = bcrypt.compare as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.admin.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.admin.update as ReturnType<typeof vi.fn>;

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/me", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("PUT /api/admin/me 自助改密限次", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ password: "hashed-current-password" });
    mockUpdate.mockResolvedValue({ ...ADMIN });
    mockCheckLockout.mockResolvedValue({
      locked: false,
      remainingMinutes: 0,
      failedAttempts: 0,
      maxAttempts: 5,
    });
  });

  it("连续旧密码错误达上限后，下一次请求返回 429 且不再执行 bcrypt 比对", async () => {
    mockCompare.mockResolvedValue(false);

    // 前 5 次：未锁定 → 执行比对 → 失败并记录（隔离 scope：admin_password:{email}）
    for (let i = 0; i < 5; i++) {
      const res = await PUT(
        createRequest({ currentPassword: "WrongPass1", newPassword: "NewPassw0rd1" }),
        ADMIN as never
      );
      expect(res.status).toBe(400);
      expect(mockRecordAttempt).toHaveBeenLastCalledWith(
        SCOPE_ID,
        false,
        expect.anything(),
        "password_incorrect",
        "admin"
      );
    }
    expect(mockCompare).toHaveBeenCalledTimes(5);

    // 第 6 次：账户已锁定 → 429，且不再触碰 bcrypt
    mockCheckLockout.mockResolvedValue({
      locked: true,
      remainingMinutes: 12,
      failedAttempts: 5,
      maxAttempts: 5,
    });
    const res = await PUT(
      createRequest({ currentPassword: "WrongPass1", newPassword: "NewPassw0rd1" }),
      ADMIN as never
    );
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.code).toBe("ACCOUNT_LOCKED");
    expect(data.error.message).toContain("12 分钟");
    expect(mockCompare).toHaveBeenCalledTimes(5);
  });

  it("旧密码校验通过：改密成功并清除该 scope 的失败记录", async () => {
    mockCompare.mockResolvedValue(true);

    const res = await PUT(
      createRequest({ currentPassword: "OldPassw0rd", newPassword: "NewPassw0rd1" }),
      ADMIN as never
    );

    expect(res.status).toBe(200);
    expect(mockClearAttempts).toHaveBeenCalledWith(SCOPE_ID);
    expect(mockRecordAttempt).not.toHaveBeenCalled();
  });

  it("锁定检查使用独立 scope（admin_password:），与登录锁定桶隔离", async () => {
    mockCompare.mockResolvedValue(true);

    await PUT(
      createRequest({ currentPassword: "OldPassw0rd", newPassword: "NewPassw0rd1" }),
      ADMIN as never
    );

    expect(mockCheckLockout).toHaveBeenCalledWith(SCOPE_ID);
  });
});
