/**
 * 管理端删除用户测试（DELETE /api/admin/users/:id）
 *
 * 口径：与自助注销共用同一执行器（executeAccountDeletion）——路由负责守卫
 * （CSRF/权限/频控/404/执行中竞态）与审计，执行器负责匿名化与 PII 清理。
 * 覆盖：404 / 已注销 409 / 执行中 409 / 执行失败 502（转人工队列）/
 *       成功路径（upsert 建单 + 同步执行 + 审计与 SSO 事件）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    accountDeletionRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/user-status", () => ({
  cascadeUserStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth-security", () => ({
  hashIdentifier: (s: string) => `hmac-${s}`,
}));

vi.mock("@/lib/account-deletion", () => ({
  executeAccountDeletion: vi.fn(),
  DELETION_STATUS: {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { DELETE } from "../[id]/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { executeAccountDeletion } from "@/lib/account-deletion";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const USER_ID = "clx1234567890abcdefghij";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockRequestFindUnique = prisma.accountDeletionRequest.findUnique as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.accountDeletionRequest.upsert as ReturnType<typeof vi.fn>;
const mockExecute = executeAccountDeletion as ReturnType<typeof vi.fn>;

function deleteRequest() {
  return new NextRequest(`http://localhost/api/admin/users/${USER_ID}`, {
    method: "DELETE",
  } as never);
}

const context = { params: Promise.resolve({ id: USER_ID }) };

describe("DELETE /api/admin/users/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, phone: "13800138000", status: "ACTIVE" });
    mockRequestFindUnique.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({ id: "req-1", userId: USER_ID });
    mockExecute.mockResolvedValue("completed");
  });

  it("用户不存在返回 404", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(404);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("用户已注销（DELETED）返回 409 ALREADY_DELETED", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, phone: "deleted_xxx", status: "DELETED" });
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ALREADY_DELETED");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("存在 RUNNING 申请返回 409 DELETION_IN_PROGRESS（防与执行竞态）", async () => {
    mockRequestFindUnique.mockResolvedValue({ status: "RUNNING" });
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("DELETION_IN_PROGRESS");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("成功路径：upsert 建单（立即到期 + phoneHash 不落明文）→ 同步执行 → 审计与 SSO 事件", async () => {
    const res = await DELETE(deleteRequest(), context);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // 建单：到期时间为现在（同步执行），含申请时手机号哈希
    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ userId: USER_ID });
    for (const branch of [upsertArgs.create, upsertArgs.update]) {
      expect(branch.phoneHash).toBe("hmac-13800138000");
      expect(JSON.stringify(branch)).not.toContain('"13800138000"');
      expect(branch.scheduledAt).toBeInstanceOf(Date);
    }
    expect(upsertArgs.update.status).toBe("PENDING");
    expect(upsertArgs.update.attempts).toBe(0);

    // 同步调用同一执行器，不发回执短信（管理端路径）
    expect(mockExecute).toHaveBeenCalledWith("req-1", { notifyUser: false });

    // 管理端审计 + SSO 事件（newStatus 与执行器匿名化口径一致为 DELETED）
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_deleted",
        targetType: "user",
        targetId: USER_ID,
        adminId: "admin-1",
        detail: expect.objectContaining({ requestId: "req-1", previousStatus: "ACTIVE" }),
      })
    );
    expect(recordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "status_change",
        userId: USER_ID,
        detail: expect.objectContaining({ action: "user_deleted", newStatus: "DELETED" }),
      })
    );
  });

  it("历史 CANCELLED 申请存在时原位重置后执行（upsert update 分支）", async () => {
    mockRequestFindUnique.mockResolvedValue({ status: "CANCELLED" });
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledWith("req-1", { notifyUser: false });
  });

  it("执行器返回 failed：502 + 引导人工队列，不写成功审计", async () => {
    mockExecute.mockResolvedValue("failed");
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("DELETION_EXECUTION_FAILED");
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("执行器返回 skipped（并发被抢）：同样按失败处理 502", async () => {
    mockExecute.mockResolvedValue("skipped");
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(502);
  });

  it("非预期异常仍按 500 处理", async () => {
    mockUpsert.mockRejectedValue(new Error("connection lost"));
    const res = await DELETE(deleteRequest(), context);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
