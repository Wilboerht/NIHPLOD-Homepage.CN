/**
 * 管理端解绑外部身份路由测试
 * DELETE /api/admin/users/[id]/identities/[identityId]
 *
 * 覆盖：
 * - 非 owner 403
 * - 身份不存在/不属于该用户 404
 * - 微信身份解绑：清理失去身份支撑的 wechatOpenId / wechatUnionId 旧列
 *   （否则微信回调按旧列仍可登录并重建身份，解绑形同虚设）
 * - 仍有同系身份引用 UnionID 时保留旧列
 * - 非微信身份（抖音）不触碰微信旧列
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const txMock = {
  externalIdentity: {
    delete: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => {
  const prisma = {
    externalIdentity: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)),
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

import { DELETE } from "../[id]/identities/[identityId]/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest() {
  return new NextRequest("http://localhost/api/admin/users/user-1/identities/ei-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  } as never);
}

const context = {
  params: Promise.resolve({ id: "user-1", identityId: "ei-1" }),
};

describe("DELETE /api/admin/users/[id]/identities/[identityId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.externalIdentity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ei-1",
      userId: "user-1",
      provider: "wechat_open",
      subjectId: "openid-1",
      unionId: "union-1",
    });
    txMock.externalIdentity.findMany.mockResolvedValue([]);
    txMock.user.findUnique.mockResolvedValue({
      wechatOpenId: "openid-1",
      wechatUnionId: "union-1",
    });
    txMock.user.update.mockResolvedValue({});
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await DELETE(createRequest(), context);
    expect(res.status).toBe(403);
  });

  it("身份不存在或归属不匹配返回 404", async () => {
    (prisma.externalIdentity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ei-1",
      userId: "other-user",
      provider: "wechat_open",
      subjectId: "openid-1",
      unionId: null,
    });

    const res = await DELETE(createRequest(), context);
    expect(res.status).toBe(404);
  });

  it("解绑最后一个微信身份时应清理 wechatOpenId 与 wechatUnionId 旧列", async () => {
    const res = await DELETE(createRequest(), context);

    expect(res.status).toBe(200);
    expect(txMock.externalIdentity.delete).toHaveBeenCalledWith({ where: { id: "ei-1" } });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { wechatOpenId: null, wechatUnionId: null },
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_identity_unbind",
        detail: expect.objectContaining({
          clearedLegacy: { wechatOpenId: true, wechatUnionId: true },
        }),
      })
    );
  });

  it("仍有同系身份引用 UnionID 时保留 wechatUnionId 旧列", async () => {
    txMock.externalIdentity.findMany.mockResolvedValue([
      { subjectId: "mp-openid", unionId: "union-1" },
    ]);

    const res = await DELETE(createRequest(), context);

    expect(res.status).toBe(200);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { wechatOpenId: null },
    });
  });

  it("解绑抖音身份不触碰微信旧列", async () => {
    (prisma.externalIdentity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ei-1",
      userId: "user-1",
      provider: "douyin",
      subjectId: "dy-openid",
      unionId: "dy-union",
    });

    const res = await DELETE(createRequest(), context);

    expect(res.status).toBe(200);
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(txMock.user.findUnique).not.toHaveBeenCalled();
  });
});
