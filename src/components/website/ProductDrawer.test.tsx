// @vitest-environment jsdom

/**
 * 产品详情抽屉测试
 * 覆盖：actionArea 替代三方购买入口（积分商城兑换场景）、Logo 链接开关、
 * ESC 捕获拦截（不同时关闭下层弹窗）、滚动锁保存/恢复。
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-view-transitions", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

import { ProductDrawer } from "@/components/website/ProductDrawer";
import type { ProductData } from "@/components/website/ProductDrawer";

const PRODUCT: ProductData = {
  id: "p1",
  name: "氨基酸洁面乳",
  nameEn: "Cleanser",
  slug: "cleanser",
  description: "<p>温和洁面</p>",
  price: 199,
  capacity: "100ml",
  purchaseLinks: [{ id: "pl1", platform: "天猫", url: "https://tmall.example.com" }],
  images: [{ url: "https://cdn.example.com/cleanser.png" }],
  category: { name: "洁面" },
  ingredients: "氨基酸表活",
  usage: "早晚取适量",
  benefits: ["温和清洁"],
};

afterEach(() => {
  document.body.style.overflow = "";
});

describe("ProductDrawer", () => {
  it("默认展示三方购买入口，Logo 链接首页", () => {
    render(<ProductDrawer isOpen onClose={vi.fn()} product={PRODUCT} />);

    // 桌面「官方旗舰店」+ 移动端平台胶囊均渲染
    expect(screen.getByText("官方旗舰店")).toBeInTheDocument();
    expect(screen.getByText("天猫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /NIHPLOD Logo/ })).toHaveAttribute("href", "/");
  });

  it("传入 actionArea 时替代购买链接，且不渲染 Logo 链接", () => {
    render(
      <ProductDrawer
        isOpen
        onClose={vi.fn()}
        product={PRODUCT}
        brandLinkEnabled={false}
        actionArea={<button type="button">立即兑换</button>}
      />
    );

    // 桌面与移动端各渲染一次操作区
    expect(screen.getAllByRole("button", { name: "立即兑换" })).toHaveLength(2);
    expect(screen.queryByText("官方旗舰店")).not.toBeInTheDocument();
    expect(screen.queryByText("天猫")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /NIHPLOD Logo/ })).not.toBeInTheDocument();
  });

  it("ESC 关闭并阻止冒泡：不触发下层弹窗的 ESC 监听", () => {
    const onClose = vi.fn();
    const lowerLayer = vi.fn();
    window.addEventListener("keydown", lowerLayer);

    render(<ProductDrawer isOpen onClose={onClose} product={PRODUCT} />);
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lowerLayer).not.toHaveBeenCalled();
    window.removeEventListener("keydown", lowerLayer);
  });

  it("关闭后恢复原有滚动锁，不解除下层弹窗的 body overflow", () => {
    document.body.style.overflow = "hidden";
    const { rerender } = render(<ProductDrawer isOpen onClose={vi.fn()} product={PRODUCT} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<ProductDrawer isOpen={false} onClose={vi.fn()} product={null} />);
    expect(document.body.style.overflow).toBe("hidden");
  });
});
