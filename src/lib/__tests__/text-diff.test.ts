import { describe, expect, it } from "vitest";
import { diffLines } from "@/lib/text-diff";

describe("diffLines", () => {
  it("标记相同、新增与删除行", () => {
    const diff = diffLines("第一行\n第二行\n第三行", "第一行\n新第二行\n第三行\n新增行");
    expect(diff).not.toBeNull();
    expect(diff).toEqual([
      { type: "same", text: "第一行" },
      { type: "remove", text: "第二行" },
      { type: "add", text: "新第二行" },
      { type: "same", text: "第三行" },
      { type: "add", text: "新增行" },
    ]);
  });

  it("内容过长时返回 null，由 UI 降级", () => {
    const long = Array.from({ length: 900 }, (_, index) => `line-${index}`).join("\n");
    expect(diffLines(long, long)).toBeNull();
  });
});
