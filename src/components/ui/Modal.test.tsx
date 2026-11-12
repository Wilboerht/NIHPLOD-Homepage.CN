// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { Modal } from "@/components/ui/Modal";

describe("Modal under LazyMotion strict", () => {
  it("使用 m 组件渲染，不触发 strict 模式错误", () => {
    render(
      <LazyMotion features={domAnimation} strict>
        <Modal open onClose={vi.fn()} title="测试弹窗">
          <p>弹窗内容</p>
        </Modal>
      </LazyMotion>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("弹窗内容")).toBeInTheDocument();
    expect(screen.getByText("测试弹窗")).toBeInTheDocument();
  });
});
