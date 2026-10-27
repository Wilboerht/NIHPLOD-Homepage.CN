// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeoFaqEditor } from "@/components/admin/GeoFaqEditor";
import { MAX_GEO_FAQS, MAX_GEO_FAQ_QUESTION_LENGTH } from "@/schemas/product";

describe("GeoFaqEditor", () => {
  it("空状态提示规则兜底", () => {
    render(<GeoFaqEditor value={null} onChange={vi.fn()} errors={{}} />);
    expect(screen.getByText("尚未添加 GEO 问答")).toBeInTheDocument();
    expect(screen.getByText("前台将使用规则生成的兜底问答")).toBeInTheDocument();
  });

  it("点击添加问答会追加一组空问答", () => {
    const onChange = vi.fn();
    render(<GeoFaqEditor value={null} onChange={onChange} errors={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "添加问答" }));
    expect(onChange).toHaveBeenCalledWith([{ question: "", answer: "" }]);
  });

  it("编辑问题会回传更新后的数组", () => {
    const onChange = vi.fn();
    render(
      <GeoFaqEditor
        value={[{ question: "旧问题", answer: "旧答案" }]}
        onChange={onChange}
        errors={{}}
      />
    );

    fireEvent.change(screen.getByLabelText("问题 1"), { target: { value: "新问题" } });
    expect(onChange).toHaveBeenCalledWith([{ question: "新问题", answer: "旧答案" }]);
  });

  it("展示区块级和行级错误", () => {
    render(
      <GeoFaqEditor
        value={[{ question: "", answer: "" }]}
        onChange={vi.fn()}
        errors={{
          geoFaqs: "最多添加20组问答",
          "geoFaqs.0.question": "FAQ问题不能为空",
          "geoFaqs.0.answer": "FAQ答案不能为空",
        }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("最多添加20组问答");
    expect(screen.getByText("FAQ问题不能为空")).toBeInTheDocument();
    expect(screen.getByText("FAQ答案不能为空")).toBeInTheDocument();
  });

  it("删除最后一组时回传 null", () => {
    const onChange = vi.fn();
    render(
      <GeoFaqEditor
        value={[{ question: "问题", answer: "答案" }]}
        onChange={onChange}
        errors={{}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除问答 1" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("达到上限后禁用添加按钮", () => {
    const value = Array.from({ length: MAX_GEO_FAQS }, (_, i) => ({
      question: `问题${i}`,
      answer: "答案",
    }));
    render(<GeoFaqEditor value={value} onChange={vi.fn()} errors={{}} />);

    expect(screen.getByRole("button", { name: "添加问答" })).toBeDisabled();
    expect(screen.getByText(`最多添加 ${MAX_GEO_FAQS} 组问答`)).toBeInTheDocument();
    expect(screen.getByLabelText("问题 1")).toHaveAttribute(
      "maxlength",
      String(MAX_GEO_FAQ_QUESTION_LENGTH)
    );
  });
});
