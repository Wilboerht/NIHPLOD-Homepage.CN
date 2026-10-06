/**
 * SsoProvider 跨 Tab 刷新锁测试
 *
 * 验证 withRefreshLock：
 * - 优先使用 Web Locks API（navigator.locks）实现浏览器级真互斥
 * - navigator.locks 不存在或调用异常时回退 localStorage 锁
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import { withRefreshLock, broadcastSsoEvent, SsoProvider } from "../react/SsoProvider";
import { getTokenData, saveTokenData } from "../core/storage";
import type { TokenData } from "../core/storage";

const CLIENT_ID = "test-client-id";
const LOCK_KEY = `nihplod_sso_refresh_lock:${CLIENT_ID}`;

type LockCallback = (lock: { name: string } | null) => Promise<void> | void;

/** 安装一个简单的 mock LockManager：同一时刻只授予一个锁 */
function installMockLocks() {
  const held = new Set<string>();
  const requests: { name: string; options?: { ifAvailable?: boolean } }[] = [];
  const request = vi.fn(
    async (name: string, optionsOrCb: { ifAvailable?: boolean } | LockCallback, maybeCb?: LockCallback) => {
      const options = typeof optionsOrCb === "function" ? {} : optionsOrCb;
      const cb = (typeof optionsOrCb === "function" ? optionsOrCb : maybeCb) as LockCallback;
      requests.push({ name, options });
      if (held.has(name)) {
        if (options.ifAvailable) return cb(null);
        throw new Error("mock: 等待模式未实现");
      }
      held.add(name);
      try {
        await cb({ name });
      } finally {
        held.delete(name);
      }
    }
  );
  Object.defineProperty(navigator, "locks", {
    value: { request },
    configurable: true,
    writable: true,
  });
  return { requests, request };
}

function removeMockLocks() {
  Object.defineProperty(navigator, "locks", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

describe("withRefreshLock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    removeMockLocks();
    vi.restoreAllMocks();
  });

  describe("Web Locks API 路径", () => {
    it("拿到锁时执行刷新任务，使用 nihplod_sso_refresh_<clientId> 锁名与 ifAvailable", async () => {
      const { requests } = installMockLocks();
      const task = vi.fn(async () => {});

      const ran = await withRefreshLock(CLIENT_ID, task);

      expect(ran).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
      expect(requests[0].name).toBe(`nihplod_sso_refresh_${CLIENT_ID}`);
      expect(requests[0].options?.ifAvailable).toBe(true);
    });

    it("锁被其他 Tab 持有（null lock）时不执行任务，返回 false", async () => {
      installMockLocks();
      // 模拟其他 Tab 持锁：直接占用同名锁
      await navigator.locks.request(`nihplod_sso_refresh_${CLIENT_ID}`, async () => {
        const task = vi.fn(async () => {});
        const ran = await withRefreshLock(CLIENT_ID, task);
        expect(ran).toBe(false);
        expect(task).not.toHaveBeenCalled();
      });
    });

    it("并发调用实现真互斥：同一时刻只有一个任务执行", async () => {
      installMockLocks();
      let concurrent = 0;
      let maxConcurrent = 0;
      const task = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
      };

      const results = await Promise.all([
        withRefreshLock(CLIENT_ID, task),
        withRefreshLock(CLIENT_ID, task),
        withRefreshLock(CLIENT_ID, task),
      ]);

      expect(maxConcurrent).toBe(1);
      // ifAvailable 模式：一个拿到锁执行，其余返回 false
      expect(results.filter(Boolean).length).toBe(1);
    });

    it("Web Locks 调用异常时回退 localStorage 锁", async () => {
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi.fn(async () => {
            throw new Error("SecurityError");
          }),
        },
        configurable: true,
        writable: true,
      });
      const task = vi.fn(async () => {});

      const ran = await withRefreshLock(CLIENT_ID, task);

      expect(ran).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
      // localStorage 锁已释放
      expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    });
  });

  describe("localStorage 回退路径（无 navigator.locks）", () => {
    beforeEach(() => {
      removeMockLocks();
    });

    it("锁空闲时执行任务并释放锁", async () => {
      const task = vi.fn(async () => {});

      const ran = await withRefreshLock(CLIENT_ID, task);

      expect(ran).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(LOCK_KEY)).toBeNull();
    });

    it("锁被其他 Tab 持有（未过期）时不执行任务，返回 false", async () => {
      localStorage.setItem(LOCK_KEY, String(Date.now()));
      const task = vi.fn(async () => {});

      const ran = await withRefreshLock(CLIENT_ID, task);

      expect(ran).toBe(false);
      expect(task).not.toHaveBeenCalled();
      // 其他 Tab 的锁不被误删
      expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
    });

    it("锁已过期（超过 TTL）时可抢锁执行", async () => {
      localStorage.setItem(LOCK_KEY, String(Date.now() - 10_000));
      const task = vi.fn(async () => {});

      const ran = await withRefreshLock(CLIENT_ID, task);

      expect(ran).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
    });
  });
});

describe("SsoProvider 跨 Tab token 同步（BroadcastChannel）", () => {
  /** 频道实例注册表：postMessage 记录发出的消息，onmessage 由测试手动触发 */
  class MockBroadcastChannel {
    static instances: MockBroadcastChannel[] = [];
    static posted: unknown[] = [];
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
      MockBroadcastChannel.instances.push(this);
    }
    postMessage(data: unknown) {
      MockBroadcastChannel.posted.push(data);
    }
    close() {}
  }

  const ssoConfig = {
    clientId: CLIENT_ID,
    redirectUri: "https://test-app.com/callback",
    ssoBaseUrl: "https://nihplod.cn",
  };

  const oldToken: TokenData = {
    access_token: "old-access",
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: "old-refresh",
    issued_at: Date.now(),
    expires_at: Date.now() + 900_000,
  };

  const freshToken: TokenData = {
    access_token: "fresh-access",
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: "fresh-refresh",
    issued_at: Date.now(),
    expires_at: Date.now() + 900_000,
  };

  function jsonResponse(data: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
    } as Response;
  }

  /** 渲染 Provider 并返回其监听频道（onmessage 已挂载的那个实例） */
  async function renderProvider() {
    render(
      <SsoProvider config={ssoConfig}>
        <div>app</div>
      </SsoProvider>
    );
    await waitFor(() => {
      expect(
        MockBroadcastChannel.instances.some((c) => c.onmessage !== null)
      ).toBe(true);
    });
    return MockBroadcastChannel.instances.find((c) => c.onmessage !== null)!;
  }

  function dispatch(channel: MockBroadcastChannel, data: unknown) {
    act(() => {
      channel.onmessage!({ data } as MessageEvent);
    });
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    MockBroadcastChannel.instances = [];
    MockBroadcastChannel.posted = [];
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("收到携带 TokenData 的 token 消息：落盘到 sessionStorage，且不触发刷新", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oauth/userinfo")) return jsonResponse({ sub: "user-1" });
      throw new Error(`unexpected fetch: ${url}`);
    });
    saveTokenData(oldToken, CLIENT_ID);

    const channel = await renderProvider();
    dispatch(channel, {
      type: "token",
      sourceTabId: "other-tab",
      tokenData: freshToken,
    });

    // 新 token 已落盘
    expect(getTokenData(CLIENT_ID)?.access_token).toBe("fresh-access");
    expect(getTokenData(CLIENT_ID)?.refresh_token).toBe("fresh-refresh");
    // loadUser 用新 token 拉取 userinfo，但全程没有发起 refresh（旧 RT 已轮换，刷新必败）
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([input]) =>
          String(input).includes("/api/oauth/userinfo")
        )
      ).toBe(true);
    });
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).includes("/api/oauth/token"))
    ).toBe(false);
  });

  it("忽略本 Tab 自己发出的消息（sourceTabId 相同）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oauth/userinfo")) return jsonResponse({ sub: "user-1" });
      throw new Error(`unexpected fetch: ${url}`);
    });
    saveTokenData(oldToken, CLIENT_ID);

    const channel = await renderProvider();
    // 通过 broadcastSsoEvent 发出消息（携带本 Tab 的 TAB_ID），再喂回监听频道
    broadcastSsoEvent(CLIENT_ID, "token", freshToken);
    const ownMessage = MockBroadcastChannel.posted[0];
    dispatch(channel, ownMessage);

    // 自己发出的消息被忽略：token 未被覆盖
    expect(getTokenData(CLIENT_ID)?.access_token).toBe("old-access");
  });

  it("畸形 tokenData 不落盘，仅按旧版行为 loadUser", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oauth/userinfo")) return jsonResponse({ sub: "user-1" });
      throw new Error(`unexpected fetch: ${url}`);
    });
    saveTokenData(oldToken, CLIENT_ID);

    const channel = await renderProvider();
    dispatch(channel, {
      type: "token",
      sourceTabId: "other-tab",
      tokenData: { access_token: "fresh-access", expires_at: "not-a-number" },
    });

    // 形状校验未通过：本地 token 保持不变
    expect(getTokenData(CLIENT_ID)?.access_token).toBe("old-access");
  });

  it("无 tokenData 的 token 消息（旧版 SDK 的 Tab）：退化为 loadUser", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oauth/userinfo")) return jsonResponse({ sub: "user-1" });
      throw new Error(`unexpected fetch: ${url}`);
    });
    saveTokenData(oldToken, CLIENT_ID);

    const channel = await renderProvider();
    dispatch(channel, { type: "token", sourceTabId: "other-tab" });

    // 不落盘，但会触发 loadUser（userinfo 请求）
    expect(getTokenData(CLIENT_ID)?.access_token).toBe("old-access");
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([input]) =>
          String(input).includes("/api/oauth/userinfo")
        )
      ).toBe(true);
    });
  });

  it("logout 消息不携带 tokenData", () => {
    broadcastSsoEvent(CLIENT_ID, "logout");
    const message = MockBroadcastChannel.posted[0] as Record<string, unknown>;
    expect(message.type).toBe("logout");
    expect("tokenData" in message).toBe(false);
  });
});
