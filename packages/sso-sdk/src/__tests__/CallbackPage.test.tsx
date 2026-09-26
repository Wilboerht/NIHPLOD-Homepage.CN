/**
 * CallbackPage 测试
 *
 * 重点回归：React StrictMode（dev 下 effect mount → cleanup → mount）时
 * 授权码只能交换一次，且后处理（onSuccess）必须仍然执行（不能被第一次
 * cleanup 取消后卡在 loading）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { CallbackPage } from "../react/CallbackPage";
import { SsoError } from "../core/errors";
import type { TokenData } from "../core/storage";

const CLIENT_ID = "test-client";
const mockHandleCallback = vi.fn();
const mockRefreshUser = vi.fn();

vi.mock("../react/SsoProvider", () => ({
  useSso: () => ({
    client: {
      config: { clientId: CLIENT_ID },
      handleCallback: (...args: unknown[]) => mockHandleCallback(...args),
    },
    refreshUser: (...args: unknown[]) => mockRefreshUser(...args),
  }),
}));

const tokenData: TokenData = {
  access_token: "at-1",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "rt-1",
  issued_at: Date.now(),
  expires_at: Date.now() + 900_000,
};

describe("CallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockHandleCallback.mockResolvedValue(tokenData);
    mockRefreshUser.mockResolvedValue(undefined);
  });

  it("StrictMode 下只交换一次授权码，且 onSuccess 仍被调用一次", async () => {
    const onSuccess = vi.fn();
    render(
      <StrictMode>
        <CallbackPage onSuccess={onSuccess} />
      </StrictMode>
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockHandleCallback).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(tokenData);
  });

  it("非 StrictMode 正常路径同样只交换一次", async () => {
    const onSuccess = vi.fn();
    render(<CallbackPage onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockHandleCallback).toHaveBeenCalledTimes(1);
  });

  it("交换失败时展示错误且只上报一次", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHandleCallback.mockRejectedValue(new Error("token endpoint down"));
    const onError = vi.fn();
    const { findByText } = render(
      <StrictMode>
        <CallbackPage onError={onError} />
      </StrictMode>
    );

    await findByText(/登录失败，请重试/);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("技术性 SsoError 转为用户文案并展示重试入口", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHandleCallback.mockRejectedValue(
      new SsoError("state_mismatch", "State 参数不匹配，可能存在 CSRF 攻击")
    );
    const { findByText, getByText } = render(<CallbackPage />);

    const message = await findByText(/登录会话校验失败/);
    expect(message.textContent).not.toContain("CSRF");
    expect(getByText("重新登录")).toBeTruthy();
    expect(getByText("返回上一页")).toBeTruthy();
  });
});
