/**
 * 管理员管理 API 错误映射测试
 * - ZodError → 400（查询参数非法不再 500）
 * - 唯一约束 P2002 → 409 DUPLICATE_EMAIL
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { prismaMock } = vi.hoisted(() => {
  const prisma: Record<string, unknown> = {
    admin: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  prisma.$executeRaw = vi.fn().mockResolvedValue([]);
  return { prismaMock: prisma as Record<string, Record<string, ReturnType<typeof vi.fn>>> };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

// withAuth 注入 owner 管理员（权限检查通过）
vi.mock("@/lib/auth", () => ({
  withAuth:
    (handler: (request: unknown, admin: unknown, context: unknown) => unknown) =>
    (request: unknown, context: unknown) =>
      handler(request, { id: "admin-1", role: "owner", permissionOverrides: [] }, context),
  withRole:
    (_roles: string[], handler: (request: unknown, admin: unknown, context: unknown) => unknown) =>
    (request: unknown, context: unknown) =>
      handler(request, { id: "admin-1", role: "owner", permissionOverrides: [] }, context),
  verifyAuth: vi.fn().mockResolvedValue(null),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () => NextResponse.json({ success: false }, { status: 403 }),
}));

vi.mock("@/lib/password", async () => {
  const { z } = await import("zod");
  return {
    passwordSchema: z.string().min(8),
    hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  };
});

vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/token-blacklist", () => ({
  blacklistAdminTokens: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/admin-safety", () => ({
  deleteAdminsSafely: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET, POST } from "../route";

function createRequest(path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  } as never);
}

describe("管理员管理 API 错误映射", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.admin.findFirst.mockResolvedValue(null);
    prismaMock.admin.count.mockResolvedValue(0);
  });

  it("GET ?page=abc 非法分页参数应返回 400 而不是 500", async () => {
    const res = await GET(createRequest("/api/admin/admins?page=abc"), undefined!);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST 参数不合法（邮箱格式错误）应返回 400", async () => {
    const res = await POST(
      createRequest("/api/admin/admins", {
        email: "not-an-email",
        name: "X",
        password: "Abcdef12",
        role: "ops",
      }),
      undefined!
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("并发创建同邮箱（P2002）应返回 409 DUPLICATE_EMAIL", async () => {
    prismaMock.admin.create.mockRejectedValue({ code: "P2002" });

    const res = await POST(
      createRequest("/api/admin/admins", {
        email: "dup@test.com",
        name: "Dup",
        password: "Abcdef12",
        role: "ops",
      }),
      undefined!
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error.code).toBe("DUPLICATE_EMAIL");
  });
});
