// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

const { mockPush, mockReplace, mockPathnameRef } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockPathnameRef: { current: "/products" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathnameRef.current,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next-view-transitions", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("next/image", () => ({
  default: () => <span aria-hidden="true" />,
}));

vi.mock("@/components/ui/DrawerPageContainer", () => ({
  DrawerPageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

import {
  ProductsShell,
  useProductsShell,
  type ProductsCategory,
} from "@/components/website/ProductsShell";
import { LayoutProvider } from "@/contexts/LayoutContext";

function Harness() {
  const { navigateToProduct, navigateToList } = useProductsShell();

  return (
    <div>
      <button type="button" onClick={() => navigateToProduct("demo")}>
        open-detail
      </button>
      <button type="button" onClick={() => navigateToList()}>
        open-list
      </button>
      <h1 tabIndex={-1}>list-heading</h1>
      <p>list-content</p>
    </div>
  );
}

function renderShell(categories: ProductsCategory[] = []) {
  return render(
    <LayoutProvider>
      <ProductsShell categories={categories}>
        <Harness />
      </ProductsShell>
    </LayoutProvider>
  );
}

describe("ProductsShell navigation", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockPathnameRef.current = "/products";
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "navigation", {
      configurable: true,
      value: new EventTarget(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes immediately and shows the detail loading indicator", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/products/demo");
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();
    expect(screen.queryByText("list-content")).not.toBeInTheDocument();
  });

  it("cancels a pending detail navigation back to the current list", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();

    fireEvent.click(screen.getByText("返回产品列表"));

    expect(mockPush).toHaveBeenLastCalledWith("/products");
    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("products-list-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
  });

  it("shows the list skeleton when returning from a committed detail page", () => {
    mockPathnameRef.current = "/products/demo";
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-list" }));

    expect(mockPush).toHaveBeenCalledWith("/products");
    expect(screen.getByTestId("products-list-skeleton")).toBeInTheDocument();
  });

  it("clears the pending loading indicator after the pathname changes", () => {
    const { rerender } = renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();

    mockPathnameRef.current = "/products/demo";
    rerender(
      <LayoutProvider>
        <ProductsShell categories={[]}>
          <Harness />
        </ProductsShell>
      </LayoutProvider>
    );

    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
  });

  it("can retarget another detail while a detail route is pending", () => {
    renderShell([{ id: "c1", name: "分类一", slug: "category-1", productSlug: "other" }]);

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(mockPush).toHaveBeenLastCalledWith("/products/demo");

    fireEvent.click(screen.getByText("分类一"));

    expect(mockPush).toHaveBeenLastCalledWith("/products/other");
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();
  });

  it("retries the pending list navigation when back is clicked again", () => {
    mockPathnameRef.current = "/products/demo";
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-list" }));
    expect(screen.getByTestId("products-list-skeleton")).toBeInTheDocument();

    fireEvent.click(screen.getByText("返回产品列表"));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith("/products");
    expect(screen.getByTestId("products-list-skeleton")).toBeInTheDocument();
  });

  it("cancels pending navigation when the browser goes back", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();

    const navigation = (window as unknown as Window & { navigation: EventTarget }).navigation;
    const event = new Event("navigate");
    Object.defineProperty(event, "navigationType", { value: "traverse" });

    act(() => {
      navigation.dispatchEvent(event);
    });

    expect(mockPush).toHaveBeenLastCalledWith("/products");
    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
  });

  it("shows the list skeleton when browser back returns to the list", () => {
    mockPathnameRef.current = "/products/demo";
    renderShell();
    window.history.replaceState(null, "", "/products");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByTestId("products-list-skeleton")).toBeInTheDocument();
  });

  it("focuses the new page heading after navigation commits", () => {
    const { rerender } = renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    mockPathnameRef.current = "/products/demo";
    rerender(
      <LayoutProvider>
        <ProductsShell categories={[]}>
          <Harness />
        </ProductsShell>
      </LayoutProvider>
    );

    expect(screen.getByRole("heading", { name: "list-heading" })).toHaveFocus();
  });

  it("falls back to popstate cancellation without the Navigation API", () => {
    Object.defineProperty(window, "navigation", {
      configurable: true,
      value: undefined,
    });
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(mockPush).toHaveBeenLastCalledWith("/products");
    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
  });

  it("clears pending when the products error boundary reports an error", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    expect(screen.getByTestId("product-detail-loading")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("nihplod:products-error"));
    });

    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("shows the slow loading hint and can cancel", () => {
    vi.useFakeTimers();
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "open-detail" }));
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByText("加载时间较长，请稍候…")).toBeInTheDocument();

    fireEvent.click(screen.getByText("取消"));

    expect(mockPush).toHaveBeenLastCalledWith("/products");
    expect(screen.queryByTestId("product-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByText("list-content")).toBeInTheDocument();
  });
});
