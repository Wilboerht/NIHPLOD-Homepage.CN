import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const tx = {
    legalDocument: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    legalDocumentVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const prisma = {
    legalDocument: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    legalDocumentVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock.prisma,
  default: prismaMock.prisma,
}));

const auditMock = vi.hoisted(() => ({
  createAuditLogTx: vi.fn().mockResolvedValue("audit-1"),
}));

vi.mock("@/lib/audit", () => auditMock);

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { LegalDocumentError } from "@/lib/legal-document-errors";
import {
  listLegalVersions,
  publishLegalDocument,
  saveLegalDraft,
} from "@/lib/legal-document-service";
import type { LegalDocumentContent } from "@/types/legal";

const content: LegalDocumentContent = {
  title: "服务条款",
  description: "在使用我们的服务前，请仔细阅读以下条款",
  lastUpdated: "2026年9月7日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "请阅读隐私政策。" }],
};

function publishedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    slug: "terms",
    draftContent: null,
    draftRevision: 1,
    draftUpdatedAt: null,
    draftUpdatedByEmail: null,
    draftUpdatedByName: null,
    publishedContent: content,
    publishedVersion: 1,
    publishedAt: new Date("2026-11-12T00:00:00Z"),
    publishedByEmail: "owner@test.com",
    publishedByName: "Owner",
    ...overrides,
  };
}

const ADMIN = { id: "admin-1", email: "owner@test.com", name: "Owner" };

describe("legal document service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.$transaction.mockImplementation(async (callback) => callback(prismaMock.tx));
    auditMock.createAuditLogTx.mockResolvedValue("audit-1");
    prismaMock.tx.legalDocument.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tx.legalDocument.create.mockResolvedValue({ id: "doc-1" });
    prismaMock.tx.legalDocumentVersion.create.mockResolvedValue({ id: "version-1" });
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValue(publishedRow());
  });

  it("发布在事务内写入新版本并写审计", async () => {
    prismaMock.tx.legalDocument.findUnique.mockResolvedValue(
      publishedRow({
        draftContent: content,
        draftRevision: 2,
        publishedContent: null,
        publishedVersion: 0,
        publishedAt: null,
      })
    );
    prismaMock.tx.legalDocumentVersion.findFirst.mockResolvedValue(null);
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValue(
      publishedRow({ publishedVersion: 1, publishedContent: content })
    );

    const result = await publishLegalDocument({
      slug: "terms",
      content: { description: content.description, sections: content.sections },
      expectedRevision: 2,
      note: "初始化",
      admin: ADMIN,
    });

    expect(result.publishedVersion).toBe(1);
    expect(prismaMock.tx.legalDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "terms", draftRevision: 2, publishedVersion: 0 },
      })
    );
    expect(prismaMock.tx.legalDocumentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          sectionCount: 1,
          note: "初始化",
        }),
      })
    );
    expect(auditMock.createAuditLogTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "legal_document_published",
        targetType: "legal_document",
        targetId: "doc-1",
      })
    );
  });

  it("内容与线上一致时拒绝发布", async () => {
    prismaMock.tx.legalDocument.findUnique.mockResolvedValue(
      publishedRow({ draftRevision: 2, publishedContent: content, publishedVersion: 1 })
    );

    await expect(
      publishLegalDocument({
        slug: "terms",
        content: { description: content.description, sections: content.sections },
        expectedRevision: 2,
        admin: ADMIN,
      })
    ).rejects.toMatchObject({ code: "NO_CHANGES" });

    expect(prismaMock.tx.legalDocumentVersion.create).not.toHaveBeenCalled();
  });

  it("revision 不一致时抛出 STALE_UPDATE", async () => {
    prismaMock.tx.legalDocument.findUnique.mockResolvedValue(
      publishedRow({ draftRevision: 9, publishedContent: null })
    );

    await expect(
      publishLegalDocument({
        slug: "terms",
        content: { description: content.description, sections: content.sections },
        expectedRevision: 2,
        admin: ADMIN,
      })
    ).rejects.toBeInstanceOf(LegalDocumentError);
  });

  it("首次发布在无文档时创建 v1", async () => {
    prismaMock.tx.legalDocument.findUnique.mockResolvedValue(null);
    prismaMock.tx.legalDocument.create.mockResolvedValue({ id: "doc-new" });
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValue(
      publishedRow({ id: "doc-new", publishedVersion: 1, publishedContent: content })
    );

    const result = await publishLegalDocument({
      slug: "terms",
      content: { description: content.description, sections: content.sections },
      expectedRevision: 0,
      admin: ADMIN,
    });

    expect(result.publishedVersion).toBe(1);
    expect(prismaMock.tx.legalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "terms", publishedVersion: 1 }),
      })
    );
    expect(prismaMock.tx.legalDocumentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) })
    );
  });

  it("保存草稿在无文档时创建 revision 1", async () => {
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValue(null);
    prismaMock.prisma.legalDocument.create.mockResolvedValue({ id: "doc-1" });
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(
      publishedRow({
        draftContent: content,
        draftRevision: 1,
        publishedContent: null,
        publishedVersion: 0,
        publishedAt: null,
      })
    );

    await saveLegalDraft({
      slug: "terms",
      content: {
        description: content.description,
        lastUpdated: content.lastUpdated,
        sections: content.sections,
      },
      expectedRevision: 0,
      admin: ADMIN,
    });

    expect(prismaMock.prisma.legalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "terms", draftRevision: 1 }),
      })
    );
  });

  it("版本列表标记当前线上版本并支持分页", async () => {
    prismaMock.prisma.legalDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      publishedVersion: 2,
    });
    prismaMock.prisma.legalDocumentVersion.findMany.mockResolvedValue([
      {
        id: "v3",
        version: 3,
        note: null,
        contentHash: "h3",
        sectionCount: 1,
        createdAt: new Date("2026-11-12T00:00:00Z"),
        createdByEmail: null,
        createdByName: null,
      },
      {
        id: "v2",
        version: 2,
        note: "上一版",
        contentHash: "h2",
        sectionCount: 1,
        createdAt: new Date("2026-11-11T00:00:00Z"),
        createdByEmail: "owner@test.com",
        createdByName: "Owner",
      },
    ]);

    const result = await listLegalVersions({ slug: "terms", limit: 2 });
    expect(result.versions.map((version) => version.version)).toEqual([3, 2]);
    expect(result.versions[0].isCurrentPublished).toBe(false);
    expect(result.versions[1].isCurrentPublished).toBe(true);
    expect(result.nextCursor).toBeNull();
  });
});
