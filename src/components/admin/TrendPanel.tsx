import { PanelCard } from "./PanelCard";
import { cn } from "@/lib/utils";

export interface TrendSeries {
  key: string;
  label: string;
  values: number[];
  description?: string;
}

interface TrendPanelProps {
  days: string[];
  series: TrendSeries[];
}

function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return month && date ? `${month}-${date}` : day;
}

/**
 * 仪表盘近 7 日趋势：纯 CSS 柱状图，不引入图表库。
 * 每个系列提供可读的 aria-label，屏幕阅读器可获取每日数值。
 */
export function TrendPanel({ days, series }: TrendPanelProps) {
  if (series.length === 0 || days.length === 0) return null;

  return (
    <PanelCard title="近 7 日趋势">
      <div className="grid gap-4 sm:grid-cols-2">
        {series.map((item) => {
          const total = item.values.reduce((sum, value) => sum + value, 0);
          const max = Math.max(1, ...item.values);
          return (
            <section key={item.key} className="min-w-0 rounded-xl bg-brand-charcoal/[0.02] p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-medium text-brand-charcoal">{item.label}</h3>
                <span className="text-xs tabular-nums text-brand-charcoal/65">
                  7 日 {total.toLocaleString("zh-CN")}
                  {item.description ? ` · ${item.description}` : ""}
                </span>
              </div>
              <div
                role="img"
                aria-label={`${item.label}：${item.values
                  .map((value, index) => `${shortDay(days[index] ?? "")} ${value}`)
                  .join("，")}`}
                className="flex h-16 items-end gap-1"
              >
                {item.values.map((value, index) => (
                  <div
                    key={`${item.key}-${days[index] ?? index}`}
                    className="group flex h-full flex-1 items-end"
                    title={`${shortDay(days[index] ?? "")}：${value}`}
                  >
                    <div
                      className={cn(
                        "w-full rounded-t bg-brand-primary/70 transition-colors group-hover:bg-brand-primary",
                        value === 0 && "bg-brand-charcoal/10"
                      )}
                      style={{ height: `${Math.max(value === 0 ? 4 : 8, (value / max) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-brand-charcoal/65">
                <span>{shortDay(days[0] ?? "")}</span>
                <span>{shortDay(days[days.length - 1] ?? "")}</span>
              </div>
            </section>
          );
        })}
      </div>
    </PanelCard>
  );
}
