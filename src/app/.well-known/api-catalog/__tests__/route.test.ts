import { describe, it, expect } from "vitest";
import { GET, HEAD } from "../route";

describe("API Catalog（RFC 9727）", () => {
  it("返回 linkset 文档与正确的 Content-Type", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/linkset+json");

    const data = (await res.json()) as {
      linkset: Array<{
        anchor?: string;
        "service-desc"?: Array<{ href?: string }>;
        "service-doc"?: Array<{ href?: string }>;
        status?: Array<{ href?: string }>;
      }>;
    };

    expect(Array.isArray(data.linkset)).toBe(true);
    expect(data.linkset.length).toBeGreaterThan(0);

    const entry = data.linkset[0];
    expect(entry.anchor).toBe("https://nihplod.cn/api/oauth");
    expect(entry["service-desc"]?.[0]?.href).toBe("https://nihplod.cn/api/oauth/docs");
    expect(entry["service-doc"]?.[0]?.href).toBe("https://nihplod.cn/api/oauth/docs");
    expect(entry.status?.[0]?.href).toBe("https://nihplod.cn/api/health");
  });

  it("HEAD 返回 200、Content-Type 与 api-catalog Link 头", async () => {
    const res = await HEAD();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/linkset+json");
    expect(res.headers.get("link")).toContain('rel="api-catalog"');
    expect(await res.text()).toBe("");
  });
});
