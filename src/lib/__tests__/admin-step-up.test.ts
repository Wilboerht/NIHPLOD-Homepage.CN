import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  txDeleteMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    adminStepUpGrant: {
      findUnique: mocks.findUnique,
      deleteMany: mocks.deleteMany,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        adminStepUpGrant: {
          deleteMany: mocks.txDeleteMany,
          create: mocks.create,
        },
      }),
  };
  return { prisma, default: prisma };
});

import {
  ADMIN_STEP_UP_COOKIE_NAME,
  cleanupExpiredAdminStepUpGrants,
  issueAdminStepUpGrant,
  verifyAdminStepUpGrant,
} from "@/lib/admin-step-up";

const TTL_BACKUP = process.env.ADMIN_STEP_UP_TTL_SECONDS;

function requestWithToken(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/step-up", {
    headers: { cookie: `${ADMIN_STEP_UP_COOKIE_NAME}=${token}` },
  });
}

describe("admin-step-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_STEP_UP_TTL_SECONDS;
  });

  afterEach(() => {
    if (TTL_BACKUP === undefined) delete process.env.ADMIN_STEP_UP_TTL_SECONDS;
    else process.env.ADMIN_STEP_UP_TTL_SECONDS = TTL_BACKUP;
  });

  it("签发 grant 时绑定管理员会话与 tokenVersion，并替换同会话旧 grant", async () => {
    const grant = await issueAdminStepUpGrant({ id: "admin-1", ver: 3, jti: "jti-1" });

    expect(grant.token).toBeTruthy();
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mocks.txDeleteMany).toHaveBeenCalledWith({
      where: { adminId: "admin-1", sessionJti: "jti-1" },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-1",
        sessionJti: "jti-1",
        tokenVersion: 3,
        scope: "sensitive",
      }),
    });
  });

  it("有效 grant 必须同时匹配会话、版本、scope、TOTP 启用状态和过期时间", async () => {
    const grant = await issueAdminStepUpGrant({ id: "admin-1", ver: 3, jti: "jti-1" });
    const token = grant.token;
    const validRecord = {
      adminId: "admin-1",
      sessionJti: "jti-1",
      tokenVersion: 3,
      scope: "sensitive",
      expiresAt: new Date(Date.now() + 60_000),
      admin: { totpEnabled: true },
    };
    mocks.findUnique.mockResolvedValue(validRecord);

    await expect(
      verifyAdminStepUpGrant(requestWithToken(token), { id: "admin-1", ver: 3, jti: "jti-1" })
    ).resolves.toBe(true);
    await expect(
      verifyAdminStepUpGrant(requestWithToken(token), { id: "admin-1", ver: 4, jti: "jti-1" })
    ).resolves.toBe(false);
    await expect(
      verifyAdminStepUpGrant(requestWithToken(token), { id: "admin-1", ver: 3, jti: "jti-2" })
    ).resolves.toBe(false);

    mocks.findUnique.mockResolvedValue({ ...validRecord, expiresAt: new Date(Date.now() - 1) });
    await expect(
      verifyAdminStepUpGrant(requestWithToken(token), { id: "admin-1", ver: 3, jti: "jti-1" })
    ).resolves.toBe(false);

    mocks.findUnique.mockResolvedValue({
      ...validRecord,
      admin: { totpEnabled: false },
    });
    await expect(
      verifyAdminStepUpGrant(requestWithToken(token), { id: "admin-1", ver: 3, jti: "jti-1" })
    ).resolves.toBe(false);
  });

  it("无 cookie 或数据库异常时拒绝 grant", async () => {
    await expect(
      verifyAdminStepUpGrant(new NextRequest("http://localhost/api/admin/step-up"), {
        id: "admin-1",
        ver: 0,
        jti: "jti-1",
      })
    ).resolves.toBe(false);

    mocks.findUnique.mockRejectedValue(new Error("db down"));
    await expect(
      verifyAdminStepUpGrant(requestWithToken("token"), { id: "admin-1", ver: 0, jti: "jti-1" })
    ).resolves.toBe(false);
  });

  it("清理过期 grant", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 4 });
    await expect(cleanupExpiredAdminStepUpGrants()).resolves.toBe(4);
  });
});
