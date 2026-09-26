/**
 * DELETE /api/user/identities/:id 测试（自助解绑第三方身份）
 * 覆盖：越权 404、占位手机号拒绝解绑、正常解绑并清理失去引用的微信旧列
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalIdentity: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: vi.fn(),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuthEvent } from "@/lib/auth-logger";
import { DELETE } from "@/app/api/user/identities/[id]/route";

const mockVerifyUserAuth = verifyUserAuth as ReturnType<typeof vi.fn>;
const mockIdentityFindFirst = prisma.externalIdentity.findFirst as ReturnType<typeof vi.fn>;
const mockIdentityFindMany = prisma.externalIdentity.findMany as ReturnType<typeof vi.fn>;
const mockIdentityDeleteMany = prisma.externalIdentity.deleteMany as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const IDENTITY_ID = "clidentity1234567890abc";

function createRequest(): NextRequest {
  return new NextRequest(
    new URL(`/api/user/identities/${IDENTITY_ID}`, "http://localhost:3000"),
    { method: "DELETE" } as never
  );
}

const context = { params: Promise.resolve({ id: IDENTITY_ID }) };

const identity = {
  id: IDENTITY_ID,
  provider: "wechat_open",
  subjectId: "openid-1",
  unionId: "unionid-1",
};

describe("DELETE /api/user/identities/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma)
    );
    mockIdentityDeleteMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
  });

  it("越权（身份不属于当前用户）返回 404", async () => {
    mockIdentityFindFirst.mockResolvedValue(null);

    const res = await DELETE(createRequest(), context);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockIdentityDeleteMany).not.toHaveBeenCalled();
  });

  it("占位手机号账号拒绝解绑（避免失去唯一登录方式）", async () => {
    mockIdentityFindFirst.mockResolvedValue(identity);
    mockUserFindUnique.mockResolvedValue({ phone: "wx_placeholder" });

    const res = await DELETE(createRequest(), context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("UNBIND_NOT_ALLOWED");
    expect(mockIdentityDeleteMany).not.toHaveBeenCalled();
  });

  it("正常解绑：删除身份、清理失去引用的微信旧列并写审计", async () => {
    mockIdentityFindFirst.mockResolvedValue(identity);
    mockUserFindUnique
      .mockResolvedValueOnce({ phone: "13800138000" }) // 账号检查
      .mockResolvedValueOnce({ wechatOpenId: "openid-1", wechatUnionId: "unionid-1" }); // 事务内查旧列
    mockIdentityFindMany.mockResolvedValue([]); // 无剩余微信身份引用

    const res = await DELETE(createRequest(), context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockIdentityDeleteMany).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID, userId: "user-1" },
    });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { wechatOpenId: null, wechatUnionId: null },
    });
    expect(logAuthEvent).toHaveBeenCalledWith(
      "user_oauth_revoke",
      expect.objectContaining({ userId: "user-1", success: true })
    );
  });

  it("仍有其他微信身份引用 unionId 时仅清理 openId", async () => {
    mockIdentityFindFirst.mockResolvedValue(identity);
    mockUserFindUnique
      .mockResolvedValueOnce({ phone: "13800138000" })
      .mockResolvedValueOnce({ wechatOpenId: "openid-1", wechatUnionId: "unionid-1" });
    mockIdentityFindMany.mockResolvedValue([
      { subjectId: "openid-2", unionId: "unionid-1" },
    ]);

    await DELETE(createRequest(), context);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { wechatOpenId: null },
    });
  });

  it("并发删除（认领失败 count=0）返回 404 而非 500", async () => {
    mockIdentityFindFirst.mockResolvedValue(identity);
    mockUserFindUnique.mockResolvedValueOnce({ phone: "13800138000" });
    mockIdentityDeleteMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(createRequest(), context);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
