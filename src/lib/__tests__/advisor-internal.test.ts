/**
 * 主站 → 子站内部接口客户端测试
 * 覆盖：密钥未配置降级、Bearer 回退、HMAC 优先（含 query/body）、失败归一化。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const globalFetch = vi.fn();
global.fetch = globalFetch as unknown as typeof fetch;

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { advisorJson, advisorRequest, mapAdvisorError } from "@/lib/advisor-internal";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADVISOR_INTERNAL_SECRET;
  delete process.env.ADVISOR_API_BASE;
  delete process.env.INTERNAL_API_KEYS;
});

describe("advisorRequest", () => {
  it("未配置任何密钥：不发起请求，返回 NOT_CONFIGURED（只读封装降级 null）", async () => {
    const result = await advisorRequest("/api/internal/diary", { query: { userId: "u1" } });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(globalFetch).not.toHaveBeenCalled();
    await expect(advisorJson("/api/internal/diary")).resolves.toBeNull();
  });

  it("Bearer 回退：GET 带 query，默认 base 为 advisor.nihplod.cn", async () => {
    process.env.ADVISOR_INTERNAL_SECRET = "test-secret";
    globalFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const result = await advisorRequest("/api/internal/diary", {
      query: { userId: "u1", before: "2026-01-01" },
    });

    expect(result.ok).toBe(true);
    expect(globalFetch).toHaveBeenCalledWith(
      "https://advisor.nihplod.cn/api/internal/diary?userId=u1&before=2026-01-01",
      expect.objectContaining({ headers: { Authorization: "Bearer test-secret" } })
    );
  });

  it("HMAC 优先：签名头齐全，POST 带 Content-Type，base 尾斜杠归一化", async () => {
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: "advisor-test-key", secret: "a".repeat(32) },
    ]);
    process.env.ADVISOR_API_BASE = "http://127.0.0.1:3002/";
    globalFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });

    await advisorRequest("/api/internal/diary", {
      method: "POST",
      query: { userId: "u1" },
      body: { date: "2026-01-01", skinState: "good" },
    });

    const [url, init] = globalFetch.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:3002/api/internal/diary?userId=u1");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Internal-API-Key"]).toBe("advisor-test-key");
    expect(init.headers["X-Internal-API-Timestamp"]).toMatch(/^\d+$/);
    expect(init.headers["X-Internal-API-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(init.headers["X-Internal-API-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("失败归一化：非 2xx 透传子站错误文案；网络异常为 UPSTREAM_ERROR", async () => {
    process.env.ADVISOR_INTERNAL_SECRET = "s";

    globalFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "日期格式错误" }) });
    const bad = await advisorRequest("/api/internal/diary");
    expect(bad).toMatchObject({ ok: false, status: 400, message: "日期格式错误" });

    globalFetch.mockRejectedValueOnce(new Error("network"));
    const rejected = await advisorRequest("/api/internal/diary");
    expect(rejected).toMatchObject({ ok: false, code: "UPSTREAM_ERROR" });
  });
});

describe("mapAdvisorError", () => {
  it("400 → 400 INVALID_PARAMS；429 → 429 RATE_LIMITED；其余 → 502 沿用子站 code", () => {
    expect(
      mapAdvisorError({ status: 400, code: "UPSTREAM_ERROR", message: "肌肤状态不合法" })
    ).toEqual({ status: 400, code: "INVALID_PARAMS", message: "肌肤状态不合法" });

    expect(
      mapAdvisorError({ status: 429, code: "UPSTREAM_ERROR", message: "操作过于频繁，请稍后再试" })
    ).toEqual({ status: 429, code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" });

    expect(
      mapAdvisorError({ status: 0, code: "UPSTREAM_ERROR", message: "子站服务连接失败" })
    ).toEqual({ status: 502, code: "UPSTREAM_ERROR", message: "子站服务连接失败" });
  });
});
