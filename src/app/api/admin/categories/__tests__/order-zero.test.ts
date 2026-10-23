import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    category: {
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
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

vi.mock("@/lib/search-push", () => ({
  pushSearchEngines: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

const baseCategory = {
  name: "精华系列",
  nameEn: "Serum",
  slug: "serum",
  description: "",
  icon: "",
  visible: true,
};

describe("POST /api/admin/categories 排序语义", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.category.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _max: { order: 4 },
    });
    (prisma.category.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: "cat-1", ...data })
    );
  });

  it("显式 order=0 时保留 0（排到最前），不查询最大值", async () => {
    const res = await POST(createRequest({ ...baseCategory, order: 0 }));

    expect(res.status).toBe(200);
    expect(prisma.category.aggregate).not.toHaveBeenCalled();
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 0 }) })
    );
  });

  it("未提供 order 时追加到当前最大排序 + 1", async () => {
    const res = await POST(createRequest(baseCategory));

    expect(res.status).toBe(200);
    expect(prisma.category.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 5 }) })
    );
  });
});
