import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config.mjs";

describe("主页 Link 响应头", () => {
  it("声明 api-catalog / service-desc / service-doc / describedby", async () => {
    const rules = await nextConfig.headers?.();
    const home = rules?.find((rule) => rule.source === "/");
    const link = home?.headers.find((header) => header.key.toLowerCase() === "link");

    expect(link?.value).toContain('rel="api-catalog"');
    expect(link?.value).toContain('rel="service-desc"');
    expect(link?.value).toContain('rel="service-doc"');
    expect(link?.value).toContain('rel="describedby"');
  });
});
