/**
 * 站点 URL 单点解析测试
 * 回退链：NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL → NEXT_PUBLIC_SITE_URL → 默认域名
 */
import { describe, it, expect, vi, afterEach } from "vitest";

async function loadSiteUrl() {
  return import("../site-url");
}

describe("SITE_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("优先使用 NEXT_PUBLIC_APP_URL 并去除末尾斜杠", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.nihplod.cn/");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://base.nihplod.cn");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.nihplod.cn");
    const { SITE_URL } = await loadSiteUrl();
    expect(SITE_URL).toBe("https://app.nihplod.cn");
  });

  it("APP_URL 未配置时回退 BASE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://base.nihplod.cn/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.nihplod.cn");
    const { SITE_URL } = await loadSiteUrl();
    expect(SITE_URL).toBe("https://base.nihplod.cn");
  });

  it("仅配置 SITE_URL 时使用 SITE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.nihplod.cn");
    const { SITE_URL } = await loadSiteUrl();
    expect(SITE_URL).toBe("https://site.nihplod.cn");
  });

  it("全部未配置时回退默认域名", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const { SITE_URL } = await loadSiteUrl();
    expect(SITE_URL).toBe("https://nihplod.cn");
  });
});
