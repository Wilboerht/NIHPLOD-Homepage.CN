import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  legalDocument: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
  default: prismaMock,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { resolvePublishedLegalDocument } from "@/lib/legal-document-content";
import { defaultLegalDocuments } from "@/lib/legal-default-content";

describe("resolvePublishedLegalDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("数据库无记录时回退默认内容", async () => {
    prismaMock.legalDocument.findUnique.mockResolvedValue(null);
    const content = await resolvePublishedLegalDocument("terms");
    expect(content).toEqual(defaultLegalDocuments.terms);
  });

  it("读取数据库已发布内容", async () => {
    const published = {
      ...defaultLegalDocuments.privacy,
      description: "数据库中的描述",
    };
    prismaMock.legalDocument.findUnique.mockResolvedValue({ publishedContent: published });
    const content = await resolvePublishedLegalDocument("privacy");
    expect(content.description).toBe("数据库中的描述");
    expect(content.sections).toHaveLength(14);
  });

  it("内容校验失败时回退默认内容", async () => {
    prismaMock.legalDocument.findUnique.mockResolvedValue({
      publishedContent: { title: "", sections: [] },
    });
    const content = await resolvePublishedLegalDocument("privacy");
    expect(content).toEqual(defaultLegalDocuments.privacy);
  });

  it("数据库异常时回退默认内容", async () => {
    prismaMock.legalDocument.findUnique.mockRejectedValue(new Error("db down"));
    const content = await resolvePublishedLegalDocument("terms");
    expect(content).toEqual(defaultLegalDocuments.terms);
  });
});
