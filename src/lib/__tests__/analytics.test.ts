import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackEvent } from "@/lib/analytics";

describe("analytics", () => {
  let dataLayer: Array<Record<string, unknown>>;
  let gtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dataLayer = [];
    gtag = vi.fn();
    (globalThis as unknown as { window: Window }).window = {
      dataLayer,
      gtag,
      dispatchEvent: vi.fn(),
    } as unknown as Window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SSR 环境（无 window）不应执行", () => {
    (globalThis as unknown as Record<string, unknown>).window = undefined;
    expect(() => trackEvent("test")).not.toThrow();
  });

  it("应向 dataLayer、gtag 和自定义事件发送埋点", () => {
    trackEvent("click", { item: "product" });

    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({ event: "click", item: "product" });
    expect(gtag).toHaveBeenCalledWith("event", "click", { item: "product" });
    expect(
      (globalThis.window as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }).dispatchEvent
    ).toHaveBeenCalled();
  });

  it("无 props 时应正确调用 gtag", () => {
    trackEvent("page_view");
    expect(gtag).toHaveBeenCalledWith("event", "page_view", undefined);
  });
});
