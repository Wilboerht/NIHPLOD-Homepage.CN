/**
 * 产品 FAQ 兜底生成器测试
 * 仅允许出现官网/官方文档中可核实的内容，禁止不可核实表述
 */
import { describe, it, expect } from "vitest";
import { generateProductFaqs } from "../geo-faq";

const product = {
  name: "恒采修护面霜",
  nameEn: "Face Cream",
  categoryName: "面霜",
  benefits: ["抗衰老", "深层滋养", "紧致提升"],
  description: "test",
  ingredients: "玻色因、神经酰胺 NP",
};

describe("generateProductFaqs", () => {
  it("生成包含产品名的差异化问答，且不含不可核实表述", () => {
    const faqs = generateProductFaqs(product);
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    const text = faqs.map((f) => `${f.question}${f.answer}`).join("");
    expect(text).toContain(product.name);
    expect(text).not.toMatch(/皇室|名媛|液体珠宝|Union Skincare|纳米乳化|液体珠宝/);
  });

  it("有核心成分时附加单品优势问答并包含成分", () => {
    const faqs = generateProductFaqs(product);
    expect(faqs.at(-1)?.answer).toContain("玻色因");
  });

  it("无功效标签时仍返回基础问答", () => {
    const faqs = generateProductFaqs({ ...product, benefits: [] });
    expect(faqs.length).toBeGreaterThanOrEqual(6);
  });
});
