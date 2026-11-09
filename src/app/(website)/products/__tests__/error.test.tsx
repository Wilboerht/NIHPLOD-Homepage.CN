// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import ProductsError from "@/app/(website)/products/error";

describe("ProductsError", () => {
  it("renders the error state and lets the user retry", () => {
    const reset = vi.fn();

    render(<ProductsError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "产品内容加载失败" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回产品列表" })).toHaveAttribute(
      "href",
      "/products"
    );

    fireEvent.click(screen.getByRole("button", { name: /重试/ }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("notifies the products shell that an error was rendered", () => {
    const listener = vi.fn();
    window.addEventListener("nihplod:products-error", listener);

    render(<ProductsError error={new Error("boom")} reset={vi.fn()} />);

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("nihplod:products-error", listener);
  });
});
