// @vitest-environment jsdom

/**
 * AuthContext 跨标签页登录态同步测试
 * 覆盖：其它标签页登录（auth_hint 写入）→ 本页强制拉取登录态；
 *       其它标签页登出（auth_hint 清除）→ 本页同步清除 UI 状态
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SESSION_EXPIRED_EVENT } from "@/lib/fetch-with-auth";

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

describe("AuthContext 会话终结处理（401 拦截）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("登录态下收到会话终结事件：清除登录态与 auth_hint", async () => {
    mockFetchWithAuth.mockResolvedValue(profileResponse({ id: "user-1", nickname: "测试用户" }));
    localStorage.setItem("auth_hint", "1");

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("已登录:测试用户")).toBeInTheDocument();
    });

    // jsdom 不实现导航：location.href 赋值仅产生 stderr 噪音，不影响断言
    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByText("未登录")).toBeInTheDocument();
    });
    expect(localStorage.getItem("auth_hint")).toBeNull();
  });

  it("游客态收到会话终结事件：不触发任何状态变化", async () => {
    mockFetchWithAuth.mockResolvedValue(profileResponse({ id: "user-1" }));
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("未登录")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("未登录")).toBeInTheDocument();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });
});

describe("AuthContext 注销冷静期状态", () => {
  const deletionPending = {
    scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    remainingDays: 7,
  };

  function DeletionConsumer() {
    const { user, isLoading, deletionRequest, cancelDeletionRequest } = useAuth();
    if (isLoading) return <div>loading</div>;
    return (
      <div>
        <div>{user ? "已登录" : "未登录"}</div>
        <div>{deletionRequest ? `注销中:${deletionRequest.remainingDays}天` : "无注销申请"}</div>
        <button onClick={() => void cancelDeletionRequest()}>撤回</button>
      </div>
    );
  }

  /** 按 URL 分发 mock：profile 正常登录，deletion 返回指定响应 */
  function mockByUrl(deletionBody: unknown) {
    mockFetchWithAuth.mockImplementation((url: string, options?: { method?: string }) => {
      if (url === "/api/user/account/deletion" && options?.method === "DELETE") {
        return Promise.resolve({
          status: 200,
          json: async () => ({ success: true, data: { message: "注销申请已撤回" } }),
        } as unknown as Response);
      }
      if (url === "/api/user/account/deletion") {
        return Promise.resolve({
          status: 200,
          json: async () => deletionBody,
        } as unknown as Response);
      }
      return Promise.resolve(profileResponse({ id: "user-1", nickname: "测试用户" }));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("auth_hint", "1");
  });

  it("登录成功后拉取注销申请：存在 PENDING 时暴露 deletionRequest", async () => {
    mockByUrl({ success: true, data: { request: deletionPending } });

    render(
      <AuthProvider>
        <DeletionConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("注销中:7天")).toBeInTheDocument();
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith("/api/user/account/deletion");
  });

  it("无进行中申请时 deletionRequest 为 null", async () => {
    mockByUrl({ success: true, data: { request: null } });

    render(
      <AuthProvider>
        <DeletionConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("已登录")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("无注销申请")).toBeInTheDocument();
    });
  });

  it("cancelDeletionRequest：DELETE 撤回成功后清除冷静期状态", async () => {
    mockByUrl({ success: true, data: { request: deletionPending } });

    render(
      <AuthProvider>
        <DeletionConsumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("注销中:7天")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "撤回" }));

    await waitFor(() => {
      expect(screen.getByText("无注销申请")).toBeInTheDocument();
    });
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      "/api/user/account/deletion",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("AuthContext 会话终结与登录页竞态", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // 每个用例显式设定 URL，避免相互影响（jsdom 默认 http://localhost:3000/）
    window.history.replaceState(null, "", "/");
  });

  it("已在 /login 面板时触发会话终结：不整页跳转，仅清态并给当前 URL 补 expired=1", async () => {
    mockFetchWithAuth.mockResolvedValue(profileResponse({ id: "user-1" }));
    localStorage.setItem("auth_hint", "1");
    // 模拟用户正在 SSO 登录面板上（return_to 指向 authorize）
    window.history.replaceState(
      null,
      "",
      "/login?return_to=%2Fapi%2Foauth%2Fauthorize%3Fclient_id%3Dabc"
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });

    // 清态
    expect(localStorage.getItem("auth_hint")).toBeNull();
    // 关键：不整页跳转、return_to 不被套娃（仍为 authorize，而非指向 /login 自身），
    // 仅在原 URL 上补 expired=1 供登录页展示内嵌提示
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toContain("return_to=%2Fapi%2Foauth%2Fauthorize%3Fclient_id%3Dabc");
    expect(window.location.search).toContain("expired=1");
    expect(window.location.search).not.toContain("mode=login");
  });

  it("已在 /login 且 URL 已含 expired=1：不重复追加参数", async () => {
    mockFetchWithAuth.mockResolvedValue(profileResponse({ id: "user-1" }));
    localStorage.setItem("auth_hint", "1");
    window.history.replaceState(null, "", "/login?expired=1");

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });

    expect(window.location.search).toBe("?expired=1");
    expect(localStorage.getItem("auth_hint")).toBeNull();
  });
});
