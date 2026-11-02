import { describe, it, expect } from "vitest";
import { GET, HEAD } from "../route";

describe("GET /auth.md", () => {
  it("返回包含 auth.md H1 的 Markdown", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("# auth.md");
    expect(text).toContain("urn:ietf:params:oauth:token-type:id-jag");
  });

  it("HEAD 返回 200 且无响应体", async () => {
    const res = await HEAD();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toBe("");
  });
});
