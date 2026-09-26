/**
 * 管理员更新接口守卫测试
 * PUT /api/admin/admins
 *
 * 覆盖（P0 自锁与凭证安全）：
 * - 不能通过本接口修改自己的角色/密码（防自锁）
 * - 目标管理员不存在返回 404
 * - 不能降级最后一个 owner（409）
 * - 角色变更：撤销目标管理员全部会话 + 审计记录角色前后值
 * - 密码变更：撤销会话
 * - 仅改姓名：不撤销会话
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    admin: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
  };
  // 删除安全策略使用交互式事务 + advisory lock
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  prisma.$executeRaw = vi.fn().mockResolvedValue([]);
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  withRole: (_roles: string[], handler: (...args: unknown[]) => unknown) =>
    (request: unknown, context: unknown) => handler(request, context),
  withAuth: (handler: (...args: unknown[]) => unknown) =>
    (request: unknown, context: unknown) => handler(request, context),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/password", () => ({
  passwordSchema: z.string().min(8),
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistAdminTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { POST, PUT } from "../route";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { blacklistAdminTokens } from "@/lib/token-blacklist";

const OWNER = {
  id: "clx0000000000000000000001",
  email: "owner@test.com",
  name: "Owner",
  role: "owner",
};
const TARGET_ID = "clx0000000000000000000002";

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/admins", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/admins", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

/** 被委派 admins:write 的非 owner（通过个人权限覆盖） */
const DELEGATED = {
  id: "clx0000000000000000000004",
  email: "delegated@test.com",
  name: "Delegated",
  role: "ops",
  permissionOverrides: ["admins:write"],
};

describe("owner 账号保护（委派管理员越权防护）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "admin",
    });
    (prisma.admin.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "admin",
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("委派管理员修改 owner 账号被拒", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "owner",
    });

    const res = await PUT(createRequest({ id: TARGET_ID, name: "改名" }), DELEGATED as never);

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派管理员将成员提升为 owner 被拒", async () => {
    const res = await PUT(createRequest({ id: TARGET_ID, role: "owner" }), DELEGATED as never);

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派管理员创建 owner 被拒", async () => {
    const res = await POST(
      createPostRequest({
        email: "new-owner@test.com",
        name: "NewOwner",
        password: "NewPassw0rd!",
        role: "owner",
      }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.create).not.toHaveBeenCalled();
  });

  it("委派管理员批量删除 owner 被拒", async () => {
    (prisma.admin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: TARGET_ID, role: "owner" },
    ]);

    const res = await POST(
      createPostRequest({ ids: [TARGET_ID], action: "delete" }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.updateMany).not.toHaveBeenCalled();
  });

  it("将最后一个 owner 降级为 ops 同样被拒（角色扩展后不再只拦 admin）", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "owner",
    });
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await PUT(createRequest({ id: TARGET_ID, role: "ops" }), OWNER as never);

    expect(res.status).toBe(409);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派边界：不能创建超出自身权限范围的角色（ops 委派建 support）", async () => {
    const res = await POST(
      createPostRequest({
        email: "support@test.com",
        name: "Support",
        password: "NewPassw0rd!",
        role: "support",
      }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.create).not.toHaveBeenCalled();
  });

  it("委派边界：不能追加自身没有的权限（ops 委派授予 sso:read）", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "ops",
    });

    const res = await PUT(
      createRequest({ id: TARGET_ID, permissions: ["sso:read"] }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派边界：角色变更超出自身范围被拒（admin → support）", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "admin",
      permissions: [],
    });

    const res = await PUT(
      createRequest({ id: TARGET_ID, role: "support" }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派边界：保留既有超范围授权（重复提交）不拦截，可正常改名", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "ops",
      permissions: ["sso:read"],
    });
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target2",
      role: "ops",
      permissions: ["sso:read"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      createRequest({ id: TARGET_ID, name: "Target2", permissions: ["sso:read"] }),
      DELEGATED as never
    );

    expect(res.status).toBe(200);
  });

  it("委派边界：同权限范围内的角色与撤销条目允许", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "ops",
    });
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "ops",
      permissions: ["!products:write"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      createRequest({ id: TARGET_ID, permissions: ["!products:write"] }),
      DELEGATED as never
    );

    expect(res.status).toBe(200);
  });

  it("owner 批量删除其他 owner（仍有 owner 保留）允许", async () => {
    (prisma.admin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: TARGET_ID, role: "owner" },
    ]);
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const res = await POST(
      createPostRequest({ ids: [TARGET_ID], action: "delete" }),
      OWNER as never
    );

    expect(res.status).toBe(200);
    expect(prisma.admin.updateMany).toHaveBeenCalled();
  });

  it("委派管理员删除权限更高的非 owner 管理员被拒（防二级提权）", async () => {
    (prisma.admin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: TARGET_ID, role: "admin", permissions: [] },
    ]);

    const res = await POST(
      createPostRequest({ ids: [TARGET_ID], action: "delete" }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.updateMany).not.toHaveBeenCalled();
  });

  it("委派管理员删除同权限范围的管理员允许", async () => {
    (prisma.admin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: TARGET_ID, role: "ops", permissions: [] },
    ]);

    const res = await POST(
      createPostRequest({ ids: [TARGET_ID], action: "delete" }),
      DELEGATED as never
    );

    expect(res.status).toBe(200);
    expect(prisma.admin.updateMany).toHaveBeenCalled();
  });
});

describe("凭证类变更收归 owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "admin",
      permissions: [],
    });
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.admin.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("委派管理员修改他人密码被拒", async () => {
    const res = await PUT(
      createRequest({ id: TARGET_ID, password: "NewPassw0rd!" }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("委派管理员修改他人邮箱被拒", async () => {
    const res = await PUT(
      createRequest({ id: TARGET_ID, email: "hijack@test.com" }),
      DELEGATED as never
    );

    expect(res.status).toBe(403);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("owner 修改他人密码允许（并吊销会话）", async () => {
    const res = await PUT(
      createRequest({ id: TARGET_ID, password: "NewPassw0rd!" }),
      OWNER as never
    );

    expect(res.status).toBe(200);
    expect(blacklistAdminTokens).toHaveBeenCalledWith(TARGET_ID, "admin_password_changed");
  });
});

describe("PUT /api/admin/admins（自锁与凭证安全）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "admin",
    });
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.admin.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("禁止修改自己的角色（防最后 owner 自降级）", async () => {
    const res = await PUT(createRequest({ id: OWNER.id, role: "admin" }), OWNER as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("SELF_ROLE_PASSWORD_FORBIDDEN");
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("禁止通过本接口修改自己的密码", async () => {
    const res = await PUT(
      createRequest({ id: OWNER.id, password: "NewPassw0rd!" }),
      OWNER as never
    );

    expect(res.status).toBe(400);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("禁止通过本接口修改自己的权限（防自锁）", async () => {
    const res = await PUT(
      createRequest({ id: OWNER.id, permissions: ["users:read"] }),
      OWNER as never
    );

    expect(res.status).toBe(400);
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("角色改为 ops 成功：撤会话 + 审计记录新角色", async () => {
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "ops",
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(createRequest({ id: TARGET_ID, role: "ops" }), OWNER as never);

    expect(res.status).toBe(200);
    expect(blacklistAdminTokens).toHaveBeenCalledWith(TARGET_ID, "admin_role_changed");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ roleBefore: "admin", roleAfter: "ops" }),
      })
    );
  });

  it("权限覆盖变更：写入 permissions 并审计 permissionsChanged", async () => {
    const res = await PUT(
      createRequest({
        id: TARGET_ID,
        permissions: ["spent:review", "not:exist", "!products:write"],
      }),
      OWNER as never
    );

    expect(res.status).toBe(200);
    expect(prisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: ["spent:review", "!products:write"],
        }),
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          permissionsChanged: true,
          permissionOverrides: ["spent:review", "!products:write"],
        }),
      })
    );
  });

  it("目标管理员不存在返回 404", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(
      createRequest({ id: "clx0000000000000000000003", name: "X" }),
      OWNER as never
    );

    expect(res.status).toBe(404);
  });

  it("降级最后一个 owner 返回 409 且不更新", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "owner",
    });
    (prisma.admin.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await PUT(createRequest({ id: TARGET_ID, role: "admin" }), OWNER as never);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("LAST_OWNER");
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it("降级非最后 owner：撤会话 + 审计含角色前后值", async () => {
    (prisma.admin.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      role: "owner",
    });
    (prisma.admin.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TARGET_ID,
      email: "target@test.com",
      name: "Target",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(createRequest({ id: TARGET_ID, role: "admin" }), OWNER as never);

    expect(res.status).toBe(200);
    expect(blacklistAdminTokens).toHaveBeenCalledWith(TARGET_ID, "admin_role_changed");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update_admin",
        detail: expect.objectContaining({
          roleBefore: "owner",
          roleAfter: "admin",
          tokensRevoked: true,
        }),
      })
    );
  });

  it("改密码：撤销会话并记录 passwordChanged", async () => {
    const res = await PUT(
      createRequest({ id: TARGET_ID, password: "NewPassw0rd!" }),
      OWNER as never
    );

    expect(res.status).toBe(200);
    expect(blacklistAdminTokens).toHaveBeenCalledWith(TARGET_ID, "admin_password_changed");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ passwordChanged: true, tokensRevoked: true }),
      })
    );
  });

  it("仅改姓名：不撤销会话", async () => {
    const res = await PUT(createRequest({ id: TARGET_ID, name: "新名字" }), OWNER as never);

    expect(res.status).toBe(200);
    expect(blacklistAdminTokens).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ tokensRevoked: false, passwordChanged: false }),
      })
    );
  });
});
