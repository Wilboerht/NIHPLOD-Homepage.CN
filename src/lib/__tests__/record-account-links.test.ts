import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyUserAuth: vi.fn(),
  userFindFirst: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
  audit: vi.fn(),
}));
const tx = {
  contactMessage: {
    findUnique: mocks.messageFindUnique,
    updateMany: mocks.messageUpdateMany,
  },
  jobApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
  $queryRaw: mocks.queryRaw,
};

vi.mock("@/lib/auth", () => ({ verifyUserAuth: mocks.verifyUserAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/audit", () => ({ createAuditLogTx: mocks.audit }));
vi.mock("@/lib/logger", () => ({ apiConsole: { warn: vi.fn() } }));

import { linkRecordToUser, resolveAuthenticatedUserIdForPhone } from "@/lib/record-account-links";

const request = new NextRequest("http://localhost/api/contact");
const admin = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" } as const;

describe("record account links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyUserAuth.mockResolvedValue({ id: "user-1" });
    mocks.userFindFirst.mockResolvedValue({ id: "user-1" });
    mocks.messageFindUnique.mockResolvedValue({
      id: "message-1",
      userId: null,
      phone: "13800138000",
    });
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.queryRaw.mockResolvedValue([{ phone: "13800138000", status: "ACTIVE" }]);
    mocks.audit.mockResolvedValue("audit-1");
  });

  it("仅在登录账户与提交手机号一致时自动关联", async () => {
    await expect(resolveAuthenticatedUserIdForPhone(request, "13800138000")).resolves.toBe(
      "user-1"
    );
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: { id: "user-1", phone: "13800138000", status: "ACTIVE" },
      select: { id: true },
    });
    mocks.userFindFirst.mockResolvedValue(null);
    await expect(resolveAuthenticatedUserIdForPhone(request, "13900139000")).resolves.toBeNull();
  });

  it("手动关联核验手机号并在同一事务写审计", async () => {
    await expect(
      linkRecordToUser({
        kind: "message",
        recordId: "message-1",
        userId: "user-1",
        expectedUserId: null,
        reason: "工单 123",
        admin,
        request,
      })
    ).resolves.toEqual({ userId: "user-1", changed: true });
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: { id: "message-1", userId: null },
      data: { userId: "user-1" },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "message_user_link" })
    );
  });

  it("手机号不一致时拒绝关联且不修改记录", async () => {
    mocks.queryRaw.mockResolvedValue([{ phone: "13900139000", status: "ACTIVE" }]);
    await expect(
      linkRecordToUser({
        kind: "message",
        recordId: "message-1",
        userId: "user-1",
        reason: "工单 123",
        admin,
        request,
      })
    ).rejects.toMatchObject({ code: "PHONE_MISMATCH" });
    expect(mocks.messageUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("其他管理员已修改关联时返回乐观锁冲突", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "message-1",
      userId: "user-2",
      phone: "13800138000",
    });
    await expect(
      linkRecordToUser({
        kind: "message",
        recordId: "message-1",
        userId: "user-1",
        expectedUserId: null,
        reason: "工单 123",
        admin,
        request,
      })
    ).rejects.toMatchObject({ code: "STALE_UPDATE" });
  });
});
