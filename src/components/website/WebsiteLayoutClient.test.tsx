// @vitest-environment jsdom

/**
 * WebsiteLayoutClient 的 account query 参数处理测试
 * 覆盖：/?account=<tab> 已登录打开弹窗切 tab、未登录跳登录页（return_to 回链）、
 * 登录态加载中不动作、非法 tab 回退 security
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const mockOpenUserCenter = vi.fn();
const mockRedirectToLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  LayoutProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/website/BottomNavBar", () => ({
  BottomNavBar: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { WebsiteLayoutClient } from "@/components/website/WebsiteLayoutClient";

function setupAuth({
  user = { id: "u1" },
  isLoading = false,
}: {
  user?: unknown;
  isLoading?: boolean;
} = {}) {
  mockUseAuth.mockReturnValue({
    user,
    isLoading,
    refreshUser: vi.fn(),
    openUserCenter: mockOpenUserCenter,
    redirectToLogin: mockRedirectToLogin,
    redirectToWechatBind: vi.fn(),
  });
}

describe("WebsiteLayoutClient account 参数处理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("已登录：打开用户中心弹窗并切换到对应 tab，并清理 URL 参数", async () => {
    window.history.replaceState({}, "", "/?account=devices");
    setupAuth();

    render(<WebsiteLayoutClient>{null}</WebsiteLayoutClient>);

    await waitFor(() => {
      expect(mockOpenUserCenter).toHaveBeenCalledWith("devices");
    });
    expect(window.location.search).toBe("");
    expect(mockRedirectToLogin).not.toHaveBeenCalled();
  });

  it("未登录：跳统一登录页，return_to 指回 /?account=<tab>", async () => {
    window.history.replaceState({}, "", "/?account=history");
    setupAuth({ user: null });

    render(<WebsiteLayoutClient>{null}</WebsiteLayoutClient>);

    await waitFor(() => {
      expect(mockRedirectToLogin).toHaveBeenCalledWith("/?account=history");
    });
    expect(mockOpenUserCenter).not.toHaveBeenCalled();
  });

  it("登录态加载中：不打开弹窗也不跳登录", () => {
    window.history.replaceState({}, "", "/?account=history");
    setupAuth({ user: null, isLoading: true });

    render(<WebsiteLayoutClient>{null}</WebsiteLayoutClient>);

    expect(mockOpenUserCenter).not.toHaveBeenCalled();
    expect(mockRedirectToLogin).not.toHaveBeenCalled();
  });

  it("非法 tab 值回退到 profile", async () => {
    window.history.replaceState({}, "", "/?account=hack");
    setupAuth();

    render(<WebsiteLayoutClient>{null}</WebsiteLayoutClient>);

    await waitFor(() => {
      expect(mockOpenUserCenter).toHaveBeenCalledWith("profile");
    });
  });

  it("无 account 参数时不动作", () => {
    setupAuth();
    render(<WebsiteLayoutClient>{null}</WebsiteLayoutClient>);

    expect(mockOpenUserCenter).not.toHaveBeenCalled();
    expect(mockRedirectToLogin).not.toHaveBeenCalled();
  });
});
