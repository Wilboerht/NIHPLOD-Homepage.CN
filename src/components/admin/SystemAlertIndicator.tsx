import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

export interface SystemAlert {
  key: string;
  label: string;
  count: number;
  href: string;
}

interface SystemAlertIndicatorProps {
  alerts: SystemAlert[];
}

/**
 * 仪表盘标题旁的系统告警入口。
 * 平时只显示一个感叹号图标，点击后展开具体告警，不占用单独一行。
 */
export function SystemAlertIndicator({ alerts }: SystemAlertIndicatorProps) {
  if (alerts.length === 0) return null;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <details className="group relative inline-block">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center text-amber-600 transition-colors hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 group-open:text-amber-800 [&::-webkit-details-marker]:hidden"
        aria-label={`系统告警，共 ${total} 项`}
        title={`系统告警，共 ${total} 项`}
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
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
