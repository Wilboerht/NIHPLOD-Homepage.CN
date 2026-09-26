/**
 * 护肤日记纯函数工具（无服务端依赖，客户端/服务端均可导入）。
 * date 字段语义：客户端本地日历日（YYYY-MM-DD），按 UTC 零点存储，不依赖服务器时区。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseClientDate(dateStr: string): Date | null {
    if (!DATE_RE.test(dateStr)) return null;
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    // V8 对越界日历日（如 2026-02-30）会静默滚动为 3 月 2 日，需回环校验防止日期漂移
    const [y, m, day] = dateStr.split("-").map(Number);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) return null;
    return d;
}

/**
 * 日记可写入日期窗口：[today-90, tomorrow]（UTC 日历日）。
 * 两端各放宽 1 天，兼容领先/落后 UTC 的客户端时区（POST 打卡与测肤自动写入共用）。
 */
export function isDiaryDateInRange(date: Date, now: Date = new Date()): boolean {
    const maxDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const minDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90));
    return date >= minDate && date <= maxDate;
}

/** 测肤综合评分 → 日记肌肤状态档位 */
export function scoreToSkinState(score: number): string {
    if (score >= 85) return "great";
    if (score >= 70) return "good";
    if (score >= 55) return "normal";
    if (score >= 40) return "bad";
    return "terrible";
}

/** 测肤自动生成条目的备注前缀，用于区分自动记录与手动打卡 */
export const AUTO_DIARY_NOTE_PREFIX = "在线测肤";

/** 判断条目是否为测肤自动生成（手动打卡的备注不会以此前缀开头） */
export function isAutoDiaryEntry(entry: { note?: string | null }): boolean {
    return !!entry.note && entry.note.startsWith(AUTO_DIARY_NOTE_PREFIX);
}

const DAY_MS = 86_400_000;

/** UTC 日历日序号（date 存储为 UTC 零点，毫秒数 / 86400000 即精确日序） */
function dayIndexOf(date: Date): number {
    return Math.floor(date.getTime() / DAY_MS);
}

/**
 * 连续打卡天数：连续段必须截至今天或昨天（错过昨天即中断），返回 { current, longest }。
 */
export function computeStreak(
    dates: Date[],
    now: Date = new Date()
): { current: number; longest: number } {
    const daySet = new Set(dates.map(dayIndexOf));
    const today = dayIndexOf(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    );

    let current = 0;
    let cursor = daySet.has(today) ? today : today - 1;
    while (daySet.has(cursor)) {
        current++;
        cursor--;
    }

    const sorted = [...daySet].sort((a, b) => a - b);
    let longest = 0;
    let run = 0;
    let prev: number | null = null;
    for (const d of sorted) {
        run = prev !== null && d - prev === 1 ? run + 1 : 1;
        if (run > longest) longest = run;
        prev = d;
    }

    return { current, longest };
}

/**
 * 截至指定日历日（含当日）的连续打卡天数。
 * 用于打卡积分：连续第 1/2/3+ 天分别 +1/+2/+3 分（断开重新从 1 算起）。
 * 与 computeStreak 的"current"语义一致，但锚点可以是任意历史日期（补打卡场景）。
 */
export function streakEndingAt(dates: Date[], target: Date): number {
    const daySet = new Set(dates.map(dayIndexOf));
    let streak = 0;
    let cursor = dayIndexOf(target);
    while (daySet.has(cursor)) {
        streak++;
        cursor--;
    }
    return streak;
}

/** 打卡积分：连续第 N 天得分 = min(N, 3) */
export function checkinPointsForStreak(streak: number): number {
    return Math.min(Math.max(streak, 0), 3);
}

/**
 * 打卡连续天数（封顶 3 天即够积分规则使用）：仅按"昨天/前天是否有条目"推导。
 * 积分规则 checkinPointsForStreak 在 streak=3 封顶，因此无需 streakEndingAt 的全量
 * 历史扫描——打卡 POST 只需回查前两天两个点，查询开销不随用户数据量增长。
 */
export function cappedCheckinStreak(hasYesterday: boolean, hasDayBefore: boolean): number {
    return hasYesterday ? (hasDayBefore ? 3 : 2) : 1;
}
