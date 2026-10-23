import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    job: {
      findUnique: vi.fn(),
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

vi.mock("@/lib/html-sanitize", () => ({
  sanitizeHtml: vi.fn((html: string | null | undefined) => html ?? ""),
}));

vi.mock("@/lib/search-push", () => ({
  pushSearchEngines: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PATCH } from "../[id]/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/html-sanitize";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const JOB_ID = "cjld2cjxh0000qzrmn831i7rn";
const existingJob = {
  id: JOB_ID,
  title: "高级前端工程师",
  description: "<p>职责</p>",
  requirements: "<p>要求</p>",
  createdAt: new Date("2026-09-17T00:00:00Z"),
  updatedAt: new Date("2026-09-17T00:00:00Z"),
};

function createRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/jobs/${JOB_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("PATCH /api/admin/jobs/[id]（只更新部分字段）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingJob);
    (prisma.job.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existingJob,
        ...data,
      })
    );
  });

  it("只传 published 时不得清空 description/requirements", async () => {
    const res = await PATCH(createRequest({ published: false }), {
      params: Promise.resolve({ id: JOB_ID }),
    });

    expect(res.status).toBe(200);
    expect(sanitizeHtml).not.toHaveBeenCalled();
    const updateCall = (prisma.job.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data).toEqual({ published: false });
    expect(updateCall.data).not.toHaveProperty("description");
    expect(updateCall.data).not.toHaveProperty("requirements");
  });

  it("显式传 description 时仍会 sanitize 并写入", async () => {
    const res = await PATCH(createRequest({ description: "<p>新职责</p>" }), {
      params: Promise.resolve({ id: JOB_ID }),
    });

    expect(res.status).toBe(200);
    expect(sanitizeHtml).toHaveBeenCalledWith("<p>新职责</p>");
    const updateCall = (prisma.job.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data).toEqual({ description: "<p>新职责</p>" });
  });
});
