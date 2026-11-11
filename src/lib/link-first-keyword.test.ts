import { describe, expect, it } from "vitest";
import { linkFirstKeyword } from "@/lib/link-first-keyword";

describe("linkFirstKeyword", () => {
  it("仅将首次出现的关键词包装为链接", () => {
    const html = "<p>脂质体技术是核心。脂质体技术再次出现时不再加链。</p>";
    const result = linkFirstKeyword(html, "脂质体技术", "/technology");
    expect(result).toBe(
      '<p><a href="/technology">脂质体技术</a>是核心。脂质体技术再次出现时不再加链。</p>'
    );
  });

  it("不包进已有链接，跳过锚点内的关键词", () => {
    const html = '<p><a href="/about">脂质体技术</a>之外的脂质体技术</p>';
    const result = linkFirstKeyword(html, "脂质体技术", "/technology");
    expect(result).toBe(
      '<p><a href="/about">脂质体技术</a>之外的<a href="/technology">脂质体技术</a></p>'
    );
  });

  it("不含关键词或输入为空时原样返回", () => {
    expect(linkFirstKeyword("<p>无关内容</p>", "脂质体技术", "/technology")).toBe(
      "<p>无关内容</p>"
    );
    expect(linkFirstKeyword("", "脂质体技术", "/technology")).toBe("");
  });

  it("关键词被标签切开时不处理", () => {
    const html = "<p>脂质体<strong>技术</strong></p>";
    expect(linkFirstKeyword(html, "脂质体技术", "/technology")).toBe(html);
  });
});
