// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({
  default: ({
    onLoad,
    onError,
    alt,
    src,
    className,
  }: {
    onLoad?: () => void;
    onError?: () => void;
    alt?: string;
    src?: string;
    className?: string;
  }) => (
    <button
      type="button"
      data-testid="mock-image"
      aria-label={alt || "image"}
      className={className}
      onClick={onLoad}
      onDoubleClick={onError}
    >
      {src}
    </button>
  ),
}));

import { ProductImage } from "@/components/website/ProductImage";

describe("ProductImage", () => {
  it("shows a shimmer skeleton until the image loads", () => {
    render(
      <div className="relative">
        <ProductImage src="/product.webp" alt="产品图" fill />
      </div>
    );

    expect(screen.getByTestId("product-image-skeleton")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mock-image"));

    expect(screen.queryByTestId("product-image-skeleton")).not.toBeInTheDocument();
  });

  it("keeps a static placeholder and hides the broken image on error", () => {
    render(
      <div className="relative">
        <ProductImage src="/missing.webp" alt="产品图" fill />
      </div>
    );

    fireEvent.doubleClick(screen.getByTestId("mock-image"));

    const skeleton = screen.getByTestId("product-image-skeleton");
    expect(skeleton.className).not.toContain("animate-shimmer");
    expect(screen.getByTestId("mock-image")).toHaveClass("opacity-0");
  });
});
