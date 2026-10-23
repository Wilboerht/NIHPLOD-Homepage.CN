import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

export interface SystemAlert {
  key: string;
  label: string;
  count: number;
  href: string;
}

interface SystemAlertBarProps {
  alerts: SystemAlert[];
}

/**
 * 系统告警条：只在存在异常时渲染，与业务待办分开。
 */
export function SystemAlertBar({ alerts }: SystemAlertBarProps) {
  if (alerts.length === 0) return null;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <section
      aria-label="系统告警"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        系统告警
        <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[11px] tabular-nums">
          共 {total} 条
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {alerts.map((alert) => (
          <Link
            key={alert.key}
            href={alert.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-amber-900 transition-colors hover:bg-white"
          >
            {alert.label}
            <span className="font-semibold tabular-nums">{alert.count}</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
