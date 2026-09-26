/**
 * 消费导入逐行结果辅助测试
 * - pickNeedsAttentionRows：仅保留重复/失败行
 * - buildNeedsAttentionCsv：手机号脱敏（幂等）、公式注入转义、BOM
 */
import { describe, it, expect } from "vitest";
import {
  pickNeedsAttentionRows,
  buildNeedsAttentionCsv,
  type SpentImportRowResult,
} from "@/lib/spent-import-rows";

function row(partial: Partial<SpentImportRowResult>): SpentImportRowResult {
  return {
    rowIndex: 2,
    phone: "13800138000",
    amount: 100,
    status: "SUCCESS",
    error: null,
    reference: "import:abc",
    ...partial,
  };
}

describe("pickNeedsAttentionRows", () => {
  it("过滤成功行，仅保留重复/失败行", () => {
    const rows = [
      row({ rowIndex: 2, status: "SUCCESS" }),
      row({ rowIndex: 3, status: "DUPLICATE", error: "该记录已入账过（幂等跳过）" }),
      row({ rowIndex: 4, status: "ERROR", error: "该手机号未注册官网账户" }),
    ];
    const result = pickNeedsAttentionRows(rows);
    expect(result.map((r) => r.rowIndex)).toEqual([3, 4]);
  });

  it("全部成功时返回空数组", () => {
    expect(pickNeedsAttentionRows([row({ status: "SUCCESS" })])).toEqual([]);
  });
});

describe("buildNeedsAttentionCsv", () => {
  it("包含 BOM、表头与脱敏手机号", () => {
    const csv = buildNeedsAttentionCsv([
      row({ rowIndex: 5, status: "ERROR", error: "该手机号未注册官网账户" }),
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Excel行号,手机号,金额(元),结果,原因");
    expect(csv).toContain("138****8000");
    expect(csv).not.toContain("13800138000");
    expect(csv).toContain("5,138****8000,100,失败,该手机号未注册官网账户");
  });

  it("对已脱敏手机号保持幂等（不会二次破坏）", () => {
    const csv = buildNeedsAttentionCsv([
      row({ status: "DUPLICATE", phone: "138****8000" }),
    ]);
    expect(csv).toContain("138****8000");
  });

  it("对以 = + - @ 开头的内容加单引号，防止 Excel 公式注入", () => {
    const csv = buildNeedsAttentionCsv([
      row({ rowIndex: 6, status: "ERROR", error: "=HYPERLINK(\"http://evil\")" }),
    ]);
    // 以单引号开头且整体被引号包裹（含逗号/引号）
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("原因中的换行与逗号被正确转义", () => {
    const csv = buildNeedsAttentionCsv([
      row({ rowIndex: 7, status: "ERROR", error: "第一行,第二行\n第三行" }),
    ]);
    expect(csv).toContain(`"第一行,第二行\n第三行"`);
  });
});
