// @vitest-environment jsdom

/**
 * fetch-with-auth 测试：刷新三态（ok / fatal / retryable）与登出事件边界
 *
 * 关键回归：
 * - 网络/5xx/429 等可恢复失败不得广播 SESSION_EXPIRED_EVENT（防一次抖动强制登出）
 * - 仅服务端明确判定会话终结（TOKEN_REVOKED/DEVICE_LIMIT_EXCEEDED 等）才广播
 * - 并发 401 共享同一次刷新（refreshPromise 锁）
 *
 * 说明：为隔离 ensureCSRFToken 的 /api/auth/csrf 请求，mock 对 csrf 请求固定返回
 * 有效 token，其余请求按测试预先排队的响应依次出队。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithAuth,
  refreshAccessToken,
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_HINT_KEY,
  UnauthorizedError,
} from "@/lib/fetch-with-auth";

const fetchMock = vi.fn();

type QueuedResult = Response | { reject: Error };

let queue: QueuedResult[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 刷新成功响应（非 401 即可） */
function refreshOk(): Response {
  return jsonResponse(200, { success: true, data: {} });
}

describe("fetch-with-auth 刷新三态", () => {
  beforeEach(() => {
    queue = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input) === "/api/auth/csrf") {
        return jsonResponse(200, { success: true, data: { token: "csrf-token" } });
      }
      const next = queue.shift();
      if (!next) throw new Error(`unexpected fetch: ${String(input)}`);
      if ("reject" in next) throw next.reject;
      return next;
    });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("刷新成功：重试原请求并返回 200", async () => {
    queue = [jsonResponse(401, {}), refreshOk(), jsonResponse(200, { ok: true })];

    const res = await fetchWithAuth("/api/user/profile");

    expect(res.status).toBe(200);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/auth/refresh")
    ).toHaveLength(1);
  });

  it("非 401 响应直接返回，不触发刷新", async () => {
    queue = [jsonResponse(200, { ok: true })];

    const res = await fetchWithAuth("/api/user/profile");

    expect(res.status).toBe(200);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/auth/refresh")
    ).toHaveLength(0);
  });

  it("fatal（TOKEN_REVOKED）：抛出 UnauthorizedError 并广播过期事件", async () => {
    queue = [
      jsonResponse(401, {}),
      jsonResponse(401, { error: { code: "TOKEN_REVOKED", message: "刷新令牌已失效" } }),
    ];
    const eventSpy = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventSpy);

    await expect(fetchWithAuth("/api/user/profile")).rejects.toBeInstanceOf(UnauthorizedError);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("retryable（5xx）：抛错但不广播过期事件", async () => {
    queue = [
      jsonResponse(401, {}),
      jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }),
    ];
    const eventSpy = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventSpy);

    await expect(fetchWithAuth("/api/user/profile")).rejects.toBeInstanceOf(UnauthorizedError);

    expect(eventSpy).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("retryable（网络异常）：抛错但不广播过期事件", async () => {
    queue = [jsonResponse(401, {}), { reject: new TypeError("network down") }];
    const eventSpy = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventSpy);

    await expect(fetchWithAuth("/api/user/profile")).rejects.toBeInstanceOf(UnauthorizedError);

    expect(eventSpy).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("retryable（无法识别的 401，如网关）：不广播过期事件", async () => {
    queue = [jsonResponse(401, {}), jsonResponse(401, { message: "gateway auth required" })];
    const eventSpy = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventSpy);

    await expect(fetchWithAuth("/api/user/profile")).rejects.toBeInstanceOf(UnauthorizedError);

    expect(eventSpy).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("DEVICE_LIMIT_EXCEEDED：写入带时间戳的提示并广播过期事件", async () => {
    queue = [
      jsonResponse(401, {}),
      jsonResponse(401, {
        error: {
          code: "DEVICE_LIMIT_EXCEEDED",
          message: "登录设备数量已达上限，本设备已被自动下线，请重新登录",
        },
      }),
    ];
    const eventSpy = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventSpy);

    await expect(fetchWithAuth("/api/user/profile")).rejects.toBeInstanceOf(UnauthorizedError);

    const hint = sessionStorage.getItem(SESSION_EXPIRED_HINT_KEY);
    expect(hint).toBeTruthy();
    expect(hint).toContain("设备数量已达上限");
    expect(hint!.split("|")[0]).toMatch(/^\d+$/);
    expect(eventSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("并发 401 仅发起一次刷新（refreshPromise 锁）", async () => {
    let refreshCalls = 0;
    queue = [jsonResponse(401, {}), jsonResponse(401, {})];
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === "/api/auth/csrf") {
        return jsonResponse(200, { success: true, data: { token: "csrf-token" } });
      }
      if (url === "/api/auth/refresh") {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return refreshOk();
      }
      const next = queue.shift();
      if (next && !("reject" in next)) return next;
      return jsonResponse(200, { ok: true });
    });

    const results = await Promise.all([
      fetchWithAuth("/api/user/profile"),
      fetchWithAuth("/api/user/phone"),
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it("refreshAccessToken 返回值区分 ok/fatal/retryable", async () => {
    queue = [refreshOk()];
    await expect(refreshAccessToken()).resolves.toEqual({ ok: true });

    queue = [jsonResponse(503, {})];
    await expect(refreshAccessToken()).resolves.toEqual({ ok: false, kind: "retryable" });

    queue = [jsonResponse(401, { error: { code: "MISSING_REFRESH_TOKEN" } })];
    await expect(refreshAccessToken()).resolves.toEqual({ ok: false, kind: "fatal" });
  });
});
