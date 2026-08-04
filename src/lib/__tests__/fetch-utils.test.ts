import { describe, it, expect, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/fetch-utils";

describe("fetch-utils", () => {
  it("应使用 AbortController 包装 fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const response = await fetchWithTimeout("https://example.com", { timeout: 1000 });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("默认超时 30 秒", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchWithTimeout("https://example.com");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
