import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, auditMock } = vi.hoisted(() => {
  const prisma = {
    applicationFolder: { findUnique: vi.fn() },
    jobApplication: { updateMany: vi.fn(), findUnique: vi.fn() },
  };
  return {
    prismaMock: prisma,
    auditMock: {
      beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
      finishAuditLog: vi.fn().mockResolvedValue(true),
      createAuditLogStrict: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ default: prismaMock, prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    id: "admin-1",
    email: "owner@example.com",
    name: "Owner",
    role: "owner",
  }),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: vi.fn(),
}));
vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
  invalidIdResponse: vi.fn(),
}));
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { PATCH } from "../[id]/route";

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/applications/app-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

describe("PATCH /api/admin/applications/[id] 候选人备注审计隔离", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.beginAuditLog.mockResolvedValue("audit-1");
    auditMock.finishAuditLog.mockResolvedValue(true);
    prismaMock.jobApplication.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.jobApplication.findUnique.mockResolvedValue({ id: "app-1" });
  });

  it("备注原文不进入审计 detail，只记录变更标记与长度", async () => {
    const notes = "候选人张三，手机 13800138000，期望薪资 30k";
    const response = await PATCH(createRequest({ status: "reviewed", notes }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(response.status).toBe(200);
    expect(auditMock.beginAuditLog).toHaveBeenCalledTimes(1);
    const beginArg = auditMock.beginAuditLog.mock.calls[0][0];
    expect(beginArg.detail).toEqual({
      status: "reviewed",
      folderId: undefined,
      notesChanged: true,
      notesLength: notes.length,
    });
    expect(JSON.stringify(beginArg.detail)).not.toContain("张三");
    expect(JSON.stringify(beginArg.detail)).not.toContain("13800138000");

    expect(auditMock.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({ notesChanged: true, notesLength: notes.length })
    );
  });
});
