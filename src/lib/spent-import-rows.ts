/**
 * 消费导入逐行结果辅助（客户端可用，不依赖 xlsx 等服务端重依赖）
 *
 * 用于导入结果页展示与导出「需修正的行」（重复/失败），
 * 手机号展示与导出统一走 maskPhone（幂等，已脱敏输入不变）。
 */
import { maskPhone } from "./mask-phone";

export interface SpentImportRowResult {
  /** Excel 行号（首个数据行为第 2 行） */
  rowIndex: number;
  phone: string;
  amount: number;
  status: "SUCCESS" | "DUPLICATE" | "ERROR";
  error: string | null;
  reference: string | null;
}

const STATUS_LABELS: Record<SpentImportRowResult["status"], string> = {
  SUCCESS: "成功",
  DUPLICATE: "重复跳过",
  ERROR: "失败",
};

/** 未成功入账、需要人工修正的行（重复 + 失败） */
export function pickNeedsAttentionRows(
  rows: readonly SpentImportRowResult[]
): SpentImportRowResult[] {
  return rows.filter((row) => row.status !== "SUCCESS");
}

/** CSV 单元格转义：防公式注入 + 引号/换行包裹 */
function escapeCsvCell(value: string): string {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(sanitized) ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
}

/**
 * 生成需修正行的 CSV（带 BOM，Excel 直接打开不乱码）。
 * 列：Excel行号, 手机号(脱敏), 金额(元), 结果, 原因
 */
export function buildNeedsAttentionCsv(rows: readonly SpentImportRowResult[]): string {
  const header = ["Excel行号", "手机号", "金额(元)", "结果", "原因"];
  const lines = rows.map((row) =>
    [
      String(row.rowIndex),
      maskPhone(row.phone),
      String(row.amount),
      STATUS_LABELS[row.status],
      row.error ?? "",
    ]
      .map(escapeCsvCell)
      .join(",")
  );
  return `\uFEFF${[header.join(","), ...lines].join("\n")}`;
}
