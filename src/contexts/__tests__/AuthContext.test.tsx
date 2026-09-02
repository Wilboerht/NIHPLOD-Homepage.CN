// @vitest-environment jsdom

/**
 * AuthContext 跨标签页登录态同步测试
 * 覆盖：其它标签页登录（auth_hint 写入）→ 本页强制拉取登录态；
 *       其它标签页登出（auth_hint 清除）→ 本页同步清除 UI 状态
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }));

vi.mock("@/lib/fetch-with-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fetch-with-auth")>("@/lib/fetch-with-auth");
  return {
    ...actual,
    fetchWithAuth: mockFetchWithAuth,
    refreshAccessToken: vi.fn().mockResolvedValue(false),
  };
});

vi.mock("@/lib/api-client", () => ({
  apiPost: vi.fn().mockResolvedValue({}),
}));

function Consumer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `已登录:${user.nickname ?? user.id}` : "未登录"}</div>;
}

function profileResponse(user: { id: string; nickname?: string }) {
  return {
    status: 200,
    json: async () => ({ success: true, data: { user } }),
  } as unknown as Response;
}

/** 模拟其它标签页写入/清除 auth_hint 后触发的 storage 事件 */
function dispatchStorageEvent(newValue: string | null) {
  act(() => {
    if (newValue === null) {
      localStorage.removeItem("auth_hint");
    } else {
      localStorage.setItem("auth_hint", newValue);
    }
    window.dispatchEvent(new StorageEvent("storage", { key: "auth_hint", newValue }));
  });
}

describe("AuthContext 跨标签页同步", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("本页未登录时，其它标签页登录后本页自动拉取登录态", async () => {
    mockFetchWithAuth.mockResolvedValue(
      profileResponse({ id: "user-1", nickname: "测试用户" })
    );
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    // 初始：无 auth_hint → 未登录
    await waitFor(() => {
      expect(screen.getByText("未登录")).toBeInTheDocument();
    });

    // 其它标签页登录成功：写入 auth_hint 并触发 storage 事件
    dispatchStorageEvent("1");

    await waitFor(() => {
      expect(screen.getByText("已登录:测试用户")).toBeInTheDocument();
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/profile");
  });

  it("本页已登录时，其它标签页登出后本页同步清除登录态", async () => {
    mockFetchWithAuth.mockResolvedValue(
      profileResponse({ id: "user-1", nickname: "测试用户" })
    );
    localStorage.setItem("auth_hint", "1");

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("已登录:测试用户")).toBeInTheDocument();
    });

    // 其它标签页登出：清除 auth_hint 并触发 storage 事件
    dispatchStorageEvent(null);

    await waitFor(() => {
      expect(screen.getByText("未登录")).toBeInTheDocument();
    });
  });

  it("与登录态无关的 storage 事件不应触发任何状态变化", async () => {
    mockFetchWithAuth.mockResolvedValue(
      profileResponse({ id: "user-1", nickname: "测试用户" })
    );
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("未登录")).toBeInTheDocument();
    });
    const callsBefore = mockFetchWithAuth.mock.calls.length;

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "other_key", newValue: "whatever" })
      );
    });

    // 等待一个微任务周期，确认没有触发 profile 请求
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchWithAuth.mock.calls.length).toBe(callsBefore);
    expect(screen.getByText("未登录")).toBeInTheDocument();
  });
});
