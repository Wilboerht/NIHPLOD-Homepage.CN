import { describe, expect, it } from "vitest";
import {
  legalDocumentContentSchema,
  legalDraftContentInputSchema,
  legalPublishContentInputSchema,
} from "@/schemas/legal";

const baseSection = { id: "terms-1", title: "1. 隐私权", body: "请阅读隐私政策。" };

describe("legal schemas", () => {
  it("草稿允许空正文", () => {
    const result = legalDraftContentInputSchema.safeParse({
      description: "页面描述",
      sections: [{ ...baseSection, body: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("发布拒绝空正文", () => {
    const result = legalPublishContentInputSchema.safeParse({
      description: "页面描述",
      sections: [{ ...baseSection, body: "   " }],
    });
    expect(result.success).toBe(false);
  });

  it("发布要求每章标题非空", () => {
    const result = legalPublishContentInputSchema.safeParse({
      description: "页面描述",
      sections: [{ ...baseSection, title: " " }],
    });
    expect(result.success).toBe(false);
  });

  it("存储内容要求章节 id 与合法日期", () => {
    const valid = legalDocumentContentSchema.safeParse({
      title: "服务条款",
      description: "描述",
      lastUpdated: "2026年11月12日",
      sections: [baseSection],
    });
    expect(valid.success).toBe(true);

    const missingId = legalDocumentContentSchema.safeParse({
      title: "服务条款",
      description: "描述",
      lastUpdated: "2026年11月12日",
      sections: [{ title: "1. 隐私权", body: "正文" }],
    });
    expect(missingId.success).toBe(false);

    const badDate = legalDocumentContentSchema.safeParse({
      title: "服务条款",
      description: "描述",
      lastUpdated: "2026-11-12",
      sections: [baseSection],
    });
    expect(badDate.success).toBe(false);

    const nonExistentDate = legalDocumentContentSchema.safeParse({
      title: "服务条款",
      description: "描述",
      lastUpdated: "2026年2月30日",
      sections: [baseSection],
    });
    expect(nonExistentDate.success).toBe(false);
  });
});
