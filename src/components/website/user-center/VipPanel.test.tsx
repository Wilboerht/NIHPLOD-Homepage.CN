// @vitest-environment jsdom

/**
 * 会员中心面板测试
 * 覆盖：主视图当前等级权益（单列，标题与说明常显、卡片内滚动）、
 * 官方渠道说明（PC 悬浮气泡 / 触屏点击展开）、
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

const originalMatchMedia = window.matchMedia;

/** 模拟触屏（无 hover 能力）：官方渠道说明走点击展开 */
function stubHoverNone() {
  window.matchMedia = ((query: string) => ({
    matches: query === "(hover: none)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

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

describe("VipPanel", () => {
  it("主视图展示当前等级权益（标题 + 说明常显、卡片内滚动）与「全部等级」入口", async () => {
    render(<VipPanel />);

    expect(await screen.findByText("档案永久保留")).toBeInTheDocument();
    expect(screen.getByText("肌肤档案终身保留")).toBeInTheDocument();
    // 权益卡片自身可纵向滚动（内容超出时卡片内滚动）
    expect(screen.getByText("档案永久保留").closest(".overflow-y-auto")).not.toBeNull();

    expect(screen.getByRole("button", { name: /全部等级/ })).toBeInTheDocument();
    // 提升引导第三步：面包屑式流程文案
    expect(
      screen.getByText("登录中国官网 > 会员中心录入消费 > 提交订单编号与凭证")
    ).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/vip");
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/points");
    // 主视图不再平铺四档等级卡
    expect(screen.queryByText("等级权益对比")).not.toBeInTheDocument();
  });

  it("PC：官方渠道问号改为悬浮气泡说明", async () => {
    render(<VipPanel />);
    const trigger = await screen.findByRole("button", { name: "查看官方渠道说明" });

    // 悬浮触发 Tooltip（监听挂在包裹层）
    fireEvent.mouseEnter(trigger.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "官方渠道指 NIHPLOD 在天猫国际、抖音商城、小红书"
    );
  });

  it("触屏：点击问号切换为官方渠道说明", async () => {
    stubHoverNone();
    render(<VipPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "查看官方渠道说明" }));

    // 整版切换到说明文案（带返回按钮），问号步骤让位
    expect(await screen.findByRole("button", { name: "返回步骤说明" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看官方渠道说明" })).not.toBeInTheDocument();
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

    // 未达档展示解锁进度（金卡 2000/5000=40%，钻石 2000/10000=20%）与补录入口
    expect(screen.getByText("¥3,000")).toBeInTheDocument();
    expect(screen.getByText("¥8,000")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "补录消费记录" })).toHaveLength(2);
  });

  it("对比页「返回」回到主视图当前权益", async () => {
    render(<VipPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /全部等级/ }));
    fireEvent.click(await screen.findByRole("button", { name: /返回/ }));

    expect(await screen.findByText("会员权益")).toBeInTheDocument();
    expect(screen.queryByText("等级权益对比")).not.toBeInTheDocument();
  });
});
