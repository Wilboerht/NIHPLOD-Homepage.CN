/**
 * 管理端职位创建排序测试
 * POST /api/admin/jobs
 *
 * 覆盖：
 * - 显式传入 order 时按传入值落库（此前被 schema 丢弃、永远 max+1）
 * - 未传 order 时自动取当前最大值 +1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    job: {
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

vi.mock("@/lib/html-sanitize", () => ({
  sanitizeHtml: (html: string) => html,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

const BASE_BODY = {
  title: "高级前端工程师",
  location: "上海市普陀区",
  type: "fulltime",
  description: "<p>职责</p>",
  requirements: "<p>要求</p>",
};

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/jobs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("POST /api/admin/jobs（创建职位排序）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.job.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _max: { order: 9 },
    });
    (prisma.job.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "job-1",
        ...data,
        createdAt: new Date("2026-09-17T00:00:00Z"),
        updatedAt: new Date("2026-09-17T00:00:00Z"),
      })
    );
  });

  it("显式传入 order 时按传入值落库，且不查询最大值", async () => {
    const res = await POST(createRequest({ ...BASE_BODY, order: 5 }));

    expect(res.status).toBe(200);
    expect(prisma.job.aggregate).not.toHaveBeenCalled();
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 5 }) })
    );
  });

  it("未传 order 时自动取当前最大值 +1", async () => {
    const res = await POST(createRequest(BASE_BODY));

    expect(res.status).toBe(200);
    expect(prisma.job.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 10 }) })
    );
  });

  it("坐标 0 不应被转换为 null", async () => {
    const res = await POST(createRequest({ ...BASE_BODY, longitude: 0, latitude: 0 }));

    expect(res.status).toBe(200);
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ longitude: 0, latitude: 0 }) })
    );
  });
});
