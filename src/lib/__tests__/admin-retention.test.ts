import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma: Record<string, unknown> = {
    admin: {
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adminEmailHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return { prisma, audit: vi.fn().mockResolvedValue(true) };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { deleteAdminsSafely } from "@/lib/admin-safety";
import { anonymizeDeletedAdmins } from "@/lib/admin-retention";

const admin = mocks.prisma.admin as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};
const emailHistory = mocks.prisma.adminEmailHistory as {
  create: ReturnType<typeof vi.fn>;
};

describe("deleteAdminsSafely 邮箱归档", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.findMany.mockResolvedValue([]);
    admin.count.mockResolvedValue(2);
    admin.update.mockResolvedValue({});
    admin.updateMany.mockResolvedValue({ count: 1 });
    emailHistory.create.mockResolvedValue({});
  });

  it("软删除时归档原邮箱并替换为 tombstone，同时记录删除人和原因", async () => {
    admin.findMany.mockResolvedValue([
      {
        id: "admin-target",
        email: "leaver@company.com",
        name: "Leaver",
        role: "ops",
        permissions: [],
        status: "ACTIVE",
      },
    ]);

    const result = await deleteAdminsSafely({
      actorId: "owner-1",
      actorRole: "owner",
      actorOverrides: [],
      targetIds: ["admin-target"],
      reason: "离职",
    });

    expect(result.ok).toBe(true);
    expect(emailHistory.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin-target",
        email: "leaver@company.com",
        changedBy: "owner-1",
        reason: "soft_delete",
      },
    });
    expect(admin.update).toHaveBeenCalledWith({
      where: { id: "admin-target" },
      data: expect.objectContaining({
        email: "deleted+admin-target@deleted.invalid",
        status: "DISABLED",
        deletedBy: "owner-1",
        deletionReason: "离职",
        tokenVersion: { increment: 1 },
      }),
    });
  });
});

describe("anonymizeDeletedAdmins 离职账号匿名化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.findMany.mockResolvedValue([]);
    admin.updateMany.mockResolvedValue({ count: 1 });
    emailHistory.create.mockResolvedValue({});
    mocks.audit.mockResolvedValue(true);
  });

  it("满保留期的软删除账号匿名化并写审计", async () => {
    admin.findMany.mockResolvedValue([
      {
        id: "admin-old",
        email: "old@company.com",
        name: "Old Admin",
        deletedAt: new Date("2025-01-01T00:00:00Z"),
      },
    ]);

    const result = await anonymizeDeletedAdmins();

    expect(result).toEqual({ scanned: 1, anonymized: 1 });
    expect(admin.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "admin-old",
          anonymizedAt: null,
          deletedAt: { not: null, lte: expect.any(Date) },
        }),
        data: expect.objectContaining({
          name: "已删除管理员",
          email: "deleted+admin-old@deleted.invalid",
          password: "!",
          permissions: [],
          status: "DISABLED",
          anonymizedAt: expect.any(Date),
        }),
      })
    );
    expect(emailHistory.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin-old",
        email: "old@company.com",
        changedBy: "system",
        reason: "anonymized",
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_anonymized",
        targetType: "admin",
        targetId: "admin-old",
        actorType: "SYSTEM",
      })
    );
  });

  it("并发 CAS 失败时不重复写审计", async () => {
    admin.findMany.mockResolvedValue([
      {
        id: "admin-old",
        email: "deleted+admin-old@deleted.invalid",
        name: "Old Admin",
        deletedAt: new Date("2025-01-01T00:00:00Z"),
      },
    ]);
    admin.updateMany.mockResolvedValue({ count: 0 });

    const result = await anonymizeDeletedAdmins();

    expect(result).toEqual({ scanned: 1, anonymized: 0 });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
