"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STATE_META, type DiaryEntry } from "@/components/website/user-center/diary/DiaryTimeline";
import { isDiaryDateInRange, parseClientDate } from "@/lib/diary-utils";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface DiaryCalendarProps {
  entries: DiaryEntry[];
  /** 当前展示月份 YYYY-MM */
  month: string;
  /** "今天"快照（YYYY-MM-DD，父级在弹层打开时刷新），避免渲染期调用 new Date() */
  todayStr: string;
  onMonthChange: (month: string) => void;
  /** 点击窗口内、无记录的日期（含今天）→ 打卡/补打卡；未来日期不可点 */
  onBackfill: (dateStr: string) => void;
  /** 点按写入窗口内、已有记录的日期 → 查看/编辑该日记录（移动端无 hover 浮层，这是唯一详情入口） */
  onSelectEntry?: (entry: DiaryEntry) => void;
  loading?: boolean;
}

/**
 * DiaryCalendar — 护肤历程日历热力图（GitHub 贡献图风格）
 * 每日格子按当日肌肤状态着色，无记录为灰；今天描边；
 * 窗口内空日期可点击（今天=打卡，过去=补打卡），已记录日期可点按查看/编辑。
 */
export function DiaryCalendar({ entries, month, todayStr, onMonthChange, onBackfill, onSelectEntry, loading }: DiaryCalendarProps) {
  // 当前月份（"回到本月"目标）由 todayStr 快照推导
  const currentMonth = todayStr.slice(0, 7);
  const isCurrentMonth = month === currentMonth;

  const entryByDay = useMemo(() => {
    const map = new Map<string, DiaryEntry>();
    for (const e of entries) map.set(e.date.slice(0, 10), e);
    return map;
  }, [entries]);

  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(`${month}-01T00:00:00.000Z`);
  const leadBlanks = (firstDay.getUTCDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    onMonthChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const inWriteWindow = (dateStr: string) => {
    const d = parseClientDate(dateStr);
    const today = parseClientDate(todayStr);
    return !!d && !!today && isDiaryDateInRange(d, today);
  };
  const canBackfill = (dateStr: string) => dateStr < todayStr && inWriteWindow(dateStr);

  return (
    <div>
      {/* 月份导航 + 回到本月（翻看历史月份时浮现） */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-full text-brand-charcoal/60 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.05] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-wait"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-brand-charcoal tracking-[0.08em]">
            {y} 年 {m} 月
          </span>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => onMonthChange(currentMonth)}
              className="text-[11px] text-brand-charcoal/60 font-light tracking-[0.04em] hover:text-brand-charcoal transition-colors cursor-pointer rounded-full px-2 py-0.5 hover:bg-brand-charcoal/[0.04]"
            >
              回到今日
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
          disabled={loading || isCurrentMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full text-brand-charcoal/60 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.05] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 mb-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center text-[11px] text-brand-charcoal/60 font-light">
            {w}
          </span>
        ))}
      </div>

      {/* 日期格：极简平铺——有记录才着色，无记录透明底只显淡灰日号 */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadBlanks }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dateStr = `${month}-${String(i + 1).padStart(2, "0")}`;
          const entry = entryByDay.get(dateStr);
          const meta = entry ? STATE_META[entry.skinState] ?? STATE_META.normal : null;
          const isToday = dateStr === todayStr;
          // 今天无记录也可点（打卡）；过去日期仅在写入窗口内可点（补打卡）
          const clickable = !entry && (isToday || canBackfill(dateStr));
          // 写入窗口内的已记录日期可点按查看/编辑（移动端无 hover，这是详情的唯一入口）
          const editable = !!entry && !!onSelectEntry && inWriteWindow(dateStr);
          // 列位置（0=周一）：周末日号淡化；hover 浮层的边缘对齐
          const colIndex = (leadBlanks + i) % 7;
          const isWeekend = colIndex >= 5;
          const isFirstCol = colIndex === 0;
          const isLastCol = colIndex === 6;
          const fmtShort = (s: string) =>
            new Date(`${s}T00:00:00.000Z`).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" });

          const cell = (
            <div
              className={`group/cell relative aspect-square rounded-lg flex items-center justify-center text-[11px] font-light transition-colors ${
                isToday ? "ring-1 ring-inset ring-brand-charcoal/30" : ""
              } ${
                entry
                  ? editable
                    ? "hover:ring-1 hover:ring-inset hover:ring-brand-charcoal/40"
                    : ""
                  : clickable
                    ? "text-brand-charcoal/60 hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal/75"
                    : isWeekend
                      ? "text-brand-charcoal/40"
                      : "text-brand-charcoal/55"
              }`}
              style={entry && meta ? { backgroundColor: `${meta.color}1F`, color: meta.color } : undefined}
              title={
                entry
                  ? `${fmtShort(dateStr)} · ${meta?.label ?? ""}${editable ? "（点按编辑）" : ""}`
                  : clickable
                    ? isToday ? `${dateStr} 打卡` : `${dateStr} 补打卡`
                    : undefined
              }
            >
              {i + 1}

              {/* PC hover 详情浮层：状态 + 标签 + 备注（移动端无 hover 自动不出现） */}
              {entry && meta && (
                <div
                  className={`pointer-events-none absolute bottom-full mb-1.5 z-20 hidden lg:group-hover/cell:block w-max max-w-[200px] rounded-lg bg-white/95 border border-stone-200/60 shadow-[0_8px_24px_rgba(61,47,37,0.14)] px-3 py-2 text-left ${
                    isFirstCol ? "left-0" : isLastCol ? "right-0" : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  <p className="text-[11px] font-medium" style={{ color: meta.color }}>
                    {fmtShort(dateStr)} · {meta.label}
                  </p>
                  {entry.tags && entry.tags.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-brand-charcoal/60 font-light">
                      {entry.tags.join(" · ")}
                    </p>
                  )}
                  {entry.note && (
                    <p className="mt-0.5 text-[11px] text-brand-charcoal/55 font-light leading-relaxed line-clamp-2">
                      {entry.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          );

          return clickable || editable ? (
            <button
              key={dateStr}
              type="button"
              onClick={() => (entry && editable ? onSelectEntry(entry) : onBackfill(dateStr))}
              aria-label={
                entry
                  ? `${fmtShort(dateStr)} 查看/编辑记录`
                  : isToday
                    ? "今日打卡"
                    : `${fmtShort(dateStr)} 补打卡`
              }
              className="cursor-pointer block"
            >
              {cell}
            </button>
          ) : (
            <span key={dateStr}>{cell}</span>
          );
        })}
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-end gap-3 mt-4">
        {(["great", "good", "normal", "bad", "terrible"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATE_META[key].color }} />
            <span className="text-[11px] text-brand-charcoal/55 font-light">{STATE_META[key].label}</span>
          </span>
        ))}
        {loading && <span className="text-[11px] text-brand-charcoal/55">加载中…</span>}
      </div>
    </div>
  );
}
