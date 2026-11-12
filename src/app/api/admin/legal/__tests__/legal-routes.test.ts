import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn(),
  hasAdminPermission: vi.fn(),
  validateCSRFToken: vi.fn(),
  requireAdminStepUp: vi.fn(),
  listAdminLegalDocuments: vi.fn(),
  getAdminLegalDocument: vi.fn(),
  saveLegalDraft: vi.fn(),
  publishLegalDocument: vi.fn(),
  discardLegalDraft: vi.fn(),
  restoreLegalVersionToDraft: vi.fn(),
  listLegalVersions: vi.fn(),
  getLegalVersion: vi.fn(),
  revalidateLegalDocumentCache: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  checkAdminRateLimit: mocks.checkAdminRateLimit,
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: mocks.hasAdminPermission,
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: mocks.validateCSRFToken,
  csrfForbiddenResponse: () =>
    new Response(
      JSON.stringify({ success: false, error: { code: "CSRF_INVALID", message: "CSRF 校验失败" } }),
      { status: 403, headers: { "content-type": "application/json" } }
    ),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: mocks.requireAdminStepUp,
}));

vi.mock("@/lib/legal-document-service", () => ({
  listAdminLegalDocuments: mocks.listAdminLegalDocuments,
  getAdminLegalDocument: mocks.getAdminLegalDocument,
  saveLegalDraft: mocks.saveLegalDraft,
  publishLegalDocument: mocks.publishLegalDocument,
  discardLegalDraft: mocks.discardLegalDraft,
  restoreLegalVersionToDraft: mocks.restoreLegalVersionToDraft,
  listLegalVersions: mocks.listLegalVersions,
  getLegalVersion: mocks.getLegalVersion,
}));

vi.mock("@/lib/legal-document-cache", () => ({
  revalidateLegalDocumentCache: mocks.revalidateLegalDocumentCache,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET as listGET } from "../route";
import { LegalDocumentError } from "@/lib/legal-document-errors";
import { GET as detailGET } from "../[slug]/route";
import { DELETE as discardDELETE, PUT as draftPUT } from "../[slug]/draft/route";
import { POST as publishPOST } from "../[slug]/publish/route";
import { GET as versionsGET } from "../[slug]/versions/route";
import { GET as versionGET } from "../[slug]/versions/[versionId]/route";
import { POST as restorePOST } from "../[slug]/restore/route";

const ADMIN = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const content = {
  title: "服务条款",
  description: "描述",
  lastUpdated: "2026年11月12日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "正文" }],
};

describe("admin legal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue(ADMIN);
    mocks.checkAdminRateLimit.mockResolvedValue(null);
    mocks.hasAdminPermission.mockReturnValue(true);
    mocks.validateCSRFToken.mockReturnValue(true);
    mocks.requireAdminStepUp.mockResolvedValue(null);
    mocks.listAdminLegalDocuments.mockResolvedValue([]);
    mocks.getAdminLegalDocument.mockResolvedValue({ slug: "terms", content });
    mocks.saveLegalDraft.mockResolvedValue({ slug: "terms", content });
    mocks.publishLegalDocument.mockResolvedValue({ slug: "terms", publishedVersion: 1, content });
    mocks.discardLegalDraft.mockResolvedValue({ slug: "terms", content });
    mocks.restoreLegalVersionToDraft.mockResolvedValue({ slug: "terms", content });
    mocks.listLegalVersions.mockResolvedValue({ versions: [], nextCursor: null });
    mocks.getLegalVersion.mockResolvedValue({ id: "v1", version: 1, content });
  });

  it("列表接口未登录返回 401", async () => {
    mocks.verifyAuth.mockResolvedValue(null);
    const response = await listGET(new NextRequest("http://localhost/api/admin/legal"));
    expect(response.status).toBe(401);
  });

  it("列表接口无权限返回 403", async () => {
    mocks.hasAdminPermission.mockReturnValue(false);
    const response = await listGET(new NextRequest("http://localhost/api/admin/legal"));
    expect(response.status).toBe(403);
  });

  it("列表接口成功返回数据", async () => {
    const response = await listGET(new NextRequest("http://localhost/api/admin/legal"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it("详情接口非法 slug 返回 400", async () => {
    const response = await detailGET(new NextRequest("http://localhost/api/admin/legal/unknown"), {
      params: Promise.resolve({ slug: "unknown" }),
    });
    expect(response.status).toBe(400);
  });

  it("详情接口成功返回文档", async () => {
    const response = await detailGET(new NextRequest("http://localhost/api/admin/legal/terms"), {
      params: Promise.resolve({ slug: "terms" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getAdminLegalDocument).toHaveBeenCalledWith("terms");
  });

  it("保存草稿需要 CSRF", async () => {
    mocks.validateCSRFToken.mockReturnValue(false);
    const response = await draftPUT(
      jsonRequest("http://localhost/api/admin/legal/terms/draft", "PUT", {
        content,
        expectedRevision: 0,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.saveLegalDraft).not.toHaveBeenCalled();
  });

  it("保存草稿成功调用服务层", async () => {
    const response = await draftPUT(
      jsonRequest("http://localhost/api/admin/legal/terms/draft", "PUT", {
        content,
        expectedRevision: 3,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.saveLegalDraft).toHaveBeenCalledWith({
      slug: "terms",
      content: expect.objectContaining({ description: "描述" }),
      expectedRevision: 3,
      admin: { id: ADMIN.id, email: ADMIN.email, name: ADMIN.name },
    });
  });

  it("发布接口被 step-up 拦截时直接返回验证响应", async () => {
    const stepUpResponse = NextResponse.json(
      { success: false, error: { code: "TOTP_REQUIRED", message: "需要二次验证" } },
      { status: 403 }
    );
    mocks.requireAdminStepUp.mockResolvedValue(stepUpResponse);
    const response = await publishPOST(
      jsonRequest("http://localhost/api/admin/legal/terms/publish", "POST", {
        content,
        expectedRevision: 1,
        note: "测试",
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.publishLegalDocument).not.toHaveBeenCalled();
  });

  it("发布成功调用服务层并触发缓存失效", async () => {
    const response = await publishPOST(
      jsonRequest("http://localhost/api/admin/legal/terms/publish", "POST", {
        content,
        expectedRevision: 1,
        note: "测试",
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.publishLegalDocument).toHaveBeenCalled();
    expect(mocks.revalidateLegalDocumentCache).toHaveBeenCalledTimes(1);
  });

  it("丢弃草稿成功", async () => {
    const response = await discardDELETE(
      jsonRequest("http://localhost/api/admin/legal/terms/draft", "DELETE", {
        expectedRevision: 1,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.discardLegalDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "terms", expectedRevision: 1 })
    );
  });

  it("版本列表解析分页参数", async () => {
    const response = await versionsGET(
      new NextRequest("http://localhost/api/admin/legal/terms/versions?cursor=8&limit=10"),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.listLegalVersions).toHaveBeenCalledWith({
      slug: "terms",
      cursor: 8,
      limit: 10,
    });
  });

  it("版本详情成功", async () => {
    const response = await versionGET(
      new NextRequest("http://localhost/api/admin/legal/terms/versions/v1"),
      { params: Promise.resolve({ slug: "terms", versionId: "v1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.getLegalVersion).toHaveBeenCalledWith({ slug: "terms", versionId: "v1" });
  });

  it("恢复历史版本成功", async () => {
    const response = await restorePOST(
      jsonRequest("http://localhost/api/admin/legal/terms/restore", "POST", {
        versionId: "v1",
        expectedRevision: 2,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.restoreLegalVersionToDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "terms", versionId: "v1", expectedRevision: 2 })
    );
  });

  it("非法参数返回 400", async () => {
    const response = await draftPUT(
      jsonRequest("http://localhost/api/admin/legal/terms/draft", "PUT", {
        content: { sections: [] },
        expectedRevision: -1,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.saveLegalDraft).not.toHaveBeenCalled();
  });

  it("服务层领域错误映射为对应 HTTP 状态", async () => {
    mocks.publishLegalDocument.mockRejectedValue(
      new LegalDocumentError("NO_CHANGES", "内容未变化", 400)
    );
    const response = await publishPOST(
      jsonRequest("http://localhost/api/admin/legal/terms/publish", "POST", {
        content,
        expectedRevision: 1,
        note: "测试发布",
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("NO_CHANGES");
  });

  it("发布说明必填，缺失时不调用服务层", async () => {
    const response = await publishPOST(
      jsonRequest("http://localhost/api/admin/legal/terms/publish", "POST", {
        content,
        expectedRevision: 1,
      }),
      { params: Promise.resolve({ slug: "terms" }) }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mocks.publishLegalDocument).not.toHaveBeenCalled();
  });
});
