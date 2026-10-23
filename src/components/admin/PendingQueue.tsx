import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelCard } from "./PanelCard";

export interface PendingQueueItem {
  key: string;
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  /** 最早一条未处理记录时间，用于显示积压时长 */
  oldestAt?: string;
  /** 消费补录等队列的申报金额（元） */
  amountYuan?: number;
}

/** 将时间格式化为“最老 X 分钟/小时/天”，不展示具体日期 */
function formatAge(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMinutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / (1000 * 60));
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)} 分钟`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)} 小时`;
  return `${Math.floor(diffMinutes / (60 * 24))} 天`;
}

interface PendingQueueProps {
  items: PendingQueueItem[];
  className?: string;
}

/**
 * 仪表盘业务待办：只渲染有积压的队列，全部清零时展示成功态。
 */
export function PendingQueue({ items, className }: PendingQueueProps) {
  const visibleItems = items.filter((item) => item.count > 0);
  const total = visibleItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <PanelCard
      title={
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand-primary" />
          待处理
        </span>
      }
      action={
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            total > 0 ? "text-brand-charcoal/65" : "text-emerald-600"
          )}
        >
          {total > 0 ? (
            `共 ${total} 项`
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              已全部处理
            </>
          )}
        </span>
      }
      className={className}
    >
      {visibleItems.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          所有队列已清零，暂无待处理事项
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]",
            visibleItems.length === 1 && "grid-cols-1"
          )}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const age = item.oldestAt ? formatAge(item.oldestAt) : null;

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-label={`${item.label} ${item.count} 项`}
                className="flex min-h-[64px] items-center gap-2.5 rounded-xl bg-brand-primary/[0.04] p-3 transition-colors hover:bg-brand-primary/[0.08]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-brand-charcoal/65">
                    {item.label}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-lg font-semibold tabular-nums text-brand-primary">
                      {item.count}
                    </span>
                    {item.amountYuan !== undefined && item.amountYuan > 0 && (
                      <span className="text-[11px] text-brand-charcoal/65">
                        申报 ¥{item.amountYuan.toLocaleString("zh-CN")}
                      </span>
                    )}
                    {age && <span className="text-[11px] text-brand-charcoal/65">最老 {age}</span>}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-brand-charcoal/65" />
              </Link>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
