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

import { advisorJson, advisorRequest, mapAdvisorError, getSubsitePurgeTargets, purgeUserFromSubsites } from "@/lib/advisor-internal";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADVISOR_INTERNAL_SECRET;
  delete process.env.ADVISOR_API_BASE;
  delete process.env.INTERNAL_API_KEYS;
  delete process.env.SUBSITE_PURGE_TARGETS;
  delete process.env.INTERNAL_API_SIGN_QUERY;
});

describe("advisorRequest", () => {
  it("未配置任何密钥：不发起请求，返回 NOT_CONFIGURED（只读封装降级 null）", async () => {
    const result = await advisorRequest("/api/internal/diary", { query: { userId: "u1" } });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(globalFetch).not.toHaveBeenCalled();
    await expect(advisorJson("/api/internal/diary")).resolves.toBeNull();
  });

  it("Bearer 回退：GET 带 query，默认 base 为 smart.nihplod.cn", async () => {
    process.env.ADVISOR_INTERNAL_SECRET = "test-secret";
    globalFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const result = await advisorRequest("/api/internal/diary", {
      query: { userId: "u1", before: "2026-01-01" },
    });

    expect(result.ok).toBe(true);
    expect(globalFetch).toHaveBeenCalledWith(
      "https://smart.nihplod.cn/api/internal/diary?userId=u1&before=2026-01-01",
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

describe("getSubsitePurgeTargets", () => {
  it("未配置 SUBSITE_PURGE_TARGETS：回退 advisor 默认目标（ADVISOR_API_BASE 派生）", () => {
    expect(getSubsitePurgeTargets()).toEqual([
      {
        name: "advisor",
        baseUrl: "https://smart.nihplod.cn",
        purgePath: "/api/internal/user-data/purge",
      },
    ]);
  });

  it("ADVISOR_API_BASE 参与回退目标（尾斜杠归一化）", () => {
    process.env.ADVISOR_API_BASE = "http://127.0.0.1:3002/";
    expect(getSubsitePurgeTargets()[0].baseUrl).toBe("http://127.0.0.1:3002");
  });

  it("配置多目标：按配置返回，purgePath 缺省补默认，project 可选", () => {
    process.env.SUBSITE_PURGE_TARGETS = JSON.stringify([
      { name: "advisor", baseUrl: "https://smart.example.com" },
      {
        name: "mall",
        baseUrl: "https://mall.example.com",
        purgePath: "/api/internal/purge",
        project: "mall-sso",
      },
    ]);

    expect(getSubsitePurgeTargets()).toEqual([
      {
        name: "advisor",
        baseUrl: "https://smart.example.com",
        purgePath: "/api/internal/user-data/purge",
        project: undefined,
      },
      {
        name: "mall",
        baseUrl: "https://mall.example.com",
        purgePath: "/api/internal/purge",
        project: "mall-sso",
      },
    ]);
  });

  it("非法 JSON / 非数组：告警并回退 advisor 默认目标", () => {
    process.env.SUBSITE_PURGE_TARGETS = "{not json";
    expect(getSubsitePurgeTargets()).toHaveLength(1);
    expect(getSubsitePurgeTargets()[0].name).toBe("advisor");

    process.env.SUBSITE_PURGE_TARGETS = JSON.stringify({ name: "advisor" });
    expect(getSubsitePurgeTargets()[0].name).toBe("advisor");
  });

  it("缺 name/baseUrl 的条目被跳过", () => {
    process.env.SUBSITE_PURGE_TARGETS = JSON.stringify([
      { baseUrl: "https://noname.example.com" },
      { name: "ok", baseUrl: "https://ok.example.com" },
    ]);
    const targets = getSubsitePurgeTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe("ok");
  });
});

describe("purgeUserFromSubsites", () => {
  const KEYS = JSON.stringify([
    { project: "advisor", key: "advisor-test-key", secret: "a".repeat(32) },
    { project: "mall", key: "mall-test-key", secret: "b".repeat(32) },
  ]);

  it("L4：目标未配置密钥（NOT_CONFIGURED）warn 级跳过，注销继续执行", async () => {
    // 不配置任何 INTERNAL_API_KEYS / ADVISOR_INTERNAL_SECRET
    const result = await purgeUserFromSubsites("user-1");

    expect(result).toEqual({ ok: true });
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("L4：多目标中已配置目标失败 → 返回失败并标识目标名", async () => {
    process.env.INTERNAL_API_KEYS = KEYS; // advisor + mall 均有密钥
    process.env.SUBSITE_PURGE_TARGETS = JSON.stringify([
      { name: "advisor", baseUrl: "https://smart.example.com" },
      { name: "mall", baseUrl: "https://mall.example.com", purgePath: "/api/internal/purge" },
    ]);
    globalFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // advisor 成功
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) }); // mall 失败

    const result = await purgeUserFromSubsites("user-1");

    expect(result).toMatchObject({ ok: false, target: "mall", code: "UPSTREAM_ERROR" });
    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(globalFetch.mock.calls[0][0]).toBe(
      "https://smart.example.com/api/internal/user-data/purge?userId=user-1"
    );
    expect(globalFetch.mock.calls[1][0]).toBe(
      "https://mall.example.com/api/internal/purge?userId=user-1"
    );
  });

  it("L4：混合场景——未配置目标跳过 + 已配置目标执行", async () => {
    // 只配置 advisor 密钥，mall 未配置 → mall 跳过，整体 ok
    process.env.INTERNAL_API_KEYS = JSON.stringify([
      { project: "advisor", key: "advisor-test-key", secret: "a".repeat(32) },
    ]);
    process.env.SUBSITE_PURGE_TARGETS = JSON.stringify([
      { name: "mall", baseUrl: "https://mall.example.com" },
      { name: "advisor", baseUrl: "https://smart.example.com" },
    ]);
    globalFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const result = await purgeUserFromSubsites("user-1");

    expect(result).toEqual({ ok: true });
    expect(globalFetch).toHaveBeenCalledTimes(1); // 仅 advisor 发出请求
  });

  it("L3：purge 请求始终绑定 query 签名（独立于 INTERNAL_API_SIGN_QUERY 全局开关）", async () => {
    process.env.INTERNAL_API_KEYS = KEYS;
    // 全局开关关闭：默认应签旧格式，但 purge 必须仍绑定 query
    delete process.env.INTERNAL_API_SIGN_QUERY;
    globalFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    await purgeUserFromSubsites("user-1");

    const [, init] = globalFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    // 用新格式（绑定 query）重算签名应能匹配；旧格式不应匹配
    const { generateInternalApiSignature, hashRequestBody } = await import("@/lib/internal-api");
    const timestamp = Number(init.headers["X-Internal-API-Timestamp"]);
    const nonce = init.headers["X-Internal-API-Nonce"];
    const bodyHash = await hashRequestBody("");
    const withQuery = generateInternalApiSignature(
      "a".repeat(32),
      "POST",
      "/api/internal/user-data/purge",
      timestamp,
      nonce,
      bodyHash,
      "userId=user-1"
    );
    const legacy = generateInternalApiSignature(
      "a".repeat(32),
      "POST",
      "/api/internal/user-data/purge",
      timestamp,
      nonce,
      bodyHash
    );
    expect(init.headers["X-Internal-API-Signature"]).toBe(withQuery);
    expect(init.headers["X-Internal-API-Signature"]).not.toBe(legacy);
  });
});
