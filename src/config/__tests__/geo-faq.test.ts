/**
 * 产品 FAQ 规则兜底生成器测试
 * 仅允许出现产品数据中可核实的内容，禁止不可核实表述
 */
import { describe, it, expect } from "vitest";
import { MAX_GEO_FAQ_ANSWER_LENGTH, MAX_GEO_FAQ_QUESTION_LENGTH } from "@/schemas/product";
import { generateProductFaqs } from "../geo-faq";

const product = {
  name: "恒采修护面霜",
  nameEn: "Face Cream",
  categoryName: "面霜",
  benefits: ["抗衰老", "深层滋养", "紧致提升"],
  description: "<p>面向初老肌肤的面霜</p>",
  ingredients: "<p>玻色因、神经酰胺 NP</p>",
  usage: "<p>早晚洁面后使用</p>",
  capacity: "50g",
  origin: "摩纳哥",
  price: 1880,
  purchasePlatforms: ["天猫", "京东"],
};

describe("generateProductFaqs", () => {
  it("生成包含产品名的产品级问答，且不含不可核实表述", () => {
    const faqs = generateProductFaqs(product);
    expect(faqs.length).toBeGreaterThanOrEqual(3);
    const text = faqs.map((f) => `${f.question}${f.answer}`).join("");
    expect(text).toContain(product.name);
    expect(text).not.toMatch(/皇室|名媛|液体珠宝|Union Skincare|纳米乳化/);
    expect(text).not.toContain("9 个单品");
  });

  it("包含核心成分、使用方法、规格产地价格和购买渠道", () => {
    const faqs = generateProductFaqs(product);
    const text = faqs.map((f) => `${f.question}${f.answer}`).join("");
    expect(text).toContain("玻色因");
    expect(text).toContain("早晚洁面后使用");
    expect(text).toContain("50g");
    expect(text).toContain("摩纳哥");
    expect(text).toContain("￥1880");
    expect(text).toContain("天猫");
  });

  it("无功效标签时不生成空功效文案，仍返回基础问答", () => {
    const faqs = generateProductFaqs({ ...product, benefits: [] });
    expect(faqs.length).toBeGreaterThanOrEqual(3);
    const text = faqs.map((f) => `${f.question}${f.answer}`).join("");
    expect(text).not.toContain("主打");
    expect(text).not.toMatch(/主打\s+等方向/);
  });

  it("问题唯一，且不超过 Schema 长度限制", () => {
    const faqs = generateProductFaqs(product);
    const questions = faqs.map((faq) => faq.question);
    expect(new Set(questions).size).toBe(questions.length);
    for (const faq of faqs) {
      expect(faq.question.length).toBeLessThanOrEqual(MAX_GEO_FAQ_QUESTION_LENGTH);
      expect(faq.answer.length).toBeLessThanOrEqual(MAX_GEO_FAQ_ANSWER_LENGTH);
    }
  });

  it("字段自带句号时不产生重复标点", () => {
    const faqs = generateProductFaqs({
      ...product,
      description: "<p>面向初老肌肤的面霜。</p>",
      ingredients: "<p>玻色因、神经酰胺 NP。</p>",
      usage: "<p>早晚洁面后使用。</p>",
    });
    const answers = faqs.map((faq) => faq.answer).join("");
    expect(answers).not.toMatch(/。。/);
  });
});
