// @vitest-environment jsdom

/**
 * 用户中心弹窗测试
 * 覆盖：六项菜单（个人信息/会员中心/安全设置/设备管理/授权管理/登录历史），
 * 点击菜单项直接切换弹窗 tab（/account 已收敛为首页弹窗，不再站内跳转）
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetUserCenterView = vi.fn();
const mockCloseUserCenter = vi.fn();

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

function setupAuth(view = "profile") {
  mockUseAuth.mockReturnValue({
    user: { id: "u1", phone: "13800138000", nickname: "测试用户" },
    userCenterOpen: true,
    userCenterView: view,
    closeUserCenter: mockCloseUserCenter,
    setUserCenterView: mockSetUserCenterView,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
}

describe("UserCenterModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  it("菜单包含六个入口", () => {
    render(<UserCenterModal />);
    for (const label of [
      "个人信息",
      "会员中心",
      "安全设置",
      "设备管理",
      "授权管理",
      "登录历史",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("点击「安全设置」直接切换弹窗 tab，不再跳转 /account", () => {
    render(<UserCenterModal />);
    fireEvent.click(screen.getByRole("button", { name: "安全设置" }));

    expect(mockSetUserCenterView).toHaveBeenCalledWith("security");
    expect(mockCloseUserCenter).not.toHaveBeenCalled();
  });

  it("安全设置视图渲染共享 SecurityPanel", () => {
    setupAuth("security");
    render(<UserCenterModal />);

    expect(screen.getByTestId("panel-security")).toBeInTheDocument();
  });

  it("授权管理视图渲染共享 AuthorizationsPanel", async () => {
    setupAuth("authorizations");
    render(<UserCenterModal />);

    expect(await screen.findByTestId("panel-authorizations")).toBeInTheDocument();
  });
});
