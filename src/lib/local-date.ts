/**
 * 客户端本地日历日工具 — 全站唯一实现。
 * `toISOString()` 取到的是 UTC 日历日，UTC+8 凌晨会得到"昨天"，
 * 日期输入上限/打卡"今天"判定等场景必须用本地日历日。
 */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
