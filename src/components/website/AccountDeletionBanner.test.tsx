// @vitest-environment jsdom

/**
 * 注销冷静期全局横幅测试
 * 覆盖：无申请/未登录不渲染、存在 PENDING 申请时展示文案、
 *       撤回按钮调用 cancelDeletionRequest、撤回失败提示
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockAuthState, mockCancelDeletionRequest, mockOpenUserCenter } = vi.hoisted(() => ({
  mockAuthState: {
    user: { id: "u1" } as { id: string } | null,
    deletionRequest: null as { scheduledAt: string; remainingDays: number } | null,
  },
  mockCancelDeletionRequest: vi.fn(),
  mockOpenUserCenter: vi.fn(),
}));
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    deletionRequest: mockAuthState.deletionRequest,
    cancelDeletionRequest: mockCancelDeletionRequest,
    openUserCenter: mockOpenUserCenter,
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockShowSuccess, error: mockShowError }),
}));

import { AccountDeletionBanner } from "@/components/website/AccountDeletionBanner";

const pending = {
  scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  remainingDays: 5,
};

describe("AccountDeletionBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = { id: "u1" };
    mockAuthState.deletionRequest = null;
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it("无进行中申请时不渲染", () => {
    const { container } = render(<AccountDeletionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("未登录时不渲染（即使有申请数据）", () => {
    mockAuthState.user = null;
    mockAuthState.deletionRequest = pending;
    const { container } = render(<AccountDeletionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("存在 PENDING 申请时展示冷静期文案与操作入口", () => {
    mockAuthState.deletionRequest = pending;
    render(<AccountDeletionBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("账号注销处理中，将于 5 天后生效");
    expect(screen.getByRole("button", { name: "撤回注销申请" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看详情" })).toBeInTheDocument();
  });

  it("点击撤回：确认后调用 cancelDeletionRequest 并提示成功", async () => {
    mockAuthState.deletionRequest = pending;
    mockCancelDeletionRequest.mockResolvedValue(true);

    render(<AccountDeletionBanner />);
    fireEvent.click(screen.getByRole("button", { name: "撤回注销申请" }));

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("注销申请已撤回，账号恢复正常");
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(mockCancelDeletionRequest).toHaveBeenCalled();
  });

  it("撤回失败时提示错误", async () => {
    mockAuthState.deletionRequest = pending;
    mockCancelDeletionRequest.mockResolvedValue(false);

    render(<AccountDeletionBanner />);
    fireEvent.click(screen.getByRole("button", { name: "撤回注销申请" }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("撤回失败，请稍后再试");
    });
  });

  it("点击查看详情：打开用户中心账号注销分段", () => {
    mockAuthState.deletionRequest = pending;
    render(<AccountDeletionBanner />);
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    expect(mockOpenUserCenter).toHaveBeenCalledWith("deletion");
  });
});
