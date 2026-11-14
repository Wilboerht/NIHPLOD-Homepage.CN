import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SystemAlert {
  key: string;
  label: string;
  count: number;
  href: string;
}

interface SystemAlertIndicatorProps {
  alerts: SystemAlert[];
  /** 侧边栏等场景显示文字标签；仪表盘页头保持纯图标 */
  showLabel?: boolean;
}

/**
 * 系统告警入口。
 * 平时只显示感叹号图标；showLabel 时显示文字。点击后展开具体告警。
 */
export function SystemAlertIndicator({ alerts, showLabel = false }: SystemAlertIndicatorProps) {
  if (alerts.length === 0) return null;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <details className="group relative block w-full">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-amber-600 transition-colors hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 group-open:text-amber-800 [&::-webkit-details-marker]:hidden",
          showLabel
            ? "rounded-lg px-3 py-2 text-sm text-brand-charcoal/75 hover:bg-amber-50/70"
            : "h-8 w-8 justify-center"
        )}
        aria-label={`系统告警，共 ${total} 项`}
        title={`系统告警，共 ${total} 项`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        {showLabel && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">系统告警</span>
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-800">
              {total}
            </span>
          </span>
        )}
      </summary>

      <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-amber-200 bg-white p-1.5 shadow-lg">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] font-medium text-amber-800">系统告警</span>
          <span className="text-[11px] tabular-nums text-amber-700/80">共 {total} 项</span>
        </div>
        <div className="flex flex-col gap-1">
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              href={alert.href}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs text-brand-charcoal/80 transition-colors hover:bg-amber-50"
            >
              <span className="min-w-0 truncate">{alert.label}</span>
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-amber-700">
                {alert.count}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}
