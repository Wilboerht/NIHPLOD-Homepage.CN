// @vitest-environment jsdom

/**
 * 账号注销面板测试（安全中心「账号注销」分段）
 * 覆盖：表单渲染、未勾选确认本地拦截、提交流程（POST + 冷静期视图 + warnings）、
 *       PENDING 状态展示与撤回、占位手机号账号引导、未设密码引导
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockFetchWithAuth, mockAuthState, mockCancelDeletionRequest } = vi.hoisted(() => ({
  mockFetchWithAuth: vi.fn(),
  mockAuthState: {
    user: { id: "u1", phone: "13800138000", hasPassword: true } as {
      id: string;
      phone?: string;
      hasPassword?: boolean;
    } | null,
    refreshDeletionRequest: vi.fn(),
  },
  mockCancelDeletionRequest: vi.fn(),
}));
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return { ...actual, fetchWithAuth: mockFetchWithAuth };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    refreshDeletionRequest: mockAuthState.refreshDeletionRequest,
    cancelDeletionRequest: mockCancelDeletionRequest,
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockShowSuccess, error: mockShowError }),
}));

import { AccountDeletionPanel } from "@/components/website/user-center/panels/AccountDeletionPanel";

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

const noRequest = jsonResponse({ success: true, data: { request: null } });

const pendingRequest = {
  status: "PENDING",
  scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  remainingDays: 7,
};

describe("AccountDeletionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = { id: "u1", phone: "13800138000", hasPassword: true };
    mockFetchWithAuth.mockResolvedValue(noRequest);
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it("渲染风险说明与申请表单（密码/勾选/提交按钮）", async () => {
    render(<AccountDeletionPanel embedded />);
    await waitFor(() => {
      expect(screen.getByLabelText(/登录密码/)).toBeInTheDocument();
    });
    expect(screen.getByText("以下数据将被删除或不可逆匿名化")).toBeInTheDocument();
    expect(screen.getByText(/以下数据将依法保留/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "申请注销账号" })).toBeDisabled();
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/account/deletion");
  });

  it("勾选确认并填写密码后提交：POST 成功进入冷静期视图并同步全局状态", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(noRequest)
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { request: pendingRequest, warnings: ["您有 100 积分未使用，注销后积分将作废"] },
        })
      );

    render(<AccountDeletionPanel embedded />);
    await waitFor(() => screen.getByLabelText(/登录密码/));

    fireEvent.change(screen.getByLabelText(/登录密码/), { target: { value: "Pass1234" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "申请注销账号" }));

    await waitFor(() => {
      expect(screen.getByText(/注销处理中/)).toBeInTheDocument();
    });
    expect(mockFetchWithAuth).toHaveBeenLastCalledWith(
      "/api/user/account/deletion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "Pass1234", reason: undefined }),
      })
    );
    // 未履约权益提示内联展示
    expect(screen.getByText(/100 积分未使用/)).toBeInTheDocument();
    // 同步 AuthContext 驱动全局横幅
    expect(mockAuthState.refreshDeletionRequest).toHaveBeenCalled();
  });

  it("占位手机号账号直接展示客服引导，不渲染表单", async () => {
    mockAuthState.user = { id: "u1", phone: "wx_abc123", hasPassword: false };
    render(<AccountDeletionPanel embedded />);
    await waitFor(() => {
      expect(screen.getByText(/service@nihplod\.cn/)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/登录密码/)).not.toBeInTheDocument();
  });

  it("服务端返回 PLACEHOLDER_ACCOUNT_UNSUPPORTED 时展示引导文案", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(noRequest)
      .mockResolvedValueOnce(
        jsonResponse({
          success: false,
          error: { code: "PLACEHOLDER_ACCOUNT_UNSUPPORTED", message: "请联系客服 service@nihplod.cn 办理" },
        })
      );

    render(<AccountDeletionPanel embedded />);
    await waitFor(() => screen.getByLabelText(/登录密码/));
    fireEvent.change(screen.getByLabelText(/登录密码/), { target: { value: "Pass1234" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "申请注销账号" }));

    await waitFor(() => {
      expect(screen.getByText(/service@nihplod\.cn/)).toBeInTheDocument();
    });
  });

  it("未设置密码的账号引导先设密码，不渲染表单", async () => {
    mockAuthState.user = { id: "u1", phone: "13800138000", hasPassword: false };
    render(<AccountDeletionPanel embedded />);
    await waitFor(() => {
      expect(screen.getByText(/请先在「个人信息」中设置登录密码/)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/登录密码/)).not.toBeInTheDocument();
  });

  it("已有 PENDING 申请：展示冷静期状态与撤回按钮，撤回成功回到表单", async () => {
    mockFetchWithAuth.mockResolvedValue(
      jsonResponse({ success: true, data: { request: pendingRequest } })
    );
    mockCancelDeletionRequest.mockResolvedValue(true);

    render(<AccountDeletionPanel embedded />);
    await waitFor(() => {
      expect(screen.getByText(/注销处理中/)).toBeInTheDocument();
    });
    expect(screen.getByText(/7 天后/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤回注销申请" }));

    await waitFor(() => {
      expect(screen.getByLabelText(/登录密码/)).toBeInTheDocument();
    });
    expect(mockCancelDeletionRequest).toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith("注销申请已撤回，账号恢复正常");
  });
});
