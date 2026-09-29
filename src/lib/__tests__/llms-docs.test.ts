/**
 * llms 文档构建测试
 * - 产品目录覆盖全部已发布产品（含 gift-box）
 * - 测肤链接固定 advisor 子域，不出现站内不存在的 /ai-consultation
 * - 产品 geoFaqs 存在时合并进 FAQ 段
 */
import { describe, it, expect } from "vitest";
import { ADVISOR_URL, buildLlmsFullDoc, buildLlmsSummary, type LlmsProduct } from "../llms-docs";

const siteUrl = "https://nihplod.cn";

function product(overrides: Partial<LlmsProduct>): LlmsProduct {
  return {
    name: "净透温和洁面慕斯",
    nameEn: "Foam Cleanser",
    slug: "foam-cleanser",
    description: "氨基酸洁面慕斯",
    price: "680",
    benefits: ["温和清洁", "保湿不紧绷"],
    ingredients: "椰油酰甘氨酸钾",
    usage: "取适量泡沫轻柔按摩",
    category: { name: "洁面" },
    geoFaqs: null,
    ...overrides,
  };
}

const products: LlmsProduct[] = [
  product({}),
  product({
    name: "恒采修护面霜",
    nameEn: "Face Cream",
    slug: "face-cream",
    geoFaqs: [{ question: "面霜怎么用？", answer: "早晚洁面后使用。" }],
  }),
  product({ name: "全效礼盒", nameEn: "Gift Box", slug: "gift-box", geoFaqs: undefined }),
];

const sections = {
  brandSection: "## 品牌理念与核心技术\n- **关于品牌**: 测试",
  ritualsSection: "### 1. 优雅日常 (Daily Ritual)",
  faqSection: "### Q: 什么是 NIHPLOD ?\nA: 测试",
};

describe("buildLlmsFullDoc", () => {
  const doc = buildLlmsFullDoc({ siteUrl, products, ...sections });

  it("包含全部已发布产品链接（含 gift-box）", () => {
    expect(doc).toContain("https://nihplod.cn/products/foam-cleanser");
    expect(doc).toContain("https://nihplod.cn/products/gift-box");
    expect((doc.match(/### \[/g) ?? []).length).toBe(3);
  });

  it("保留人工模板段落并合并产品 geoFaqs", () => {
    expect(doc).toContain(sections.brandSection);
    expect(doc).toContain(sections.ritualsSection);
    expect(doc).toContain(sections.faqSection);
    expect(doc).toContain("### Q: 面霜怎么用？");
  });

  it("不包含站内不存在的 AI 测肤路径", () => {
    expect(doc).not.toContain("/ai-consultation");
  });
});

describe("buildLlmsSummary", () => {
  const summary = buildLlmsSummary({ siteUrl, products });

  it("测肤入口使用 advisor 子域", () => {
    expect(summary).toContain(`[AI 在线测肤](${ADVISOR_URL})`);
    expect(summary).not.toContain("/ai-consultation");
  });

  it("核心内容包含产品/关于/指南入口与 llms-full 链接", () => {
    expect(summary).toContain("https://nihplod.cn/products");
    expect(summary).toContain("https://nihplod.cn/about");
    expect(summary).toContain("https://nihplod.cn/guide");
    expect(summary).toContain("https://nihplod.cn/llms-full.txt");
  });
});
