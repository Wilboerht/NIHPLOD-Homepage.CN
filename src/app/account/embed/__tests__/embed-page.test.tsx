// @vitest-environment jsdom

/**
 * 嵌入式用户中心（/account/embed）postMessage 协议回归测试
 * 覆盖：NIHPLOD_SSO_READY / NIHPLOD_SSO_REVOKE / NIHPLOD_SSO_LOGOUT，
 * 以及授权管理复用共享面板后撤销链路不回归
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import EmbedAccountPage from "@/app/account/embed/page";

const USER = {
  id: "u1",
  phone: "13800138000",
  nickname: "测试用户",
  avatar: null,
  membershipLevel: "REGULAR",
};

const SESSIONS = [
  {
    clientId: "client-1",
    clientName: "肌智派",
    scopes: ["openid"],
    createdAt: "2026-01-01T00:00:00Z",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 按 URL + method 路由的 fetch mock */
function mockApiFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/user/profile")) {
      return jsonResponse({ success: true, data: { user: USER } });
    }
    if (url.startsWith("/api/user/oauth/sessions")) {
      return jsonResponse({ success: true, data: SESSIONS });
    }
    if (url.startsWith("/api/user/oauth/revoke")) {
      return jsonResponse({ success: true });
    }
    if (url.startsWith("/api/auth/logout")) {
      return jsonResponse({ success: true });
    }
    if (url.startsWith("/api/auth/csrf")) {
      return jsonResponse({ success: true, data: { token: "test-csrf" } });
    }
    return jsonResponse({ success: false, error: { message: "not found" } }, 404);
  });
}

describe("EmbedAccountPage postMessage 协议", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockApiFetch());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // jsdom 中 window.parent === window，模拟被父窗口嵌入的场景
    Object.defineProperty(window, "parent", {
      value: { postMessage },
      configurable: true,
    });
    // 模拟父窗口 origin（embed 通过 referrer 推导 postMessage targetOrigin）
    Object.defineProperty(document, "referrer", {
      value: "https://child.example.com/page",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(window, "parent", { value: window, configurable: true });
  });

  function expectPosted(type: string, extra?: Record<string, unknown>) {
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type, ...extra }),
      "https://child.example.com"
    );
  }

  it("加载完成后向父窗口发送 NIHPLOD_SSO_READY", async () => {
    render(<EmbedAccountPage />);
    await screen.findByText("138****8000");

    expectPosted("NIHPLOD_SSO_READY");
  });

  it("撤销授权后发送 NIHPLOD_SSO_REVOKE（含 clientId）", async () => {
    render(<EmbedAccountPage />);
    await screen.findByText("138****8000");

    fireEvent.click(screen.getByRole("button", { name: "授权管理" }));
    const clientName = await screen.findByText("肌智派");
    const card = clientName.closest("div[class*='rounded-xl']")!;
    fireEvent.click(card.querySelector("button")!);

    await waitFor(() => {
      expectPosted("NIHPLOD_SSO_REVOKE", { clientId: "client-1" });
    });
  });

  it("退出登录后发送 NIHPLOD_SSO_LOGOUT", async () => {
    render(<EmbedAccountPage />);
    await screen.findByText("138****8000");

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expectPosted("NIHPLOD_SSO_LOGOUT");
    });
  });

  it("无法推导父窗口 origin 时不发送消息", async () => {
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<EmbedAccountPage />);
    await screen.findByText("138****8000");

    expect(postMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
