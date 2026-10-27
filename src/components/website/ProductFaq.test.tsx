// @vitest-environment jsdom

/**
 * 产品页可见 FAQ 组件测试
 * 覆盖：答案常驻 DOM、默认展开第一条、点击展开/收起、空列表不渲染
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductFaq } from "@/components/website/ProductFaq";

const faqs = [
  { question: "这款面霜适合敏感肌吗？", answer: "配方以温和为前提设计。" },
  { question: "多久可以看到效果？", answer: "通常需要 2-4 周甚至更久。" },
];

describe("ProductFaq", () => {
  it("渲染全部问题且答案始终在 DOM 中，默认展开第一条", () => {
    render(<ProductFaq faqs={faqs} />);

    expect(screen.getByText(faqs[0].question)).toBeInTheDocument();
    expect(screen.getByText(faqs[1].question)).toBeInTheDocument();
    expect(screen.getByText(faqs[0].answer)).toBeInTheDocument();
    expect(screen.getByText(faqs[1].answer)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: faqs[0].question })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: faqs[1].question })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("服务端静态渲染的 HTML 已包含答案，不依赖客户端点击", () => {
    const html = renderToStaticMarkup(<ProductFaq faqs={faqs} />);
    expect(html).toContain(faqs[0].answer);
    expect(html).toContain(faqs[1].answer);
  });

  it("点击问题展开答案，再次点击收起", () => {
    render(<ProductFaq faqs={faqs} />);
    const first = screen.getByRole("button", { name: faqs[0].question });
    const second = screen.getByRole("button", { name: faqs[1].question });

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(faqs[1].answer)).toBeInTheDocument();

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
  });

  it("空列表不渲染区块", () => {
    const { container } = render(<ProductFaq faqs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
