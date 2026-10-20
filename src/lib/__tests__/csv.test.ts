import { describe, it, expect } from "vitest";
import { escapeCSV } from "@/lib/csv";

describe("escapeCSV", () => {
  it("覆盖前导空白/Tab/换行开头的公式注入", () => {
    expect(escapeCSV("\t=cmd|' /C calc'!A0")).toContain("'\t=cmd");
    expect(escapeCSV("\n=1+1")).toContain("'\n=1+1");
    expect(escapeCSV(" \t=1+1")).toContain("' \t=1+1");
  });

  it("覆盖普通公式字符开头", () => {
    expect(escapeCSV("=1+1")).toBe("'=1+1");
    expect(escapeCSV("+1")).toBe("'+1");
    expect(escapeCSV("-1")).toBe("'-1");
    expect(escapeCSV("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("按 CSV 规则处理引号、逗号和换行", () => {
    expect(escapeCSV('a"b')).toBe('"a""b"');
    expect(escapeCSV("a,b")).toBe('"a,b"');
    expect(escapeCSV("a\nb")).toBe('"a\nb"');
  });

  it("普通文本不加前缀", () => {
    expect(escapeCSV("张三")).toBe("张三");
  });
});
