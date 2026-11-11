// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentParagraph } from "@/components/ui/PolicyContentRenderer";
import { PolicyDocumentHeader } from "@/components/ui/PolicyDocumentHeader";
import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import { TermsArticle, buildTermsSections } from "@/components/ui/TermsArticle";

describe("policy article typography and semantics", () => {
  it("连续正文分别渲染为段落，并使用统一文章排版容器", () => {
    const text = ["第一段内容", "", "第二段内容"].join("\n");
    const { container } = render(<ContentParagraph text={text} />);
    expect(container.querySelectorAll(".policy-article-body > p")).toHaveLength(2);
  });

  it("连续编号项归并为有序列表，并剥离原始编号避免双重编号", () => {
    const { container } = render(
      <ContentParagraph text={"（1）第一项\n（2）第二项\n（3）第三项"} />
    );
    const items = container.querySelectorAll("ol.policy-list > li");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("第一项");
    expect(items[0].textContent).not.toContain("（1）");
  });

  it("无序符号项渲染为无序列表，不与编号项混排", () => {
    const { container } = render(
      <ContentParagraph text={"（1）第一项\n\n- 项目甲\n- 项目乙"} />
    );
    expect(container.querySelectorAll("ol.policy-list > li")).toHaveLength(1);
    const unordered = container.querySelectorAll("ul.policy-list--unordered > li");
    expect(unordered).toHaveLength(2);
    expect(unordered[0]).toHaveTextContent("项目甲");
  });

  it("行内列表拆分为独立列表项", () => {
    const { container } = render(
      <ContentParagraph text="联系我们： - 客服邮箱：service@nihplod.cn - 邮寄地址：上海市" />
    );
    expect(container.querySelectorAll("ul.policy-list--unordered > li")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "service@nihplod.cn" })).toHaveAttribute(
      "href",
      "mailto:service@nihplod.cn"
    );
  });

  it("数字加空格开头的正文不会误判为章节标题", () => {
    const { container } = render(<ContentParagraph text="15 个工作日内予以响应。" />);
    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelector("p")).toHaveTextContent("15 个工作日内予以响应。");
  });

  it("邮箱和网页地址转换为安全链接", () => {
    render(
      <ContentParagraph text="联系 service@nihplod.cn，并参阅 https://example.com/policy。" />
    );
    expect(screen.getByRole("link", { name: "service@nihplod.cn" })).toHaveAttribute(
      "href",
      "mailto:service@nihplod.cn"
    );
    expect(screen.getByRole("link", { name: "https://example.com/policy" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
  });

  it("支持 **粗体** 与 [文字](url) 行内语法", () => {
    render(
      <ContentParagraph text="请**仔细阅读**[隐私政策](https://example.com/privacy)与[站内条款](/terms)。" />
    );
    expect(screen.getByText("仔细阅读")).toHaveProperty("tagName", "STRONG");
    const external = screen.getByRole("link", { name: "隐私政策" });
    expect(external).toHaveAttribute("href", "https://example.com/privacy");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "站内条款" })).toHaveAttribute("href", "/terms");
  });

  it("Markdown 链接中的危险协议按纯文本渲染", () => {
    render(<ContentParagraph text="[点击](javascript:alert(1))" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("文档头包含真正 h1 与机器可读更新日期", () => {
    render(<PolicyDocumentHeader title="隐私政策" lastUpdated="2026年11月11日" />);
    expect(screen.getByRole("heading", { level: 1, name: "隐私政策" })).toBeInTheDocument();
    expect(screen.getByText("2026年11月11日")).toHaveAttribute("dateTime", "2026-11-11");
  });

  it("移动目录使用原生 details 和真实锚点链接", () => {
    const sections = [{ id: "ch1", title: "一、处理者信息" }];
    const { container } = render(
      <ScrollSpySidebar sections={sections} label="隐私政策目录导航" variant="mobile" />
    );
    expect(container.querySelector("details")).not.toBeNull();
    expect(screen.getByRole("link", { name: sections[0].title })).toHaveAttribute("href", "#ch1");
  });

  it("服务条款包含文档头、首章隐私链接，并移除重复章节标题", () => {
    const sections = buildTermsSections(["1. 隐私权\n\n请阅读隐私政策。"]);
    render(
      <TermsArticle sections={sections} lastUpdated="2026年9月7日" description="使用前请阅读" />
    );
    expect(screen.getByRole("heading", { level: 1, name: "服务条款" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. 隐私权" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "隐私政策" })).toHaveAttribute("href", "/privacy");
  });
});
