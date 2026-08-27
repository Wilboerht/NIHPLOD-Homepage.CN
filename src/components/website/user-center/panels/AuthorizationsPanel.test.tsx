// @vitest-environment jsdom

/**
 * 授权管理面板测试
 * 覆盖：授权列表加载渲染、撤销授权（确认/取消）、onRevoked 回调（embed 通知父窗口）
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));
const mockShowError = vi.fn();

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: mockShowError }),
}));

import { AuthorizationsPanel } from "@/components/website/user-center/panels/AuthorizationsPanel";

const SESSIONS = [
  {
    clientId: "client-1",
    clientName: "肌智派",
    scopes: ["openid", "profile"],
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    clientId: "client-2",
    clientName: "门店系统",
    scopes: ["openid"],
    createdAt: "2026-01-02T00:00:00Z",
  },
];

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

function clickRevoke(clientName: string) {
  const card = screen.getByText(clientName).closest("div[class*='rounded-xl']")!;
  fireEvent.click(card.querySelector("button")!);
}

describe("AuthorizationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue(jsonResponse({ success: true, data: SESSIONS }));
  });

  it("加载并渲染授权列表", async () => {
    render(<AuthorizationsPanel />);

    expect(await screen.findByText("肌智派")).toBeInTheDocument();
    expect(screen.getByText("门店系统")).toBeInTheDocument();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/oauth/sessions");
  });

  it("hideTitle 时不渲染内置标题（embed 自带 tab 标题）", async () => {
    render(<AuthorizationsPanel hideTitle />);
    await screen.findByText("肌智派");

    expect(screen.queryByRole("heading", { name: "授权管理" })).not.toBeInTheDocument();
  });

  it("确认撤销：POST /api/user/oauth/revoke、移除条目并触发 onRevoked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRevoked = vi.fn();
    render(<AuthorizationsPanel onRevoked={onRevoked} />);

    await screen.findByText("肌智派");
    clickRevoke("肌智派");

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        "/api/user/oauth/revoke",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(onRevoked).toHaveBeenCalledWith("client-1");
    });
    expect(screen.queryByText("肌智派")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("取消撤销时不发请求", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AuthorizationsPanel />);

    await screen.findByText("肌智派");
    clickRevoke("肌智派");

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1); // 仅初始 GET
    expect(screen.getByText("肌智派")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
