// @vitest-environment jsdom

/**
 * 登录历史面板测试
 * 覆盖：记录加载渲染、登录方式/结果的中文映射、空态
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { LoginHistoryPanel } from "@/components/website/user-center/panels/LoginHistoryPanel";

const RECORDS = [
  {
    id: "r1",
    identifier: "13800138000",
    type: "sms",
    success: true,
    reason: null,
    ipAddress: "1.2.3.4",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "r2",
    identifier: "13800138000",
    type: "password",
    success: false,
    reason: "wrong_password",
    ipAddress: "5.6.7.8",
    createdAt: "2026-01-02T00:00:00Z",
  },
];

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

describe("LoginHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载并渲染登录记录（方式与结果中文映射）", async () => {
    mockFetchWithAuth.mockResolvedValue(jsonResponse({ success: true, data: RECORDS }));
    render(<LoginHistoryPanel />);

    expect(await screen.findByText("验证码")).toBeInTheDocument();
    expect(screen.getByText("密码")).toBeInTheDocument();
    expect(screen.getByText("成功")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/login-history");
  });

  it("无记录时显示空态", async () => {
    mockFetchWithAuth.mockResolvedValue(jsonResponse({ success: true, data: [] }));
    render(<LoginHistoryPanel />);

    expect(await screen.findByText("暂无登录记录")).toBeInTheDocument();
  });
});
