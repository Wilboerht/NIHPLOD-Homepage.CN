// @vitest-environment jsdom

/**
 * 会员中心面板测试
 * 覆盖：主视图当前等级权益（PC 仅标题、悬浮显示说明；窄屏常显说明）、
 * 「全部等级」进入四档对比页、对比页状态（当前/已解锁/未解锁）与返回主视图、
 * 会员/积分数据加载。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", phone: "13800138000", membershipLevel: "SILVER" },
    redirectToLogin: vi.fn(),
    refreshUser: vi.fn(),
    setUserCenterView: vi.fn(),
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// 关闭 AnimatePresence 的退场等待，避免整版淡入淡出动画拖慢视图切换断言
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { VipPanel } from "@/components/website/user-center/VipPanel";

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

/** 覆写 matchMedia：配合 useMediaQuery（max-width: 1023px）的 PC / 窄屏分支 */
function stubMatchMedia(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 1023px)" ? narrow : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const VIP_DATA = {
  membershipLevel: "SILVER",
  memberId: "CM123456",
  totalSpent: 2000,
  skinTestUsage: null,
  currentLevel: {
    level: "SILVER",
    name: "银卡会员",
    minSpent: 1000,
    benefits: [{ title: "档案永久保留", desc: "肌肤档案终身保留" }],
  },
  nextLevel: { level: "GOLD", name: "金卡会员", minSpent: 5000, spentNeeded: 3000, progress: 40 },
  allLevels: [
    {
      level: "REGULAR",
      name: "普通会员",
      minSpent: 0,
      benefits: [{ title: "测肤体验", desc: "注册即享 10 次" }],
    },
    {
      level: "SILVER",
      name: "银卡会员",
      minSpent: 1000,
      benefits: [{ title: "档案永久保留", desc: "肌肤档案终身保留" }],
    },
    {
      level: "GOLD",
      name: "金卡会员",
      minSpent: 5000,
      benefits: [{ title: "不限次测肤", desc: "每日上限 10 次" }],
    },
    {
      level: "DIAMOND",
      name: "钻石卡会员",
      minSpent: 10000,
      benefits: [{ title: "生日礼遇", desc: "生日当月赠 200 积分" }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  stubMatchMedia(false);
  mockFetchWithAuth.mockImplementation((url: string) => {
    if (url === "/api/user/vip") {
      return Promise.resolve(jsonResponse({ success: true, data: VIP_DATA }));
    }
    if (url === "/api/user/points") {
      return Promise.resolve(jsonResponse({ success: true, data: { available: 2300 } }));
    }
    return Promise.resolve(jsonResponse({ success: false }));
  });
});

afterEach(() => {
  stubMatchMedia(false);
});

describe("VipPanel", () => {
  it("PC 主视图展示当前等级权益（仅标题，悬浮显示说明）与「全部等级」入口", async () => {
    render(<VipPanel />);

    expect(await screen.findByText("档案永久保留")).toBeInTheDocument();
    // PC：说明默认不直接展示
    expect(screen.queryByText("肌肤档案终身保留")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /全部等级/ })).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/vip");
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/points");
    // 主视图不再平铺四档等级卡
    expect(screen.queryByText("等级权益对比")).not.toBeInTheDocument();

    // 悬浮权益标题：Tooltip 展示说明
    fireEvent.mouseEnter(screen.getByText("档案永久保留").closest("span")!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("肌肤档案终身保留");
  });

  it("窄屏主视图单列展示权益并常显说明", async () => {
    stubMatchMedia(true);
    render(<VipPanel />);

    expect(await screen.findByText("档案永久保留")).toBeInTheDocument();
    expect(screen.getByText("肌肤档案终身保留")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("点击「全部等级」进入四档对比页，展示各档权益与状态徽标", async () => {
    render(<VipPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /全部等级/ }));

    expect(await screen.findByText("等级权益对比")).toBeInTheDocument();
    for (const name of ["普通会员", "银卡会员", "金卡会员", "钻石卡会员"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // 银卡为当前等级：当前徽标 + 已解锁（普通档）；金卡/钻石未解锁
    expect(screen.getByText("当前")).toBeInTheDocument();
    expect(screen.getByText("已解锁")).toBeInTheDocument();
    expect(screen.getAllByText("未解锁")).toHaveLength(2);
  });

  it("对比页「返回」回到主视图当前权益", async () => {
    render(<VipPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /全部等级/ }));
    fireEvent.click(await screen.findByRole("button", { name: /返回/ }));

    expect(await screen.findByText("会员权益")).toBeInTheDocument();
    expect(screen.queryByText("等级权益对比")).not.toBeInTheDocument();
  });
});
