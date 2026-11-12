import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TermsArticle } from "@/components/ui/TermsArticle";
import { PrivacyArticle } from "@/components/ui/PrivacyArticle";
import { defaultLegalDocuments } from "@/lib/legal-default-content";

function countHeadings(html: string, level: 1 | 2): number {
  return (html.match(new RegExp(`<h${level}[ >]`, "g")) ?? []).length;
}

describe("real legal default content rendering", () => {
  it("服务条款 27 章全部渲染且标题不重复", () => {
    const html = renderToStaticMarkup(<TermsArticle content={defaultLegalDocuments.terms} />);
    expect(countHeadings(html, 1)).toBe(1);
    expect(countHeadings(html, 2)).toBe(27);
    expect(html).toContain("1. 隐私权");
    expect(html).toContain("27. 条款解释与争议解决");
    // 标题只出现在 h2，不应在正文里再次出现
    expect(html.match(/>1\. 隐私权</g)).toHaveLength(1);
  });

  it("隐私政策 14 章全部渲染且标题不重复", () => {
    const html = renderToStaticMarkup(<PrivacyArticle content={defaultLegalDocuments.privacy} />);
    expect(countHeadings(html, 1)).toBe(1);
    expect(countHeadings(html, 2)).toBe(14);
    expect(html).toContain("一、个人信息处理者信息");
    expect(html).toContain("十四、争议解决与条款解释");
    expect(html.match(/>一、个人信息处理者信息</g)).toHaveLength(1);
  });
});
