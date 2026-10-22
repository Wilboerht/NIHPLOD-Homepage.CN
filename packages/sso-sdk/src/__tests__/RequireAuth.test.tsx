import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RequireAuth } from "../react/RequireAuth";

const mockLogin = vi.fn();
const mockLoginPopup = vi.fn();

vi.mock("../react/SsoProvider", () => ({
  useSso: () => ({
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    loginPopup: mockLoginPopup,
  }),
}));

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("自定义登录失败 UI 可以通过 retry 重新发起登录", async () => {
    mockLogin
      .mockRejectedValueOnce(new Error("popup_closed"))
      .mockResolvedValueOnce(undefined);

    render(
      <RequireAuth
        renderLoginError={(_, retry) => (
          <button onClick={retry}>自定义重试</button>
        )}
      >
        <div>受保护内容</div>
      </RequireAuth>
    );

    const retryButton = await screen.findByRole("button", { name: "自定义重试" });
    expect(mockLogin).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButton);

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "自定义重试" })).toBeNull();
  });
});
