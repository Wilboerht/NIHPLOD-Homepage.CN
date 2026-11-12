import { describe, expect, it } from "vitest";
import { defaultLegalDocuments } from "@/lib/legal-default-content";
import { defaultTermsContent } from "@/lib/terms-default-content";
import {
  PRIVACY_LAST_UPDATED,
  privacyData,
  privacySectionOrder,
} from "@/lib/privacy-default-content";
import {
  countLegalContentChars,
  formatLegalLastUpdated,
  isValidLegalLastUpdated,
  todayLegalLastUpdated,
} from "@/lib/legal-content";
import { legalDocumentContentSchema } from "@/schemas/legal";

describe("legal default content normalization", () => {
  it("两份默认内容均通过入库校验", () => {
    expect(legalDocumentContentSchema.safeParse(defaultLegalDocuments.terms).success).toBe(true);
    expect(legalDocumentContentSchema.safeParse(defaultLegalDocuments.privacy).success).toBe(true);
  });

  it("服务条款保持 27 章，且每章标题/正文可无损还原", () => {
    const source = defaultTermsContent.tabs.general.content;
    const sections = defaultLegalDocuments.terms.sections;

    expect(sections).toHaveLength(27);
    expect(sections[0].id).toBe("terms-1");
    expect(sections[0].title).toBe("1. 隐私权");

    sections.forEach((section, index) => {
      expect(`${section.title}\n\n${section.body}`).toBe(source[index].trim());
      expect(section.body.startsWith(section.title)).toBe(false);
    });

    expect(defaultLegalDocuments.terms.lastUpdated).toBe(defaultTermsContent.lastUpdated);
  });

  it("隐私政策保持 14 章，且每章标题/正文可无损还原", () => {
    const sections = defaultLegalDocuments.privacy.sections;

    expect(sections).toHaveLength(14);
    expect(sections.map((section) => section.id)).toEqual([...privacySectionOrder]);

    sections.forEach((section) => {
      const original = privacyData[section.id].content.join("\n\n").trim();
      expect(`${section.title}\n\n${section.body}`).toBe(original);
      expect(section.body.startsWith(section.title)).toBe(false);
    });

    expect(defaultLegalDocuments.privacy.lastUpdated).toBe(PRIVACY_LAST_UPDATED);
  });

  it("章节正文总字数统计包含标题", () => {
    const content = defaultLegalDocuments.privacy;
    const expected = content.sections.reduce(
      (total, section) => total + section.title.length + section.body.length,
      0
    );
    expect(countLegalContentChars(content)).toBe(expected);
  });

  it("日期格式化与校验", () => {
    expect(formatLegalLastUpdated("2026-11-12")).toBe("2026年11月12日");
    expect(formatLegalLastUpdated("2026-01-02")).toBe("2026年1月2日");
    expect(isValidLegalLastUpdated("2026年11月12日")).toBe(true);
    expect(isValidLegalLastUpdated("2026-11-12")).toBe(false);
    expect(isValidLegalLastUpdated(todayLegalLastUpdated())).toBe(true);
  });
});
