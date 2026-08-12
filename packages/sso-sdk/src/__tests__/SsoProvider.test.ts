/**
 * SsoProvider 跨 Tab 刷新锁测试
 *
 * 验证 withRefreshLock：
 * - 优先使用 Web Locks API（navigator.locks）实现浏览器级真互斥
 * - navigator.locks 不存在或调用异常时回退 localStorage 锁
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { withRefreshLock } from "../react/SsoProvider";

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
