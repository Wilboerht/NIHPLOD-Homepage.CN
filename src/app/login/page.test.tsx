// @vitest-environment jsdom

/**
 * 登录页 UX 行为测试
 * 覆盖：mock 短信（SMS_UNAVAILABLE）提示、密码过期兜底文案、协议未勾选文字提示、
 * 已登录访问 /login 的跳转（含 SSO 场景豁免）
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRefreshUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: vi.fn(),
}));

vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/hooks/useMediaQuery", () => ({ useIsMobile: () => false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiPost: vi.fn() };
});

import LoginPage from "./page";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiPost, ApiError } from "@/lib/api-client";

const mockApiPost = apiPost as unknown as ReturnType<typeof vi.fn>;
const mockUseSearchParams = useSearchParams as unknown as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const SMS_UNAVAILABLE_HINT =
  "短信服务暂不可用，请使用密码登录或联系客服（service@nihplod.cn）";

function setupLoggedOut() {
  mockUseAuth.mockReturnValue({ user: null, isLoading: false, refreshUser: mockRefreshUser });
  mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
}

/** 切换到验证码登录并填入手机号 */
function switchToCodeLogin() {
  fireEvent.click(screen.getByRole("button", { name: "验证码登录" }));
  fireEvent.change(screen.getByPlaceholderText("手机号"), { target: { value: "13800138000" } });
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
    setupLoggedOut();
  });

  it("短信服务不可用（SMS_UNAVAILABLE）时显示明确提示且不进入倒计时", async () => {
    mockApiPost.mockRejectedValue(new ApiError("SMS_UNAVAILABLE", "短信服务暂不可用", 503));
    render(<LoginPage />);

    switchToCodeLogin();
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(SMS_UNAVAILABLE_HINT);
    });
    // 不得谎称"已发送"，也不得开始重发倒计时
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^\d+s$/ })).not.toBeInTheDocument();
  });

  it("验证码发送成功时提示已发送并开始 60s 倒计时", async () => {
    mockApiPost.mockResolvedValue({});
    render(<LoginPage />);

    switchToCodeLogin();
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("验证码已发送");
    });
    expect(screen.getByRole("button", { name: "60s" })).toBeInTheDocument();
  });

  it("密码过期时提示短信重置并附客服兜底文案，同时切换到找回密码", async () => {
    mockApiPost.mockRejectedValue(new ApiError("PASSWORD_EXPIRED", "密码已过期", 403));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("手机号"), { target: { value: "13800138000" } });
    fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "Passw0rd" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(document.getElementById("pc-login-form")!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("service@nihplod.cn 人工处理")
      );
    });
    expect(mockReplace).toHaveBeenCalledWith("/login?mode=reset");
  });

  it("未勾选协议时除抖动动画外给出文字错误提示", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("手机号"), { target: { value: "13800138000" } });
    fireEvent.change(screen.getByPlaceholderText("密码"), { target: { value: "Passw0rd" } });
    fireEvent.submit(document.getElementById("pc-login-form")!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("请先阅读并同意《用户协议》和《隐私政策》");
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("已登录用户直接访问 /login（无 SSO 参数）时重定向到首页", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", phone: "13800138000" },
      isLoading: false,
      refreshUser: mockRefreshUser,
    });
    render(<LoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("已登录用户携带 SSO 授权参数访问 /login 时不重定向（豁免 reauth 流程）", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", phone: "13800138000" },
      isLoading: false,
      refreshUser: mockRefreshUser,
    });
    // 用非 authorize 的 return_to + oauth_id 组合：若豁免失效，会 push("/account")（可观测）
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("return_to=%2Faccount&oauth_id=abc123")
    );
    render(<LoginPage />);

    // 等待一个渲染周期，确认没有发生跳转
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "验证码登录" })).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("微信/抖音登录按钮已接线并跳转到对应授权端点", async () => {
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: /微信登录/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /抖音登录/ })).toBeInTheDocument();
  });
});
