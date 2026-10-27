import { describe, it, expect } from "vitest";
import { MAX_GEO_FAQS } from "@/schemas/product";
import { parseGeoFaqs, resolveProductFaqs } from "../product-faqs";

const product = {
  name: "恒采修护面霜",
  nameEn: "Face Cream",
  categoryName: "面霜",
  benefits: ["抗衰老"],
  description: "测试产品",
  ingredients: "玻色因",
  usage: "早晚使用",
  capacity: "50g",
  origin: "摩纳哥",
  price: 1880,
  purchasePlatforms: ["天猫"],
};

describe("parseGeoFaqs", () => {
  it("过滤非法项、trim 并去重", () => {
    const result = parseGeoFaqs([
      { question: "  问题一  ", answer: "  答案一  " },
      { question: "问题一", answer: "重复答案" },
      { question: "", answer: "空问题" },
      { question: "问题二" },
      null,
      "bad",
    ]);

    expect(result).toEqual([{ question: "问题一", answer: "答案一" }]);
  });

  it("非数组返回空数组", () => {
    expect(parseGeoFaqs(null)).toEqual([]);
    expect(parseGeoFaqs({ question: "q", answer: "a" })).toEqual([]);
    expect(parseGeoFaqs(undefined)).toEqual([]);
  });

  it("最多保留 MAX_GEO_FAQS 组", () => {
    const input = Array.from({ length: MAX_GEO_FAQS + 5 }, (_, i) => ({
      question: `问题${i}`,
      answer: `答案${i}`,
    }));
    expect(parseGeoFaqs(input)).toHaveLength(MAX_GEO_FAQS);
  });
});

describe("resolveProductFaqs", () => {
  it("后台合法 FAQ 优先", () => {
    const stored = [{ question: "后台问题", answer: "后台答案" }];
    expect(resolveProductFaqs({ ...product, geoFaqs: stored })).toEqual(stored);
  });

  it("null、空数组和非法数据都使用规则兜底", () => {
    for (const geoFaqs of [null, undefined, [], {}, [{ question: "", answer: "" }]]) {
      const faqs = resolveProductFaqs({ ...product, geoFaqs });
      expect(faqs.length).toBeGreaterThan(0);
      expect(faqs.some((faq) => faq.question.includes(product.name))).toBe(true);
    }
  });
});
