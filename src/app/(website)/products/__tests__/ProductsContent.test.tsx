// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockTrackEvent, mockNavigateToProduct, mockSwitchMobileView } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockNavigateToProduct: vi.fn(),
  mockSwitchMobileView: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "" }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock("@/components/website/ProductsShell", () => ({
  useProductsShell: () => ({
    mobileView: "products",
    switchMobileView: mockSwitchMobileView,
    navigateToProduct: mockNavigateToProduct,
    listScrollTopRef: { current: 0 },
  }),
}));

import { ProductsContent } from "@/app/(website)/products/ProductsContent";

function makeProducts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index + 1}`,
    name: `示例产品 ${index + 1}`,
    slug: `product-${index + 1}`,
    price: 100 + index,
    capacity: "50 ml",
    category: { name: "面霜" },
    images: [{ url: `/images/product-${index + 1}.webp`, alt: null }],
  }));
}

describe("ProductsContent", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
    mockNavigateToProduct.mockClear();
    mockSwitchMobileView.mockClear();
  });

  it("shows only the first three products", () => {
    render(<ProductsContent categories={[]} products={makeProducts(5)} />);

    expect(screen.getAllByRole("heading", { name: "当季热卖" })).toHaveLength(2);

    for (let index = 1; index <= 3; index += 1) {
      expect(screen.getAllByText(`示例产品 ${index}`).length).toBeGreaterThan(0);
    }

    expect(screen.queryByText("示例产品 4")).not.toBeInTheDocument();
    expect(screen.queryByText("示例产品 5")).not.toBeInTheDocument();
  });

  it("reports only the displayed products in the view_item_list event", () => {
    render(<ProductsContent categories={[]} products={makeProducts(5)} />);

    const viewItemListCall = mockTrackEvent.mock.calls.find(
      ([eventName]) => eventName === "view_item_list"
    );

    expect(viewItemListCall).toBeDefined();
    expect(viewItemListCall?.[1]).toEqual(
      expect.objectContaining({
        item_list_id: "products",
        item_list_name: "产品列表",
        items: [
          expect.objectContaining({ item_id: "product-1", item_name: "示例产品 1" }),
          expect.objectContaining({ item_id: "product-2", item_name: "示例产品 2" }),
          expect.objectContaining({ item_id: "product-3", item_name: "示例产品 3" }),
        ],
      })
    );
  });
});
