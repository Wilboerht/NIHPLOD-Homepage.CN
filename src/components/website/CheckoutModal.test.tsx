// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt } = props;
    return React.createElement("img", { src: String(src), alt: String(alt) });
  },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  m: {
    div: ({ children }: Record<string, unknown>) =>
      React.createElement("div", null, children as React.ReactNode),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock react-dom createPortal
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock useScrollLock
vi.mock("@/hooks/useScrollLock", () => ({
  useScrollLock: vi.fn(),
}));

// Mock formatPrice
vi.mock("@/lib/utils", () => ({
  formatPrice: (n: number) => `¥${n.toFixed(2)}`,
}));

// Mock api-client
const mockApiPost = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  ApiError: class ApiError extends Error {},
}));

// Mock useAuth
let mockCheckoutOpen = false;
let mockUser: unknown = { id: "user-1" };
const mockCloseCheckout = vi.fn();
const mockOpenUserCenter = vi.fn();
const mockRedirectToLogin = vi.fn();
const mockOpenPay = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    checkoutOpen: mockCheckoutOpen,
    checkoutSelectedProductIds: [],
    checkoutQuantities: {},
    closeCheckout: mockCloseCheckout,
    openUserCenter: mockOpenUserCenter,
    redirectToLogin: mockRedirectToLogin,
    setPendingCheckout: vi.fn(),
    openPay: mockOpenPay,
  }),
}));

import { CheckoutModal } from "@/components/website/CheckoutModal";

const mockCheckoutData = {
  items: [
    {
      productId: "prod-1",
      variantId: null,
      productName: "测试商品A",
      variantName: null,
      price: 299,
      quantity: 1,
      image: null,
    },
  ],
  addresses: [
    {
      id: "addr-1",
      name: "张三",
      phone: "13800138000",
      province: "北京市",
      city: "北京市",
      district: "朝阳区",
      detail: "某某路1号",
      isDefault: true,
    },
  ],
  totalPrice: 299,
  shippingFee: 0,
  finalTotal: 299,
  availableCoupons: [],
};

describe("CheckoutModal", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckoutOpen = false;
    mockUser = { id: "user-1" };
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("checkoutOpen=false 时不应渲染结算内容", () => {
    mockCheckoutOpen = false;
    render(<CheckoutModal />);
    expect(screen.queryByText("测试商品A")).toBeNull();
  });

  it("checkoutOpen=true 时应加载并显示结算数据", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockCheckoutData }),
    });

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText("测试商品A")).toBeTruthy();
    });
  });

  it("未登录时应引导登录", async () => {
    mockCheckoutOpen = true;
    mockUser = null;

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(mockRedirectToLogin).toHaveBeenCalled();
    });
  });

  it("加载失败时应显示错误信息", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: { message: "服务器错误" } }),
    });

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText("服务器错误")).toBeTruthy();
    });
  });

  it("网络异常时应显示网络错误", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockRejectedValue(new Error("network error"));

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText("网络错误")).toBeTruthy();
    });
  });

  it("空购物车应提示没有可结算商品", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { ...mockCheckoutData, items: [] },
        }),
    });

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText(/没有可结算的商品/)).toBeTruthy();
    });
  });

  it("应显示收货地址信息", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockCheckoutData }),
    });

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText(/张三/)).toBeTruthy();
    });
  });

  it("ESC 键应关闭结算弹窗", async () => {
    mockCheckoutOpen = true;
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockCheckoutData }),
    });

    render(<CheckoutModal />);

    await waitFor(() => {
      expect(screen.getByText("测试商品A")).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockCloseCheckout).toHaveBeenCalled();
  });
});
