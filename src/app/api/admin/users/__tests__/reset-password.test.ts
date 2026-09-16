/**
 * 管理端重置用户密码路由测试
 * POST /api/admin/users/[id]/reset-password
 *
 * 覆盖：
 * - 未授权 401 / 非 owner 403
 * - 用户不存在 404
 * - 成功：生成符合密码策略的临时密码、强制下线全部会话、写审计 user_password_reset
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    oAuthSession: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: () =>
    NextResponse.json({ success: false, error: { code: "INVALID_ID" } }, { status: 400 }),
}));

vi.mock("@/lib/password-policy", () => ({
  updateUserPassword: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../[id]/reset-password/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { updateUserPassword } from "@/lib/password-policy";
import { blacklistUserTokens } from "@/lib/token-blacklist";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest() {
  return new NextRequest("http://localhost/api/admin/users/user-1/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  } as never);
}

const context = { params: Promise.resolve({ id: "user-1" }) };

describe("POST /api/admin/users/[id]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      phone: "13800000000",
      status: "ACTIVE",
    });
    vi.mocked(updateUserPassword).mockResolvedValue({ success: true });
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null);
    const res = await POST(createRequest(), context);
    expect(res.status).toBe(401);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await POST(createRequest(), context);
    expect(res.status).toBe(403);
    expect(updateUserPassword).not.toHaveBeenCalled();
  });

  it("用户不存在返回 404", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest(), context);
    expect(res.status).toBe(404);
  });

  it("成功重置：临时密码符合策略、会话被撤销并写审计", async () => {
    const res = await POST(createRequest(), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    const temp = data.data.tempPassword as string;
    expect(temp).toHaveLength(16);
    expect(/[A-Z]/.test(temp)).toBe(true);
    expect(/[a-z]/.test(temp)).toBe(true);
    expect(/[0-9]/.test(temp)).toBe(true);

    expect(updateUserPassword).toHaveBeenCalledWith("user-1", temp, { skipHistoryCheck: true });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null } })
    );
    expect(blacklistUserTokens).toHaveBeenCalledWith("user-1", expect.any(String));
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_password_reset",
        targetType: "user",
        targetId: "user-1",
      })
    );
  });
});
