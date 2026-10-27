import { describe, it, expect } from "vitest";
import type { ZodIssue } from "zod";
import { mapProductFormIssues } from "../product-form-errors";

const issue = (path: (string | number)[], message: string): ZodIssue => ({
  code: "custom",
  path,
  message,
});

describe("mapProductFormIssues", () => {
  it("将 geoFaqs 数组错误映射到具体行", () => {
    const result = mapProductFormIssues(
      [
        issue(["geoFaqs", 0, "question"], "FAQ问题不能为空"),
        issue(["geoFaqs", 1, "answer"], "FAQ答案不能为空"),
        issue(["geoFaqs"], "最多添加20组问答"),
      ],
      []
    );

    expect(result).toEqual({
      "geoFaqs.0.question": "FAQ问题不能为空",
      "geoFaqs.1.answer": "FAQ答案不能为空",
      geoFaqs: "最多添加20组问答",
    });
  });

  it("保持购买链接的行号映射", () => {
    const result = mapProductFormIssues(
      [issue(["purchaseLinks", 1, "url"], "请输入有效的URL")],
      [{ index: 0 }, { index: 2 }]
    );

    expect(result).toEqual({ "purchaseLinks.2.url": "请输入有效的URL" });
  });

  it("普通字段错误保持原 key", () => {
    expect(mapProductFormIssues([issue(["name"], "产品名称不能为空")], [])).toEqual({
      name: "产品名称不能为空",
    });
  });
});
