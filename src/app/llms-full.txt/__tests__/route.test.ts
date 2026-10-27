import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llms-docs-server", () => ({
  getLlmsDocs: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { getLlmsDocs } from "@/lib/llms-docs-server";

describe("GET /llms-full.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("返回完整文档与文本缓存头", async () => {
    vi.mocked(getLlmsDocs).mockResolvedValue({
      full: "# NIHPLOD\n\n### Q: 测试问题\nA: 测试答案",
      summary: "# summary",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    await expect(res.text()).resolves.toContain("### Q: 测试问题");
  });

  it("生成失败时返回 500", async () => {
    vi.mocked(getLlmsDocs).mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
