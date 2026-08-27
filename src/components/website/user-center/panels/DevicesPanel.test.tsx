// @vitest-environment jsdom

/**
 * 设备管理面板测试
 * 覆盖：设备列表加载渲染、强制下线确认与取消
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockShowSuccess, error: mockShowError }),
}));

import { DevicesPanel } from "@/components/website/user-center/panels/DevicesPanel";

const DEVICES = [
  {
    id: "d1",
    deviceName: "iPhone 15",
    ipAddress: "1.2.3.4",
    createdAt: "2026-01-01T00:00:00Z",
    lastActiveAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "d2",
    deviceName: "MacBook Pro",
    ipAddress: "5.6.7.8",
    createdAt: "2026-01-03T00:00:00Z",
    lastActiveAt: "2026-01-04T00:00:00Z",
  },
];

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

describe("DevicesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue(jsonResponse({ success: true, data: DEVICES }));
  });

  it("加载并渲染设备列表", async () => {
    render(<DevicesPanel />);

    expect(await screen.findByText("iPhone 15")).toBeInTheDocument();
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/devices");
  });

  it("确认后强制下线：DELETE 对应设备并从列表移除", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DevicesPanel />);

    const device = await screen.findByText("iPhone 15");
    const card = device.closest("div[class*='rounded-xl']")!;
    fireEvent.click(card.querySelector("button")!);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/devices/d1", {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("iPhone 15")).not.toBeInTheDocument();
    });
    expect(mockShowSuccess).toHaveBeenCalledWith("已将该设备强制下线");
    vi.restoreAllMocks();
  });

  it("取消确认时不发 DELETE 请求", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DevicesPanel />);

    const device = await screen.findByText("iPhone 15");
    const card = device.closest("div[class*='rounded-xl']")!;
    fireEvent.click(card.querySelector("button")!);

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1); // 仅初始 GET
    expect(screen.getByText("iPhone 15")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
