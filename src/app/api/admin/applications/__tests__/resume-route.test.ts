import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn(),
  findUnique: vi.fn(),
  resolveResumeDownload: vi.fn(),
  createAuditLogStrict: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  checkAdminRateLimit: mocks.checkAdminRateLimit,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { jobApplication: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/resume-files", () => ({
  resolveResumeDownload: mocks.resolveResumeDownload,
}));
vi.mock("@/lib/audit", () => ({
  createAuditLogStrict: mocks.createAuditLogStrict,
}));
vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: () => new Response("invalid", { status: 400 }),
}));

import { GET } from "@/app/api/admin/applications/[id]/resume/route";

const ADMIN = { id: "admin-1", email: "admin@test.com", name: "Admin", role: "owner" };
const context = { params: Promise.resolve({ id: "app-1" }) };

function request() {
  return new NextRequest("http://localhost/api/admin/applications/app-1/resume");
}

describe("GET /api/admin/applications/[id]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue(ADMIN);
    mocks.checkAdminRateLimit.mockResolvedValue(null);
    mocks.findUnique.mockResolvedValue({
      resumePath: "private:resumes/123e4567-e89b-42d3-a456-426614174000.pdf",
    });
    mocks.resolveResumeDownload.mockResolvedValue({
      kind: "redirect",
      url: "https://signed.example",
    });
    mocks.createAuditLogStrict.mockResolvedValue(undefined);
  });

  it("未登录返回 401", async () => {
    mocks.verifyAuth.mockResolvedValue(null);
    const res = await GET(request(), context);
    expect(res.status).toBe(401);
  });

  it("无简历返回 404", async () => {
    mocks.findUnique.mockResolvedValue({ resumePath: null });
    const res = await GET(request(), context);
    expect(res.status).toBe(404);
  });

  it("旧公开路径未迁移返回 409", async () => {
    mocks.resolveResumeDownload.mockResolvedValue(null);
    const res = await GET(request(), context);
    expect(res.status).toBe(409);
    expect(mocks.createAuditLogStrict).not.toHaveBeenCalled();
  });

  it("私有简历返回 302 签名地址并写下载审计", async () => {
    const res = await GET(request(), context);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/signed\.example\/?$/);
    expect(mocks.createAuditLogStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resume_download",
        targetType: "application",
        targetId: "app-1",
      })
    );
  });
});
