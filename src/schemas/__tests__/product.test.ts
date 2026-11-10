import { describe, it, expect } from "vitest";
import {
  GeoFaqsSchema,
  MAX_GEO_FAQS,
  MAX_GEO_FAQ_ANSWER_LENGTH,
  MAX_GEO_FAQ_QUESTION_LENGTH,
  ProductSchema,
  PurchaseLinkSchema,
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

describe("PurchaseLinkSchema", () => {
  const baseLink = {
    platformKey: "wechat-shop",
    platform: "微信小店",
    url: "https://store.weixin.qq.com/shop/a/aZcJxBmsAw3BI6C",
    order: 0,
  };

  it("接受微信小店官方商品 H5 短链和菜单复制的小程序短链", () => {
    expect(
      PurchaseLinkSchema.safeParse({
        ...baseLink,
        miniProgramShortLink: "#小程序://微信小店/abc",
      }).success
    ).toBe(true);
  });

  it("拒绝把普通文本、URL Link 或 Scheme 填入小程序短链", () => {
    for (const miniProgramShortLink of [
      "not-a-link",
      "https://wxaurl.cn/TICKET",
      "weixin://dl/business/?t=abc",
    ]) {
      expect(PurchaseLinkSchema.safeParse({ ...baseLink, miniProgramShortLink }).success).toBe(
        false
      );
    }
  });

  it("接受官方示例路径、自定义分包路径和查询参数", () => {
    for (const miniProgramPath of [
      "page/index/index?id=123",
      "pages/product/index?id=1",
      "subpackage/shop/detail?id=1",
      "/pages/product/index?id=1",
    ]) {
      expect(PurchaseLinkSchema.safeParse({ ...baseLink, miniProgramPath }).success).toBe(true);
    }
  });

  it("拒绝不完整路径、完整 URL 和控制字符", () => {
    for (const miniProgramPath of [
      "pages/",
      "https://example.com/pages/index",
      "pages/index/index\nBAD",
    ]) {
      expect(PurchaseLinkSchema.safeParse({ ...baseLink, miniProgramPath }).success).toBe(false);
    }
  });
});

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
