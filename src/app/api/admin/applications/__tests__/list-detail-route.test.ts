import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  hasAdminPermission: vi.fn(),
  checkAdminRateLimit: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  createAuditLogStrict: vi.fn(),
  beginAuditLog: vi.fn(),
  finishAuditLog: vi.fn(),
  requireAdminStepUp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  checkAdminRateLimit: mocks.checkAdminRateLimit,
}));
vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: mocks.hasAdminPermission,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    jobApplication: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    applicationFolder: { findUnique: vi.fn() },
  },
  prisma: {
    jobApplication: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    applicationFolder: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({
  createAuditLogStrict: mocks.createAuditLogStrict,
  beginAuditLog: mocks.beginAuditLog,
  finishAuditLog: mocks.finishAuditLog,
}));
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: () => true,
  csrfForbiddenResponse: () => new Response("csrf", { status: 403 }),
}));
vi.mock("@/lib/validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validation")>();
  return {
    ...actual,
    validateCUID: () => true,
    invalidIdResponse: () => new Response("invalid", { status: 400 }),
  };
});
vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: mocks.requireAdminStepUp,
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET as listGET } from "../route";
import { GET as detailGET, PATCH as detailPATCH } from "../[id]/route";

const ADMIN = { id: "admin-1", email: "hr@example.com", name: "HR", role: "hr" };
const APPLICATION = {
  id: "cmsoxym7w001wd0sdgi6uoc4j",
  jobId: "job-1",
  name: "张三",
  phone: "13800138000",
  resumePath: "private-oss:resumes/x.pdf",
  resumeFileName: "张三.pdf",
  resumeSize: 1024,
  jobTitleSnapshot: "前端工程师",
  consentAt: new Date("2026-10-01T00:00:00.000Z"),
  status: "pending",
  notes: "内部备注",
  folderId: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  job: { id: "job-1", title: "前端工程师", titleEn: "FE", location: "上海", type: "fulltime" },
  folder: null,
};

function listRequest(folderId?: string, jobId?: string) {
  const url = new URL("http://localhost/api/admin/applications");
  if (folderId) url.searchParams.set("folderId", folderId);
  if (jobId) url.searchParams.set("jobId", jobId);
  return new NextRequest(url);
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/applications/app-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "app-1" }) };

describe("管理端简历列表/详情/更新", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue(ADMIN);
    mocks.hasAdminPermission.mockReturnValue(true);
    mocks.checkAdminRateLimit.mockResolvedValue(null);
    mocks.createAuditLogStrict.mockResolvedValue(undefined);
    mocks.beginAuditLog.mockResolvedValue("audit-1");
    mocks.finishAuditLog.mockResolvedValue(true);
    mocks.requireAdminStepUp.mockResolvedValue(null);
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([APPLICATION]);
  });

  it("列表只选必要字段，不返回 notes/resumePath，并接受 CUID2 筛选", async () => {
    // Prisma 的 select 会把 notes 排除；mock 也按 select 的结果返回
    const { notes: _notes, ...listApplication } = APPLICATION;
    void _notes;
    mocks.findMany.mockResolvedValue([listApplication]);

    const response = await listGET(listRequest("tz4a98xxat96iws9zmbrgj3a", "tz4a98xxat96iws9zmbrgj3a"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const call = mocks.findMany.mock.calls[0][0];
    expect(call.select).toBeDefined();
    expect(call.select.notes).toBeUndefined();
    expect(call.select.resumePath).toBe(true);

    const body = await response.json();
    expect(body.data.items[0].hasResume).toBe(true);
    expect(body.data.items[0].resumePath).toBeUndefined();
    expect(body.data.items[0].notes).toBeUndefined();
  });

  it("详情返回 notes 但不返回 resumePath，并写 application_detail_view 审计", async () => {
    mocks.findUnique.mockResolvedValue(APPLICATION);
    const response = await detailGET(new NextRequest("http://localhost/x"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.data.notes).toBe("内部备注");
    expect(body.data.hasResume).toBe(true);
    expect(body.data.resumePath).toBeUndefined();
    expect(mocks.createAuditLogStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "application_detail_view",
        targetId: "app-1",
        detail: { jobId: "job-1", hasResume: true },
      })
    );
  });

  it("状态更新带 expectedStatus，并发冲突返回 409 且不覆盖", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({
      status: "hired",
      updatedAt: new Date("2026-10-02T00:00:00.000Z"),
    });

    const response = await detailPATCH(
      patchRequest({ status: "reviewed", expectedStatus: "pending" }),
      context
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("STATUS_CONFLICT");
    expect(body.error.details.currentStatus).toBe("hired");
    expect(mocks.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.any(Object)
    );
  });

  it("备注保存带 expectedUpdatedAt，冲突返回 STALE_APPLICATION", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({
      status: "pending",
      updatedAt: new Date("2026-10-02T00:00:00.000Z"),
    });

    const response = await detailPATCH(
      patchRequest({
        notes: "新备注",
        expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
      }),
      context
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("STALE_APPLICATION");
    expect(mocks.updateMany.mock.calls[0][0].where.updatedAt).toEqual(
      new Date("2026-10-01T00:00:00.000Z")
    );
  });

  it("并发成功时更新 updatedAt 并写 SUCCESS 审计", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({
      ...APPLICATION,
      status: "reviewed",
      updatedAt: new Date("2026-10-03T00:00:00.000Z"),
    });

    const response = await detailPATCH(
      patchRequest({ status: "reviewed", expectedStatus: "pending" }),
      context
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("reviewed");
    expect(body.data.updatedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(mocks.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.any(Object)
    );
  });
});
