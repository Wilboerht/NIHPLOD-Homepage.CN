// @vitest-environment jsdom

/**
 * /logout 确认页分层退出测试
 * 覆盖：确认页主文案统一为"退出当前设备的登录"语义（含带 client_id 场景）、
 * 复选框默认不勾选时 body 为 { allDevices: false, clientId }、
 * 勾选"同时退出所有设备和已授权的平台"后 body 为 { allDevices: true, clientId }、
 * 无 client_id 时 body 不携带 clientId
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

import LogoutPage from "./page";
import { useSearchParams } from "next/navigation";

const mockUseSearchParams = useSearchParams as unknown as ReturnType<typeof vi.fn>;

// 按 URL 路由的 fetch 桩：会话探测 / 回跳地址校验 / CSRF / 登出
function createFetchMock() {
  return vi.fn((input: RequestInfo | URL, _?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/user/profile")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    }
    if (url.includes("/api/oauth/check-post-logout-uri")) {
      return Promise.resolve({ ok: true, json: async () => ({ trusted: true }) });
    }
    if (url.includes("/api/auth/csrf")) {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes("/api/auth/logout")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

let fetchMock: ReturnType<typeof createFetchMock>;

function getLogoutRequestBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/auth/logout"));
  expect(call).toBeDefined();
  return JSON.parse(String(call![1]?.body));
}

describe("LogoutPage 分层退出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    // 带 client_id 渲染：验证主文案不再承诺"同步退出已授权的应用"
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("client_id=test-client&post_logout_redirect_uri=/dashboard")
    );
    // jsdom 拒绝在非 secure context 写入 __Host- 前缀 Cookie，直接覆写 document.cookie
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "__Host-csrf_token=test-csrf-token",
      set: () => {},
    });
  });

  it("主文案统一为退出当前设备，复选框默认不勾选", async () => {
    render(<LogoutPage />);

    await waitFor(() => {
      expect(screen.getByText("确定要退出当前设备的登录吗？")).toBeInTheDocument();
    });
    // 不再出现"同步退出已授权的应用"的旧承诺文案
    expect(screen.queryByText(/同步退出已授权的应用/)).not.toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", {
      name: /同时退出所有设备和已授权的平台/,
    });
    expect(checkbox).not.toBeChecked();
  });

  it("默认不勾选：确认退出时 body 为 { allDevices: false, clientId }", async () => {
    render(<LogoutPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认退出" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

    await waitFor(() => {
      // clientId 透传给登出 API：主站会话无 clientId 时据此闭环撤销该子站的 OAuth 会话
      expect(getLogoutRequestBody()).toEqual({ allDevices: false, clientId: "test-client" });
    });
  });

  it("勾选复选框后确认退出：body 为 { allDevices: true, clientId }", async () => {
    render(<LogoutPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认退出" })).toBeEnabled();
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /同时退出所有设备和已授权的平台/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

    await waitFor(() => {
      expect(getLogoutRequestBody()).toEqual({ allDevices: true, clientId: "test-client" });
    });
  });

  it("无 client_id 参数时 body 不携带 clientId", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("post_logout_redirect_uri=/dashboard"));
    render(<LogoutPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认退出" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

    await waitFor(() => {
      expect(getLogoutRequestBody()).toEqual({ allDevices: false });
    });
  });
});
