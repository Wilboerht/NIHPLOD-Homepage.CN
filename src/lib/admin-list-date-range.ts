import { parseUtc8DateBoundary } from "./timezone";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export type AdminDateRangeResult =
  | { ok: true; from: Date | null; to: Date | null }
  | { ok: false; message: string };

/**
 * 解析管理端列表日期范围（YYYY-MM-DD，按 UTC+8 边界）。
 * - 只传一端时允许开区间
 * - 限制最大 366 天，避免慢查询
 */
export function parseAdminDateRange(
  dateFrom?: string | null,
  dateTo?: string | null
): AdminDateRangeResult {
  const from = dateFrom ? parseUtc8DateBoundary(dateFrom, false) : null;
  const to = dateTo ? parseUtc8DateBoundary(dateTo, true) : null;

  if (dateFrom && !from) return { ok: false, message: "开始日期格式错误" };
  if (dateTo && !to) return { ok: false, message: "结束日期格式错误" };
  if (from && to && from > to) return { ok: false, message: "开始日期不能晚于结束日期" };
  if (from && to && to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    return { ok: false, message: `日期范围不能超过 ${MAX_RANGE_DAYS} 天` };
  }

  return { ok: true, from, to };
}
