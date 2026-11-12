// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { LegalVersionDiff } from "../LegalVersionDiff";
import type { LegalDocumentContent } from "@/types/legal";

const base: LegalDocumentContent = {
  title: "服务条款",
  description: "描述",
  lastUpdated: "2026年11月1日",
  sections: [
    { id: "a", title: "A", body: "相同正文" },
    { id: "b", title: "B", body: "旧正文" },
    { id: "c", title: "C", body: "将被删除" },
  ],
};

const target: LegalDocumentContent = {
  ...base,
  lastUpdated: "2026年11月12日",
  sections: [
    { id: "a", title: "A", body: "相同正文" },
    { id: "b", title: "B", body: "新正文" },
    { id: "d", title: "D", body: "新增正文" },
  ],
};

describe("LegalVersionDiff", () => {
  it("支持任意两个内容的章节级与逐行对比", () => {
    render(
      <LazyMotion features={domAnimation}>
        <LegalVersionDiff
          open
          onClose={vi.fn()}
          baseContent={base}
          targetContent={target}
          baseLabel="v2"
          targetLabel="当前编辑内容"
        />
      </LazyMotion>
    );

    expect(screen.getByText("基准：")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("对比：")).toBeInTheDocument();
    expect(screen.getByText("当前编辑内容")).toBeInTheDocument();
    expect(screen.getByText(/3 个章节有变化/)).toBeInTheDocument();
    expect(screen.getByText("修改")).toBeInTheDocument();
    expect(screen.getByText("新增")).toBeInTheDocument();
    expect(screen.getByText("删除")).toBeInTheDocument();

    const diffButtons = screen.getAllByRole("button", { name: "查看差异" });
    fireEvent.click(diffButtons[0]);
    expect(screen.getByText(/旧正文/)).toBeInTheDocument();
    expect(screen.getByText(/新正文/)).toBeInTheDocument();
  });
});
