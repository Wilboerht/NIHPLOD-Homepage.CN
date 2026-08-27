// @vitest-environment jsdom

/**
 * 用户中心弹窗测试
 * 覆盖：菜单包含"安全设置"入口，点击后站内跳转 /account 并关闭弹窗
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();
const mockCloseUserCenter = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

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

describe("UserCenterModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "u1", phone: "13800138000", nickname: "测试用户" },
      userCenterOpen: true,
      userCenterView: "profile",
      closeUserCenter: mockCloseUserCenter,
      setUserCenterView: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  it("菜单中包含「安全设置」入口", () => {
    render(<UserCenterModal />);
    expect(screen.getByRole("button", { name: "安全设置" })).toBeInTheDocument();
  });

  it("点击「安全设置」跳转 /account 并关闭弹窗", () => {
    render(<UserCenterModal />);
    fireEvent.click(screen.getByRole("button", { name: "安全设置" }));

    expect(mockCloseUserCenter).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/account");
  });
});
