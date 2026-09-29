/**
 * 管理端删除用户（匿名化软删除）测试
 * DELETE /api/admin/users/:id
 *
 * 覆盖：P2003 外键违例（财务表 Restrict 防御层触发）→ 409 USER_HAS_BUSINESS_RECORDS，
 *       引导走账号注销流程而非物理删除；正常匿名化路径不回归（会话撤销 + 审计）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    oAuthSession: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userConsent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    webhookDeliveryFailure: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

vi.mock("@/lib/external-identity", () => ({
  removeIdentities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/webhook", () => ({
  dispatchStatusChangeWebhook: vi.fn().mockResolvedValue(undefined),
  getStatusChangeWebhookTargets: vi.fn().mockReturnValue([]),
  toWebhookStatus: vi.fn((s: string) => s),
}));

vi.mock("@/lib/user-status", () => ({
  cascadeUserStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { DELETE } from "../[id]/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const USER_ID = "clx1234567890abcdefghij";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>;

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
    mockUserUpdate.mockResolvedValue({});
  });

  it("P2003 外键违例（财务表 Restrict）：返回 409 与引导注销文案", async () => {
    mockUserUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
        code: "P2003",
        clientVersion: "7.9.1",
      })
    );

    const res = await DELETE(deleteRequest(), context);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("USER_HAS_BUSINESS_RECORDS");
    expect(body.error.message).toContain("注销流程");
    // 不写"删除成功"审计
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("非 P2003 异常仍按 500 处理", async () => {
    mockUserUpdate.mockRejectedValue(new Error("connection lost"));

    const res = await DELETE(deleteRequest(), context);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("正常匿名化路径：update 置 BANNED + 清空 PII，写 user_deleted 审计", async () => {
    const res = await DELETE(deleteRequest(), context);

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          status: "BANNED",
          nickname: "[已删除]",
          wechatOpenId: null,
          wechatUnionId: null,
        }),
      })
    );
    // 匿名化手机号不落明文
    const updateData = mockUserUpdate.mock.calls[0][0].data;
    expect(updateData.phone).toMatch(/^deleted_/);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_deleted", targetId: USER_ID, adminId: "admin-1" })
    );
  });
});
