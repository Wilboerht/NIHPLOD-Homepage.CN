// @vitest-environment jsdom

/**
 * 可见面包屑组件测试
 * 覆盖：多级渲染（链接 + 当前页）、单级不渲染
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "@/components/website/Breadcrumbs";

vi.mock("next-view-transitions", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe("Breadcrumbs", () => {
  it("渲染多级面包屑，最后一级为当前页", () => {
    render(
      <Breadcrumbs
        items={[
          { name: "首页", url: "/" },
          { name: "产品系列", url: "/products" },
          { name: "恒采修护面霜", url: "/products/face-cream" },
        ]}
      />
    );

    expect(screen.getByLabelText("面包屑")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "产品系列" })).toHaveAttribute("href", "/products");
    expect(screen.getByText("恒采修护面霜")).toHaveAttribute("aria-current", "page");
  });

  it("仅一级时不渲染", () => {
    const { container } = render(<Breadcrumbs items={[{ name: "首页", url: "/" }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
