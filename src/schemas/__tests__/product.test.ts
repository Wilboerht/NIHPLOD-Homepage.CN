import { describe, it, expect } from "vitest";
import {
  GeoFaqsSchema,
  MAX_GEO_FAQS,
  MAX_GEO_FAQ_ANSWER_LENGTH,
  MAX_GEO_FAQ_QUESTION_LENGTH,
  ProductSchema,
} from "../product";

const baseProduct = {
  name: "测试产品",
  nameEn: "Test Product",
  slug: "test-product",
  categoryId: "category-1",
  price: 100,
  description: "产品描述",
  images: [{ url: "/images/test.jpg", order: 0 }],
  order: 0,
  published: false,
};

describe("GeoFaqsSchema", () => {
  it("trim 问题与答案", () => {
    const parsed = GeoFaqsSchema.parse([{ question: "  问题  ", answer: "  答案  " }]);
    expect(parsed).toEqual([{ question: "问题", answer: "答案" }]);
  });

  it("拒绝空问题和纯空格答案", () => {
    expect(GeoFaqsSchema.safeParse([{ question: "", answer: "答案" }]).success).toBe(false);
    expect(GeoFaqsSchema.safeParse([{ question: "问题", answer: "   " }]).success).toBe(false);
  });

  it("拒绝重复问题", () => {
    const result = GeoFaqsSchema.safeParse([
      { question: "重复问题", answer: "答案一" },
      { question: " 重复问题 ", answer: "答案二" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "FAQ问题重复")).toBe(true);
    }
  });

  it("拒绝超过上限的问答数量", () => {
    const faqs = Array.from({ length: MAX_GEO_FAQS + 1 }, (_, i) => ({
      question: `问题${i}`,
      answer: "答案",
    }));
    expect(GeoFaqsSchema.safeParse(faqs).success).toBe(false);
  });

  it("拒绝超长问题或答案", () => {
    expect(
      GeoFaqsSchema.safeParse([
        { question: "问".repeat(MAX_GEO_FAQ_QUESTION_LENGTH + 1), answer: "答案" },
      ]).success
    ).toBe(false);
    expect(
      GeoFaqsSchema.safeParse([
        { question: "问题", answer: "答".repeat(MAX_GEO_FAQ_ANSWER_LENGTH + 1) },
      ]).success
    ).toBe(false);
  });
});

describe("ProductSchema geoFaqs", () => {
  it("允许 null、undefined 和空数组", () => {
    expect(ProductSchema.safeParse({ ...baseProduct, geoFaqs: null }).success).toBe(true);
    expect(ProductSchema.safeParse(baseProduct).success).toBe(true);
    expect(ProductSchema.safeParse({ ...baseProduct, geoFaqs: [] }).success).toBe(true);
  });

  it("保存合法问答并返回 trim 后的数据", () => {
    const result = ProductSchema.parse({
      ...baseProduct,
      geoFaqs: [{ question: "  问题  ", answer: "  答案  " }],
    });
    expect(result.geoFaqs).toEqual([{ question: "问题", answer: "答案" }]);
  });
});
