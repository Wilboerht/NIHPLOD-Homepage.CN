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

  it("连续编号项归并为有语义的列表", () => {
    const { container } = render(
      <ContentParagraph text={"（1）第一项\n（2）第二项\n（3）第三项"} />
    );
    expect(container.querySelectorAll("ul.policy-list > li")).toHaveLength(3);
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
