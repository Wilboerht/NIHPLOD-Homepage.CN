// @vitest-environment jsdom

/**
 * 安全设置面板测试
 * 覆盖：修改密码提交、密码不一致/强度不足的本地校验、
 * PASSWORD_NOT_SET 切换首次设置流程、短信验证码设置密码
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", phone: "13800138000" } }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: mockShowSuccess, error: mockShowError }),
}));

import { SecurityPanel } from "@/components/website/user-center/panels/SecurityPanel";

function jsonResponse(body: unknown) {
  return { status: 200, json: async () => body } as unknown as Response;
}

/** 填写修改密码表单（change 模式） */
function fillChangeForm(newPwd = "Abcdefg1") {
  fireEvent.change(screen.getByLabelText("旧密码"), { target: { value: "OldPass123" } });
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: newPwd } });
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: newPwd } });
}

describe("SecurityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染修改密码表单（旧密码/新密码/确认新密码）", () => {
    render(<SecurityPanel />);
    expect(screen.getByLabelText("旧密码")).toBeInTheDocument();
    expect(screen.getByLabelText("新密码")).toBeInTheDocument();
    expect(screen.getByLabelText("确认新密码")).toBeInTheDocument();
  });

  it("两次输入的密码不一致时本地报错，不发请求", async () => {
    render(<SecurityPanel />);
    fireEvent.change(screen.getByLabelText("旧密码"), { target: { value: "OldPass123" } });
    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "Abcdefg1" } });
    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "Abcdefg2" } });
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("两次输入的密码不一致");
    });
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it("密码强度不足时本地报错，不发请求", async () => {
    render(<SecurityPanel />);
    fillChangeForm("weak");
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it("修改密码成功：PUT /api/user/password 并提示成功", async () => {
    mockFetchWithAuth.mockResolvedValue(jsonResponse({ success: true }));
    render(<SecurityPanel />);
    fillChangeForm();
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("密码修改成功");
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      "/api/user/password",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("PASSWORD_NOT_SET 时切换到短信验证码设置流程", async () => {
    mockFetchWithAuth.mockResolvedValue(
      jsonResponse({ success: false, error: { code: "PASSWORD_NOT_SET" } })
    );
    render(<SecurityPanel />);
    fillChangeForm();
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => {
      expect(screen.getByLabelText("短信验证码")).toBeInTheDocument();
    });
  });

  it("首次设置密码：发送验证码 + POST /api/user/password/set", async () => {
    // 第一次提交触发 PASSWORD_NOT_SET，之后 send-code / password/set 均成功
    mockFetchWithAuth
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: "PASSWORD_NOT_SET" } })
      )
      .mockResolvedValue(jsonResponse({ success: true }));

    render(<SecurityPanel />);
    fillChangeForm();
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => {
      expect(screen.getByLabelText("短信验证码")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        "/api/auth/send-code",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "设置密码" }));

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        "/api/user/password/set",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("密码设置成功");
    });
  });
});
