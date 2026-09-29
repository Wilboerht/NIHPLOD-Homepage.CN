/**
 * IndexNow 主动推送测试
 * - key 未配置时静默跳过
 * - 提交成功时请求体包含 host / key / keyLocation / urlList
 * - 网络异常时不抛出
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

describe("submitToIndexNow", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    global.fetch = originalFetch;
  });

  it("未配置 key 时静默跳过且不发起请求", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { submitToIndexNow } = await import("../indexnow");
    expect(await submitToIndexNow(["/products"])).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("提交成功返回 true，请求体包含 host/key/keyLocation/urlList", async () => {
    vi.stubEnv("INDEXNOW_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://nihplod.cn");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { submitToIndexNow } = await import("../indexnow");

    expect(await submitToIndexNow(["/products", "about"])).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(JSON.parse(init.body)).toEqual({
      host: "nihplod.cn",
      key: "test-key",
      keyLocation: "https://nihplod.cn/test-key.txt",
      urlList: ["https://nihplod.cn/products", "https://nihplod.cn/about"],
    });
  });

  it("请求抛错时返回 false 且不抛出异常", async () => {
    vi.stubEnv("INDEXNOW_KEY", "test-key");
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const { submitToIndexNow } = await import("../indexnow");
    await expect(submitToIndexNow(["/products"])).resolves.toBe(false);
  });
});
