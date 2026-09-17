/**
 * 管理端分类图标/描述持久化测试
 *
 * 覆盖：
 * - 创建时 icon/description 落库（此前创建被静默丢弃）
 * - 更新时 schema 接受 icon/description（此前被剔除）
 * - 列表返回 icon/description（此前不返回导致表单无法回填图标）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    category: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET, POST } from "../route";
import { PUT } from "../[id]/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(method: "GET" | "POST" | "PUT", body?: unknown) {
  return new NextRequest("http://localhost/api/admin/categories", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  } as never);
}

const BASE_BODY = {
  name: "精华",
  nameEn: "Essence",
  slug: "essence",
  description: "精华类产品集合",
  icon: "<svg></svg>",
  order: 3,
  visible: true,
};

describe("分类 icon/description 持久化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.category.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "cat-1",
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
    (prisma.category.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: "cat-1", ...data })
    );
  });

  it("创建分类时 icon/description 应写入数据库", async () => {
    const res = await POST(createRequest("POST", BASE_BODY));

    expect(res.status).toBe(200);
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "精华类产品集合",
          icon: "<svg></svg>",
        }),
      })
    );
  });

  it("更新分类时 icon/description 不应被 schema 剔除", async () => {
    (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cat-1" });

    const res = await PUT(createRequest("PUT", {
      icon: "<svg>new</svg>",
      description: "新描述",
    }), { params: Promise.resolve({ id: "cat-1" }) });

    expect(res.status).toBe(200);
    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ icon: "<svg>new</svg>", description: "新描述" }),
      })
    );
  });

  it("分类列表应返回 icon/description 供表单回填", async () => {
    (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "cat-1",
        name: "精华",
        nameEn: "Essence",
        slug: "essence",
        description: "描述",
        icon: "<svg></svg>",
        order: 1,
        visible: true,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-09-01T00:00:00Z"),
        _count: { products: 2 },
      },
    ]);

    const res = await GET(createRequest("GET"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data[0].icon).toBe("<svg></svg>");
    expect(data.data[0].description).toBe("描述");
  });
});
