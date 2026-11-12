import { describe, expect, it } from "vitest";
import {
  cloneLegalContent,
  legalContentComparableSignature,
  legalContentSignature,
  validatePublishableContent,
} from "../legal-utils";
import type { LegalDocumentContent } from "@/types/legal";

const content: LegalDocumentContent = {
  title: "服务条款",
  description: "描述",
  lastUpdated: "2026年11月12日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "正文" }],
};

describe("legal-utils", () => {
  it("clone 与签名保持内容稳定", () => {
    const cloned = cloneLegalContent(content);
    expect(cloned).toEqual(content);
    expect(cloned).not.toBe(content);
    expect(legalContentSignature(cloned)).toBe(legalContentSignature(content));
  });

  it("实质变更签名忽略 lastUpdated", () => {
    expect(legalContentComparableSignature(content)).toBe(
      legalContentComparableSignature({ ...content, lastUpdated: "2099年1月1日" })
    );
    expect(legalContentComparableSignature(content)).not.toBe(
      legalContentComparableSignature({ ...content, description: "新描述" })
    );
  });

  it("发布校验要求描述、标题和正文非空", () => {
    expect(validatePublishableContent(content).ok).toBe(true);

    expect(validatePublishableContent({ ...content, description: " " }).ok).toBe(false);

    expect(
      validatePublishableContent({
        ...content,
        sections: [{ id: "terms-1", title: " ", body: "正文" }],
      })
    ).toMatchObject({ ok: false, emptySectionIds: ["terms-1"] });

    expect(
      validatePublishableContent({
        ...content,
        sections: [{ id: "terms-1", title: "标题", body: " " }],
      })
    ).toMatchObject({ ok: false, emptySectionIds: ["terms-1"] });

    expect(validatePublishableContent({ ...content, sections: [] }).ok).toBe(false);
  });
});
