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
    // 清理用例间遗留的 id_token_hint fragment
    window.location.hash = "";
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

  it("access token 过期但 refresh 会话仍有效：不跳过登出，进入确认页", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/user/profile")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ success: false }),
        });
      }
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      if (url.includes("/api/oauth/check-post-logout-uri")) {
        return Promise.resolve({ ok: true, json: async () => ({ trusted: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<LogoutPage />);

    // 关键：access 失效不能当作"无会话"，否则会直接回跳而不撤销 refresh/OAuth 会话
    await waitFor(() => {
      expect(screen.getByText("确定要退出当前设备的登录吗？")).toBeInTheDocument();
    });
    const refreshCalled = fetchMock.mock.calls.some(([input]) =>
      String(input).includes("/api/auth/refresh")
    );
    expect(refreshCalled).toBe(true);
    // 未点击确认前不得自动登出
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/auth/logout"))
    ).toBe(false);
  });

  it("hint 验签通过且与会话一致时仍展示确认页，不自动调用 /api/auth/logout", async () => {
    // 免确认自动登出已移除：RP 级登出由 end-session 快速通道服务端完成，
    // 到达本页必须用户点击确认。hint 验签结果仅用于不一致提示。
    window.location.hash = "#id_token_hint=valid-hint";
    fetchMock.mockImplementation((input: RequestInfo | URL, _?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/user/profile")) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      if (url.includes("/api/oauth/logout/verify-hint")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ valid: true, matchesSession: true }),
        });
      }
      if (url.includes("/api/oauth/check-post-logout-uri")) {
        return Promise.resolve({ ok: true, json: async () => ({ trusted: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<LogoutPage />);

    await waitFor(() => {
      expect(screen.getByText("确定要退出当前设备的登录吗？")).toBeInTheDocument();
    });
    // verify-hint 已完成（matchesSession=true）后仍停留在确认页，不自动登出
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("verify-hint"))
      ).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/auth/logout"))
    ).toBe(false);
    // 不再出现免确认过渡态文案
    expect(screen.queryByText("正在退出登录...")).not.toBeInTheDocument();
  });

  it("access 与 refresh 均失效：判定无会话，不调用登出接口", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/user/profile")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ success: false }),
        });
      }
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ success: false }),
        });
      }
      if (url.includes("/api/oauth/check-post-logout-uri")) {
        return Promise.resolve({ ok: true, json: async () => ({ trusted: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<LogoutPage />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("/api/auth/refresh"))
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/auth/logout"))
    ).toBe(false);
  });
});
