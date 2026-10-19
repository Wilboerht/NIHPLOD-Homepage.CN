// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Modal } from "@/components/ui/Modal";

const rect = {
  width: 100,
  height: 40,
  top: 0,
  left: 0,
  right: 100,
  bottom: 40,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeAll(() => {
  HTMLElement.prototype.getClientRects = function getClientRects() {
    return [rect] as unknown as DOMRectList;
  };
});

afterEach(() => {
  cleanup();
  document.getElementById("app-root")?.remove();
  vi.restoreAllMocks();
});

function createAppRoot() {
  const root = document.createElement("div");
  root.id = "app-root";
  document.body.appendChild(root);
  return root;
}

describe("Modal", () => {
  it("渲染标题、描述和固定 footer", () => {
    createAppRoot();
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="测试弹窗"
        description="弹窗描述"
        footer={<button type="button">底部操作</button>}
      >
        <button type="button">内容操作</button>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "测试弹窗" })).toBeInTheDocument();
    expect(screen.getByText("弹窗描述")).toBeInTheDocument();
    expect(screen.getByText("底部操作")).toBeInTheDocument();
  });

  it("closeGuard 为 false 时阻止关闭按钮和 Esc", () => {
    createAppRoot();
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="守卫弹窗" closeGuard={() => false}>
        <button type="button">内容</button>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Modal open onClose={onClose} title="守卫弹窗" closeGuard={() => true}>
        <button type="button">内容</button>
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("打开时锁定背景可访问性，关闭后恢复", async () => {
    const root = createAppRoot();
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="背景锁定">
        <button type="button">内容</button>
      </Modal>
    );

    await waitFor(() => {
      expect(root).toHaveAttribute("inert");
      expect(root).toHaveAttribute("aria-hidden", "true");
    });

    rerender(
      <Modal open={false} onClose={vi.fn()} title="背景锁定">
        <button type="button">内容</button>
      </Modal>
    );

    await waitFor(() => {
      expect(root).not.toHaveAttribute("inert");
      expect(root).not.toHaveAttribute("aria-hidden");
    });
  });

  it("嵌套弹窗只保留顶层可访问，下层 inert 且遮罩透明", async () => {
    createAppRoot();
    render(
      <>
        <Modal open onClose={vi.fn()} title="底层弹窗">
          <button type="button">底层内容</button>
        </Modal>
        <Modal open onClose={vi.fn()} title="顶层弹窗">
          <button type="button">顶层内容</button>
        </Modal>
      </>
    );

    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    const lower = dialogs.find((dialog) => dialog.textContent?.includes("底层内容"));
    const top = dialogs.find((dialog) => dialog.textContent?.includes("顶层内容"));

    expect(lower).toBeDefined();
    expect(top).toBeDefined();

    await waitFor(() => {
      expect(lower).toHaveAttribute("inert");
      expect(lower).toHaveAttribute("aria-hidden", "true");
      expect(lower).toHaveAttribute("aria-modal", "false");
    });

    expect(top).not.toHaveAttribute("inert");
    expect(top).not.toHaveAttribute("aria-hidden");
    expect(top).toHaveAttribute("aria-modal", "true");
    expect(
      lower?.parentElement?.querySelector("[data-modal-backdrop]")?.getAttribute("data-behind")
    ).toBe("true");
  });

  it("焦点陷阱忽略 disabled 元素", async () => {
    createAppRoot();
    render(
      <Modal open onClose={vi.fn()} title="焦点测试" showCloseButton={false}>
        <button type="button">第一个</button>
        <button type="button" disabled>
          禁用按钮
        </button>
        <button type="button">最后一个</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "第一个" });
    const last = screen.getByRole("button", { name: "最后一个" });

    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    expect(screen.getByRole("button", { name: "禁用按钮" })).not.toHaveFocus();
  });

  it("触屏设备不自动聚焦输入框以避免弹出键盘", async () => {
    createAppRoot();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(
      <Modal open onClose={vi.fn()} title="触屏弹窗">
        <input data-autofocus aria-label="姓名" />
      </Modal>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    });
    expect(screen.getByRole("textbox", { name: "姓名" })).not.toHaveFocus();

    window.matchMedia = originalMatchMedia;
  });
});
