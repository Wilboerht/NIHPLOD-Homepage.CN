// @vitest-environment jsdom

/**
 * 积分商城面板测试
 * 覆盖：礼品卡片点击打开产品详情抽屉（取接口 detail 字段）、抽屉层级与关闭回调。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const { mockFetchWithAuth, mockApiGet } = vi.hoisted(() => ({
  mockFetchWithAuth: vi.fn(),
  mockApiGet: vi.fn(),
}));

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/lib/api-client", () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// 关闭 AnimatePresence 的退场等待，避免视图切换动画拖慢断言
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
// 以轻量桩替代真实详情抽屉（真实组件依赖 next-view-transitions/next/image，且在点击时才加载）
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockProductDrawer(props: {
      isOpen: boolean;
      product: { id: string; name: string } | null;
      onClose: () => void;
      zIndexClassName?: string;
      actionArea?: React.ReactNode;
      brandLinkEnabled?: boolean;
    }) {
      if (!props.isOpen) return null;
      return (
        <div
          data-testid="product-drawer"
          data-product={props.product?.id ?? ""}
          data-z={props.zIndexClassName ?? ""}
          data-brand-link={props.brandLinkEnabled === false ? "disabled" : "enabled"}
        >
          {props.actionArea}
          <button type="button" onClick={props.onClose}>
            关闭抽屉
          </button>
        </div>
      );
    },
}));

import { PointsMallPanel } from "@/components/website/user-center/panels/PointsMallPanel";

const GIFT = {
  id: "p1",
  name: "氨基酸洁面乳",
  description: "<p>温和洁面</p>",
  image: "https://cdn.example.com/cleanser.png",
  priceYuan: 199,
  cost: 153,
  affordable: true,
  detail: {
    id: "p1",
    name: "氨基酸洁面乳",
    nameEn: "Cleanser",
    slug: "cleanser",
    description: "<p>温和洁面</p>",
    price: 199,
    capacity: "100ml",
    purchaseLinks: [],
    images: [{ url: "https://cdn.example.com/cleanser.png" }],
    category: { name: "洁面" },
    ingredients: "氨基酸表活",
    usage: "早晚取适量",
    benefits: ["温和清洁"],
  },
};

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWithAuth.mockImplementation((url: string) => {
    if (url === "/api/user/points/gifts") {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { membershipLevel: "GOLD", redeemRate: 1.3, available: 500, gifts: [GIFT] },
        })
      );
    }
    if (url === "/api/user/points") {
      return Promise.resolve(jsonResponse({ success: true, data: { available: 500, recent: [] } }));
    }
    return Promise.resolve(jsonResponse({ success: false }));
  });
  mockApiGet.mockImplementation((url: string) => {
    if (url === "/api/user/addresses") return Promise.resolve({ addresses: [] });
    return Promise.resolve({ redemptions: [], hasMore: false, total: 0 });
  });
});

describe("PointsMallPanel 礼品详情", () => {
  it("点击礼品打开产品详情抽屉，关闭后收起（层级高于用户中心弹窗）", async () => {
    render(<PointsMallPanel />);

    const detailButton = await screen.findByRole("button", { name: "查看「氨基酸洁面乳」详情" });
    expect(screen.queryByTestId("product-drawer")).not.toBeInTheDocument();

    fireEvent.click(detailButton);

    const drawer = screen.getByTestId("product-drawer");
    expect(drawer).toHaveAttribute("data-product", "p1");
    expect(drawer).toHaveAttribute("data-z", "z-[10000]");

    fireEvent.click(screen.getByRole("button", { name: "关闭抽屉" }));
    expect(screen.queryByTestId("product-drawer")).not.toBeInTheDocument();
  });

  it("抽屉内为兑换操作区（无首页链接），点击「立即兑换」进入确认兑换视图", async () => {
    render(<PointsMallPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "查看「氨基酸洁面乳」详情" }));
    const drawer = screen.getByTestId("product-drawer");
    expect(drawer).toHaveAttribute("data-brand-link", "disabled");
    expect(within(drawer).getByText("积分兑换")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "立即兑换" }));

    expect(screen.queryByTestId("product-drawer")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "确认兑换" })).toBeInTheDocument();
  });
});
