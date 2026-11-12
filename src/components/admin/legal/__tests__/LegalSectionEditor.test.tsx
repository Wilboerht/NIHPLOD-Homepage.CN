// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LegalSectionEditor } from "../LegalSectionEditor";

const section = { id: "terms-1", title: "1. 隐私权", body: "正文" };

function renderEditor(overrides?: {
  title?: string;
  body?: string;
  total?: number;
  index?: number;
  expanded?: boolean;
  readOnly?: boolean;
}) {
  const onChange = vi.fn();
  const onToggle = vi.fn();
  const onMove = vi.fn();
  const onRemove = vi.fn();
  render(
    <LegalSectionEditor
      section={{
        id: section.id,
        title: overrides?.title ?? section.title,
        body: overrides?.body ?? section.body,
      }}
      index={overrides?.index ?? 0}
      total={overrides?.total ?? 2}
      expanded={overrides?.expanded ?? true}
      readOnly={overrides?.readOnly ?? false}
      onToggle={onToggle}
      onChange={onChange}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
  return { onChange, onToggle, onMove, onRemove };
}

describe("LegalSectionEditor", () => {
  it("渲染标题与正文并回传修改", () => {
    const { onChange } = renderEditor();
    const titleInput = screen.getByLabelText("章节标题");
    const bodyInput = screen.getByLabelText(/正文/);

    expect(titleInput).toHaveValue("1. 隐私权");
    expect(bodyInput).toHaveValue("正文");

    fireEvent.change(titleInput, { target: { value: "新标题" } });
    expect(onChange).toHaveBeenCalledWith({ title: "新标题" });

    fireEvent.change(bodyInput, { target: { value: "新正文" } });
    expect(onChange).toHaveBeenCalledWith({ body: "新正文" });
  });

  it("空正文显示待填写提示", () => {
    renderEditor({ body: "" });
    expect(screen.getByText("待填写正文")).toBeInTheDocument();
  });

  it("首章禁用上移、末章禁用下移", () => {
    renderEditor({ index: 0, total: 2 });
    expect(screen.getByRole("button", { name: "上移第 1 章" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下移第 1 章" })).toBeEnabled();
  });

  it("只读模式输入框不可编辑", () => {
    renderEditor({ readOnly: true });
    expect(screen.getByLabelText("章节标题")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/正文/)).toHaveAttribute("readonly");
  });
});
