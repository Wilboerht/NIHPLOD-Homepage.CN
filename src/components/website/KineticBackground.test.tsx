// @vitest-environment jsdom

/**
 * KineticBackground 便当盒测试
 * 覆盖：页面白名单门控、PC 新版排布的卡片构成（肌智派外链卡、
 * LESS BUT BETTER 衬线文字卡）、登录卡未登录文案。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next-view-transitions", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, redirectToLogin: vi.fn(), openUserCenter: vi.fn() }),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  useLayout: () => ({ setDrawerOpen: vi.fn() }),
}));

import { KineticBackground } from "@/components/website/KineticBackground";

beforeEach(() => {
  mockPathname = "/";
});

describe("KineticBackground 便当盒", () => {
  it("白名单页面渲染 7 张卡（含 ≤1024px 专用、PC 端 CSS 隐藏的卡）", () => {
    const { container } = render(<KineticBackground />);
    expect(container.querySelectorAll(".kinetic-cell")).toHaveLength(7);
  });

  it("包含肌智派外链卡：新标签页打开测肤子站", () => {
    render(<KineticBackground />);
    const link = screen.getByRole("link", { name: "肌智派在线测肤" });
    expect(link).toHaveAttribute("href", "https://smart.nihplod.cn");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("文字卡内容为 LESS / BUT / BETTER（衬线类）", () => {
    const { container } = render(<KineticBackground />);
    const serif = container.querySelector(".kinetic-serif");
    expect(serif).not.toBeNull();
    expect(serif!.textContent).toContain("LESS");
    expect(serif!.textContent).toContain("BUT");
    expect(serif!.textContent).toContain("BETTER");
  });

  it("DOM 顺序满足 PC 自动落位：品牌故事卡与肌智派卡先于通栏文字卡", () => {
    const { container } = render(<KineticBackground />);
    const classes = Array.from(container.querySelectorAll(".kinetic-cell")).map((el) =>
      Array.from(el.classList).find((c) =>
        ["kinetic-cell-boxes", "kinetic-cell-skin", "kinetic-cell-less", "kinetic-cell-advisor", "kinetic-cell-steps", "kinetic-cell-reverse", "kinetic-cell-login"].includes(c)
      )
    );
    expect(classes).toEqual([
      "kinetic-cell-boxes",
      "kinetic-cell-skin",
      "kinetic-cell-advisor",
      "kinetic-cell-less",
      "kinetic-cell-steps",
      "kinetic-cell-reverse",
      "kinetic-cell-login",
    ]);
  });

  it("未登录时登录卡显示「会员登录」", () => {
    render(<KineticBackground />);
    expect(screen.getByText("会员登录")).toBeInTheDocument();
  });

  it("非白名单页面不渲染卡片容器", () => {
    mockPathname = "/checkout";
    const { container } = render(<KineticBackground />);
    expect(container.querySelector(".kinetic-container")).toBeNull();
    // 背景层仍渲染
    expect(container.querySelector(".kinetic-bg-base")).not.toBeNull();
  });
});
