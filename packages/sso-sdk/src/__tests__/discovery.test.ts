/**
 * core/discovery.ts 测试
 *
 * 覆盖：成功结果缓存（TTL 内不再请求）、失败不缓存（下次立即重试）、
 * 并发单飞（缓存未命中时并发调用共享同一个在途请求）。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchDiscoveryCached, clearDiscoveryCache } from "../core/discovery";

const BASE = "https://sso.example.com";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("fetchDiscoveryCached", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("成功结果在 TTL 内被缓存：多次调用只请求一次", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({ issuer: BASE }));

    const first = await fetchDiscoveryCached(BASE);
    const second = await fetchDiscoveryCached(BASE);

    expect(first?.issuer).toBe(BASE);
    expect(second?.issuer).toBe(BASE);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("并发调用单飞：缓存未命中时共享同一个在途请求", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = fetchDiscoveryCached(BASE);
    const p2 = fetchDiscoveryCached(BASE);
    resolveFetch(jsonResponse({ issuer: BASE }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1?.issuer).toBe(BASE);
    expect(r2?.issuer).toBe(BASE);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("失败结果不缓存：下一次调用立即重试", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        throw new Error("network down");
      })
      .mockImplementationOnce(async () => jsonResponse({ issuer: BASE }));

    const failed = await fetchDiscoveryCached(BASE);
    expect(failed).toBeNull();

    const retried = await fetchDiscoveryCached(BASE);
    expect(retried?.issuer).toBe(BASE);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("HTTP 非 2xx 视为失败且不缓存", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => jsonResponse({}, 500))
      .mockImplementationOnce(async () => jsonResponse({ issuer: BASE }));

    expect(await fetchDiscoveryCached(BASE)).toBeNull();
    expect((await fetchDiscoveryCached(BASE))?.issuer).toBe(BASE);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("不同 baseUrl 分别缓存", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        jsonResponse({ issuer: String(input).split("/api/")[0] })
      );

    await fetchDiscoveryCached("https://a.example.com");
    await fetchDiscoveryCached("https://b.example.com");
    await fetchDiscoveryCached("https://a.example.com");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
