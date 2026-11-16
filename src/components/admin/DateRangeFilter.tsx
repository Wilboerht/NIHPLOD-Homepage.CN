"use client";

import { useRef } from "react";
import { CalendarRange, X } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const DATE_PRESETS = [
  { label: "今天", days: 1 },
  { label: "近 7 天", days: 7 },
  { label: "近 30 天", days: 30 },
  { label: "本月", month: true },
] as const;

const UTC8_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function utc8DateKey(date: Date): string {
  return UTC8_DATE_FORMATTER.format(date);
}

function shiftDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 统一日期范围筛选：
 * - 快捷范围按 UTC+8 业务日计算
 * - 自定义起止日期写入 URL
 * - 窄屏自动换行，不挤压搜索框
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  label = "时间范围",
  disabled,
  className,
}: DateRangeFilterProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const active = Boolean(from || to);

  const close = () => detailsRef.current?.removeAttribute("open");
  const apply = (nextFrom: string, nextTo: string) => {
    onChange({ from: nextFrom, to: nextTo });
    close();
  };
  const applyPreset = (days: number) => {
    const today = new Date();
    apply(utc8DateKey(shiftDays(today, -(days - 1))), utc8DateKey(today));
  };
  const applyMonth = () => {
    const today = new Date();
    const [year, month] = utc8DateKey(today).split("-");
    apply(`${year}-${month}-01`, utc8DateKey(today));
  };

  return (
    <details ref={detailsRef} className={cn("relative", className)}>
      <summary
        className={cn(
          "flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors [&::-webkit-details-marker]:hidden",
          active
            ? "border-brand-primary/40 bg-brand-primary/5 text-brand-primary"
            : "border-line-strong bg-white text-brand-charcoal/75 hover:border-brand-charcoal/35"
        )}
        aria-label={label}
        aria-disabled={disabled}
      >
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        <span className="whitespace-nowrap">
          {active ? `${from || "不限"} ~ ${to || "不限"}` : label}
        </span>
        {active && (
          <button
            type="button"
            aria-label="清除日期范围"
            className="ml-1 rounded-full p-0.5 hover:bg-surface-active"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              apply("", "");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-3 shadow-popover">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                "month" in preset ? applyMonth() : applyPreset(preset.days)
              }
              className="rounded-full border border-line px-2.5 py-1 text-xs text-brand-charcoal/70 transition-colors hover:border-brand-primary/30 hover:text-brand-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <DatePicker
            aria-label="开始日期"
            value={from}
            onChange={(nextFrom) => onChange({ from: nextFrom, to })}
            placeholder="开始日期"
            max={to || undefined}
            disabled={disabled}
          />
          <DatePicker
            aria-label="结束日期"
            value={to}
            onChange={(nextTo) => onChange({ from, to: nextTo })}
            placeholder="结束日期"
            min={from || undefined}
            disabled={disabled}
          />
        </div>
        <p className="mt-2 text-2xs text-ink-muted">按北京时间（UTC+8）统计</p>
      </div>
    </details>
  );
}
