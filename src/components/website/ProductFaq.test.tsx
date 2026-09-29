// @vitest-environment jsdom

/**
 * 产品页可见 FAQ 组件测试
 * 覆盖：问答渲染、点击展开/收起、空列表不渲染
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductFaq } from "@/components/website/ProductFaq";

const faqs = [
  { question: "这款面霜适合敏感肌吗？", answer: "配方以温和为前提设计。" },
  { question: "多久可以看到效果？", answer: "通常需要 2-4 周甚至更久。" },
];

describe("ProductFaq", () => {
  it("渲染全部问题且默认不展示答案", () => {
    render(<ProductFaq faqs={faqs} />);
    expect(screen.getByText(faqs[0].question)).toBeInTheDocument();
    expect(screen.getByText(faqs[1].question)).toBeInTheDocument();
    expect(screen.queryByText(faqs[0].answer)).not.toBeInTheDocument();
  });

  it("点击问题展开答案，再次点击收起", () => {
    render(<ProductFaq faqs={faqs} />);
    const trigger = screen.getByRole("button", { name: faqs[0].question });

    fireEvent.click(trigger);
    expect(screen.getByText(faqs[0].answer)).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("空列表不渲染区块", () => {
    const { container } = render(<ProductFaq faqs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
