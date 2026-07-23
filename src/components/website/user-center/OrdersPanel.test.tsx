// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

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

// Mock useAuth
const mockOpenPay = vi.fn();
const mockCloseUserCenter = vi.fn();
const mockClearInitialOrderId = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    initialOrderId: null,
    clearInitialOrderId: mockClearInitialOrderId,
    openPay: mockOpenPay,
    closeUserCenter: mockCloseUserCenter,
  }),
}));

// Mock Toast
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    success: mockShowSuccess,
    error: mockShowError,
  }),
}));

// Mock fetchWithAuth
const mockFetchWithAuth = vi.fn();
vi.mock("@/lib/fetch-with-auth", () => ({
  fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}));

import { OrdersPanel } from "@/components/website/user-center/OrdersPanel";

function makeOrder(overrides = {}) {
  return {
    id: "order-1",
    orderNo: "20240101000000123456",
    status: "PENDING",
    totalAmount: 200,
    discountAmount: 0,
    payAmount: 200,
    createdAt: "2024-01-01T00:00:00Z",
    items: [
      {
        id: "item-1",
        productName: "测试商品",
        productImage: null,
        price: 200,
        quantity: 1,
      },
    ],
    userCoupon: null,
    ...overrides,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

/** 渲染并等待数据加载完成（debounceMs=0 消除防抖延迟） */
async function renderAndLoad(orders: unknown[] = []) {
  mockFetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ success: true, data: { orders } }),
  });
  vi.stubGlobal("fetch", mockFetch);

  const utils = render(<OrdersPanel debounceMs={0} />);

  // 等待 fetch resolve
  await waitFor(
    () => {
      expect(mockFetch).toHaveBeenCalled();
    },
    { timeout: 2000 }
  );

  // 再等一帧让 state 更新
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  return utils;
}

describe("OrdersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("prompt", vi.fn(() => "退款原因"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无订单时应显示空状态提示", async () => {
    await renderAndLoad([]);
    expect(screen.getByText("暂无相关订单")).toBeTruthy();
  });

  it("应正确渲染订单列表和状态标签", async () => {
    await renderAndLoad([makeOrder({ status: "SHIPPED" })]);

    expect(screen.getByText("已发货")).toBeTruthy();
    expect(screen.getByText("测试商品")).toBeTruthy();
    expect(screen.getByText("¥200.00")).toBeTruthy();
  });

  it("有优惠的订单应显示优惠金额", async () => {
    await renderAndLoad([makeOrder({ discountAmount: 30, payAmount: 170 })]);

    expect(screen.getByText("已优惠 ¥30.00")).toBeTruthy();
    expect(screen.getByText("¥170.00")).toBeTruthy();
  });

  it("点击页签应切换筛选并发起新请求", async () => {
    await renderAndLoad([]);

    fireEvent.click(screen.getByText("待付款"));

    await waitFor(
      () => {
        const calls = mockFetch.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0]).toContain("status=PENDING");
      },
      { timeout: 2000 }
    );
  });

  it("PENDING 订单详情应显示付款、刷新、取消按钮", async () => {
    await renderAndLoad([makeOrder({ status: "PENDING" })]);

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("立即付款")).toBeTruthy();
    });
    expect(screen.getByText("取消订单")).toBeTruthy();
    expect(screen.getByText("刷新支付状态")).toBeTruthy();
  });

  it("SHIPPED 订单详情应显示确认收货和申请退款按钮", async () => {
    await renderAndLoad([makeOrder({ status: "SHIPPED" })]);

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("确认收货")).toBeTruthy();
    });
    expect(screen.getByText("申请退款")).toBeTruthy();
    expect(screen.queryByText("立即付款")).toBeNull();
  });

  it("PAID 订单详情应显示申请退款但无付款按钮", async () => {
    await renderAndLoad([makeOrder({ status: "PAID" })]);

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("申请退款")).toBeTruthy();
    });
    expect(screen.queryByText("立即付款")).toBeNull();
    expect(screen.queryByText("确认收货")).toBeNull();
  });

  it("COMPLETED 订单不应有任何操作按钮", async () => {
    await renderAndLoad([makeOrder({ status: "COMPLETED" })]);

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("已完成")).toBeTruthy();
    });
    expect(screen.queryByText("立即付款")).toBeNull();
    expect(screen.queryByText("取消订单")).toBeNull();
    expect(screen.queryByText("确认收货")).toBeNull();
    expect(screen.queryByText("申请退款")).toBeNull();
  });

  it("取消订单成功后应更新状态为已取消", async () => {
    await renderAndLoad([makeOrder({ status: "PENDING" })]);
    mockFetchWithAuth.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("取消订单")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("取消订单"));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockShowSuccess).toHaveBeenCalledWith("订单已取消");
    expect(screen.getByText("已取消")).toBeTruthy();
  });

  it("确认收货成功后应更新状态为已完成", async () => {
    await renderAndLoad([makeOrder({ status: "SHIPPED" })]);
    mockFetchWithAuth.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("确认收货")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("确认收货"));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockShowSuccess).toHaveBeenCalledWith("已确认收货");
    expect(screen.getByText("已完成")).toBeTruthy();
  });

  it("申请退款成功后应更新状态为退款中", async () => {
    await renderAndLoad([makeOrder({ status: "PAID" })]);
    mockFetchWithAuth.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("申请退款")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("申请退款"));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockShowSuccess).toHaveBeenCalledWith("退款申请已提交");
    expect(screen.getByText("退款中")).toBeTruthy();
  });

  it("点击立即付款应调用 openPay", async () => {
    await renderAndLoad([makeOrder({ status: "PENDING" })]);

    fireEvent.click(screen.getByText("测试商品"));

    await waitFor(() => {
      expect(screen.getByText("立即付款")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("立即付款"));

    expect(mockOpenPay).toHaveBeenCalledWith("order-1");
    expect(mockCloseUserCenter).toHaveBeenCalled();
  });
});
