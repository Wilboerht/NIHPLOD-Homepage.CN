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
  createAuditLog: vi.fn().mockResolvedValue(true),
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
vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

// === Mock webhook ===
vi.mock("@/lib/webhook", () => ({
  dispatchStatusChangeWebhook: vi.fn().mockResolvedValue(undefined),
  getStatusChangeWebhookTargets: vi.fn().mockReturnValue([]),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { blacklistUserTokens, removeFromBlacklist } from "@/lib/token-blacklist";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { dispatchStatusChangeWebhook } from "@/lib/webhook";

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
  });

  it("非 owner 角色应返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...OWNER, role: "admin" } as never);

    const res = await POST(createRequest({ ids: ["u1"], status: "BANNED" }));
    expect(res.status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("参数错误应返回 400", async () => {
    const res = await POST(createRequest({ ids: [], status: "BANNED" }));
    expect(res.status).toBe(400);
  });

  it("批量封禁应对每个状态变更的用户执行完整级联", async () => {
    // user-1 ACTIVE → BANNED（需级联）；user-2 已是 BANNED（跳过）；user-3 不存在
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "user-1", status: "ACTIVE" },
      { id: "user-2", status: "BANNED" },
    ]);
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.oAuthSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { clientId: "client-a", sessionId: "sid-1" },
    ]);

    const res = await POST(createRequest({ ids: ["user-1", "user-2", "user-3"], status: "BANNED" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // 仅实际变更 1 个用户
    expect(data.data.updated).toBe(1);

    // updateMany 只针对状态变更的用户
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["user-1"] } }, data: { status: "BANNED" } })
    );
    // 撤销 Refresh Token
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null } })
    );
    // 加入 access token 黑名单
    expect(blacklistUserTokens).toHaveBeenCalledWith("user-1", "账号已被永久封禁");
    // 撤销 OAuth 会话 + backchannel logout（携带 sid）
    expect(prisma.oAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null } })
    );
    expect(sendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-a"], {
      includeInactive: true,
      sids: { "client-a": "sid-1" },
    });
    // webhook 推送状态变更
    expect(dispatchStatusChangeWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", oldStatus: "ACTIVE", newStatus: "BANNED" }),
      expect.anything()
    );
    // SSO 事件仅针对实际变更的用户
    expect(recordSsoEvent).toHaveBeenCalledTimes(1);
    expect(recordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "status_change",
        userId: "user-1",
        detail: expect.objectContaining({ action: "user_banned", batch: true }),
      })
    );
    // 汇总审计一条
    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_status_change",
        detail: expect.objectContaining({ status: "BANNED", count: 1 }),
      })
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
    expect(removeFromBlacklist).toHaveBeenCalledTimes(2);
    expect(blacklistUserTokens).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.oAuthSession.updateMany).not.toHaveBeenCalled();
    // 解封也推送 webhook
    expect(dispatchStatusChangeWebhook).toHaveBeenCalledTimes(2);
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
    expect(blacklistUserTokens).not.toHaveBeenCalled();
    // 仍保留一条汇总审计
    expect(createAuditLog).toHaveBeenCalledTimes(1);
  });
});
