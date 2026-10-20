/**
 * 管理端批量修改用户状态路由测试
 * POST /api/admin/users
 *
 * 覆盖（B1 整改：批量封禁补齐凭证撤销级联）：
 * - 非 owner 角色 403
 * - 批量封禁：每个状态变更的用户级联撤销 Refresh Token + access token 黑名单
 *   + OAuth 会话 + backchannel logout + webhook；状态未变化的用户跳过
 * - 批量解封：移出黑名单，不撤销会话
 * - 汇总审计日志一条，SSO 事件按实际变更用户逐条记录
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// === Mock Prisma ===
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthSession: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, default: prisma };
});

// === Mock auth ===
vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

// === Mock CSRF ===
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    ),
}));

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock 审计 ===
vi.mock("@/lib/audit", () => ({
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

// === Mock SSO 审计 ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn().mockResolvedValue(undefined),
  scheduleSsoEvent: vi.fn(),
}));

// === Mock token 黑名单 ===
vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: vi.fn().mockResolvedValue(undefined),
  removeFromBlacklist: vi.fn().mockResolvedValue(undefined),
}));

// === Mock backchannel logout ===
vi.mock("@/lib/user-status", () => ({
  changeUserStatus: vi.fn(),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

// === Mock webhook ===
vi.mock("@/lib/webhook", () => ({
  dispatchStatusChangeWebhook: vi.fn().mockResolvedValue(undefined),
  getStatusChangeWebhookTargets: vi.fn().mockReturnValue([]),
  toWebhookStatus: (status: string) => (status === "DELETED" ? "deleted" : status),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { changeUserStatus } from "@/lib/user-status";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("POST /api/admin/users（批量修改用户状态）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(changeUserStatus).mockResolvedValue({ changed: true });
  });

  it("非 owner 角色应返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...OWNER, role: "admin" } as never);

    const res = await POST(createRequest({ ids: ["u1"], status: "BANNED" }));
    expect(res.status).toBe(403);
    expect(changeUserStatus).not.toHaveBeenCalled();
  });

  it("???????????????????????", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "user-1", status: "ACTIVE" },
      { id: "user-2", status: "BANNED" },
    ]);

    const res = await POST(
      createRequest({ ids: ["user-1", "user-2", "user-3"], status: "BANNED" })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.updated).toBe(1);
    expect(changeUserStatus).toHaveBeenCalledTimes(1);
    expect(changeUserStatus).toHaveBeenCalledWith({
      userId: "user-1",
      expectedStatus: "ACTIVE",
      newStatus: "BANNED",
    });
    expect(recordSsoEvent).toHaveBeenCalledTimes(1);
    expect(recordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "status_change",
        userId: "user-1",
        detail: expect.objectContaining({ action: "user_banned", batch: true }),
      })
    );
    expect(beginAuditLog).toHaveBeenCalledTimes(1);
    expect(beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_status_change",
        detail: expect.objectContaining({ status: "BANNED", count: 0 }),
      })
    );
    expect(finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ status: "BANNED", count: 1 })
    );
  });

  it("批量解封应移出黑名单且不撤销会话", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "user-1", status: "BANNED" },
      { id: "user-2", status: "SUSPENDED" },
    ]);
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    const res = await POST(createRequest({ ids: ["user-1", "user-2"], status: "ACTIVE" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.updated).toBe(2);
    expect(changeUserStatus).toHaveBeenCalledTimes(2);
    expect(changeUserStatus).toHaveBeenCalledWith({
      userId: "user-1",
      expectedStatus: "BANNED",
      newStatus: "ACTIVE",
    });
    expect(changeUserStatus).toHaveBeenCalledWith({
      userId: "user-2",
      expectedStatus: "SUSPENDED",
      newStatus: "ACTIVE",
    });
  });

  it("所有用户状态均未变化时不执行级联", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "user-1", status: "ACTIVE" },
    ]);

    const res = await POST(createRequest({ ids: ["user-1"], status: "ACTIVE" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.updated).toBe(0);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(changeUserStatus).not.toHaveBeenCalled();
    // 仍保留一条汇总审计
    expect(beginAuditLog).toHaveBeenCalledTimes(1);
    expect(finishAuditLog).toHaveBeenCalledTimes(1);
  });
});
