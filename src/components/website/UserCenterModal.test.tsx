// @vitest-environment jsdom

/**
 * 用户中心弹窗测试
 * 覆盖：五个一级菜单（个人信息/护肤档案/会员中心/积分商城/安全中心），
 * 设备管理/授权管理/登录历史已合并进安全中心（内部分段标签切换）。
 * 安全设置（密码管理）已合并进个人信息面板。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const mockSetUserCenterView = vi.fn();
const mockCloseUserCenter = vi.fn();
const mockSetSecuritySection = vi.fn();

vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// 面板挂载后会异步取数：mock fetchWithAuth 为永不 resolve，避免测试结束后的 act 警告
vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: vi.fn(() => new Promise(() => {})) };
});

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

import { UserCenterModal } from "@/components/website/UserCenterModal";
import { useAuth } from "@/contexts/AuthContext";

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

/** 覆写 matchMedia：模拟移动端（<768px 全屏壳）或桌面端（居中卡片壳） */
function stubMatchMedia(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)" ? mobile : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function setupAuth(view = "profile", securitySection = "devices", logoutMock = vi.fn()) {
  mockUseAuth.mockReturnValue({
    user: { id: "u1", phone: "13800138000", nickname: "测试用户" },
    userCenterOpen: true,
    userCenterView: view,
    closeUserCenter: mockCloseUserCenter,
    setUserCenterView: mockSetUserCenterView,
    securitySection,
    setSecuritySection: mockSetSecuritySection,
    logout: logoutMock,
    refreshUser: vi.fn(),
  });
}

describe("UserCenterModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  afterEach(() => {
    // 还原移动端 stub，避免覆写状态串到后续用例
    stubMatchMedia(false);
  });

  it("菜单包含五个一级入口，安全类子项不再作为一级菜单", () => {
    render(<UserCenterModal />);
    for (const label of ["个人信息", "护肤档案", "会员中心", "积分商城", "安全中心"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    for (const label of ["设备管理", "授权管理", "登录历史"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("点击「积分商城」直接切换弹窗 tab", () => {
    render(<UserCenterModal />);
    fireEvent.click(screen.getByRole("button", { name: "积分商城" }));

    expect(mockSetUserCenterView).toHaveBeenCalledWith("mall");
    expect(mockCloseUserCenter).not.toHaveBeenCalled();
  });

  it("积分商城视图渲染积分商城面板", async () => {
    setupAuth("mall");
    render(<UserCenterModal />);

    expect(await screen.findByTestId("panel-mall")).toBeInTheDocument();
  });

  it("点击「安全中心」直接切换弹窗 tab", () => {
    render(<UserCenterModal />);
    fireEvent.click(screen.getByRole("button", { name: "安全中心" }));

    expect(mockSetUserCenterView).toHaveBeenCalledWith("security");
    expect(mockCloseUserCenter).not.toHaveBeenCalled();
  });

  it("安全中心默认展示设备管理分段", async () => {
    setupAuth("security", "devices");
    render(<UserCenterModal />);

    expect(await screen.findByTestId("panel-security")).toBeInTheDocument();
    expect(screen.getByTestId("panel-devices")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-authorizations")).not.toBeInTheDocument();
  });

  it("安全中心分段切换：点击「授权管理」调用 setSecuritySection", async () => {
    setupAuth("security", "devices");
    render(<UserCenterModal />);
    await screen.findByTestId("panel-security");

    fireEvent.click(screen.getByRole("tab", { name: "授权管理" }));
    expect(mockSetSecuritySection).toHaveBeenCalledWith("authorizations");
  });

  it("旧视图标识（如 authorizations）渲染安全中心及对应分段", async () => {
    setupAuth("authorizations", "authorizations");
    render(<UserCenterModal />);

    expect(await screen.findByTestId("panel-security")).toBeInTheDocument();
    expect(screen.getByTestId("panel-authorizations")).toBeInTheDocument();
  });

  it("移动端：渲染底部 Tab 栏与标题，不渲染桌面侧边栏", () => {
    stubMatchMedia(true);
    setupAuth();
    render(<UserCenterModal />);

    const nav = screen.getByRole("navigation", { name: "用户中心导航" });
    expect(within(nav).getAllByRole("button")).toHaveLength(5);
    expect(screen.getAllByRole("heading", { name: "个人信息" }).length).toBeGreaterThan(0);
  });

  it("移动端：点击底部 Tab 直接切换面板视图", () => {
    stubMatchMedia(true);
    setupAuth("profile");
    render(<UserCenterModal />);

    const nav = screen.getByRole("navigation", { name: "用户中心导航" });
    fireEvent.click(within(nav).getByRole("button", { name: "积分商城" }));
    expect(mockSetUserCenterView).toHaveBeenCalledWith("mall");
    expect(mockCloseUserCenter).not.toHaveBeenCalled();
  });

  // 侧边栏按钮与确认框按钮（未勾选时）同名「退出登录」，getAllByRole 取最后一个（确认框的）
  const clickLogoutConfirm = () => {
    const buttons = screen.getAllByRole("button", { name: "退出登录" });
    fireEvent.click(buttons[buttons.length - 1]);
  };

  it("退出登录：默认仅退出当前设备（allDevices: false）", async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    setupAuth("profile", "devices", logoutMock);
    render(<UserCenterModal />);

    fireEvent.click(screen.getAllByRole("button", { name: "退出登录" })[0]);
    // 二次确认弹窗出现，复选框默认不勾选
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    clickLogoutConfirm();
    await waitFor(() => expect(logoutMock).toHaveBeenCalledWith({ allDevices: false }));
  });

  it("退出登录：勾选「同时退出所有设备和已授权的平台」后全局退出", async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    setupAuth("profile", "devices", logoutMock);
    render(<UserCenterModal />);

    fireEvent.click(screen.getAllByRole("button", { name: "退出登录" })[0]);
    fireEvent.click(await screen.findByRole("checkbox"));

    // 勾选后确认按钮文案变为「退出所有平台」
    fireEvent.click(await screen.findByRole("button", { name: "退出所有平台" }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledWith({ allDevices: true }));
  });
});
