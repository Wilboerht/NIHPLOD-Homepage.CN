/**
 * 业务时区工具（Asia/Shanghai = UTC+8）
 *
 * 约定：
 * - 数据库存储 UTC；
 * - 业务日/周/月按 UTC+8 计算；
 * - 日期字符串（YYYY-MM-DD）按 UTC+8 的 00:00 解释，而不是 UTC 00:00。
 */

export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 当天 UTC+8 零点（返回 UTC Date） */
export function getUtc8DayStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + UTC8_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC8_OFFSET_MS
  );
}

/** 本周一 UTC+8 零点（周一为周首） */
export function getUtc8WeekStartMonday(now: Date = new Date()): Date {
  const dayStart = getUtc8DayStart(now);
  const localDayStart = new Date(dayStart.getTime() + UTC8_OFFSET_MS);
  // getUTCDay: 0=周日；转换为 0=周一
  const day = (localDayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - day * DAY_MS);
}

/** 本月 1 日 UTC+8 零点 */
export function getUtc8MonthStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + UTC8_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - UTC8_OFFSET_MS
  );
}

/** UTC+8 日期键：YYYY-MM-DD */
export function getUtc8DateKey(now: Date = new Date()): string {
  const local = new Date(now.getTime() + UTC8_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 解析日期边界：
 * - 仅日期（YYYY-MM-DD）→ UTC+8 当天 00:00 / 23:59:59.999
 * - 其他可解析字符串 → 原样解析（用于兼容完整 ISO 时间）
 */
export function parseUtc8DateBoundary(value: string, endOfDay = false): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const start = new Date(Date.UTC(year, month - 1, day) - UTC8_OFFSET_MS);
    if (Number.isNaN(start.getTime())) return null;
    return endOfDay ? new Date(start.getTime() + DAY_MS - 1) : start;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
