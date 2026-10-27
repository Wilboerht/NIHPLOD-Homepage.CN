import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llms-docs-server", () => ({
  getLlmsDocs: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { getLlmsDocs } from "@/lib/llms-docs-server";

describe("GET /llms.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("返回摘要文档", async () => {
    vi.mocked(getLlmsDocs).mockResolvedValue({
      full: "# full",
      summary: "# NIHPLOD 旎柏\n\n- [所有产品](https://nihplod.cn/products)",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("所有产品");
  });
});
