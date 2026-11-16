"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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
 * 侧边栏在页面底部向上展开，页头向下展开；支持 Esc/外部点击关闭。
 */
export function SystemAlertIndicator({ alerts, showLabel = false }: SystemAlertIndicatorProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!details.open) return;
      if (!details.contains(event.target as Node)) {
        details.removeAttribute("open");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        details.removeAttribute("open");
        details.scrollIntoView({ block: "nearest" });
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (alerts.length === 0) return null;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <details ref={detailsRef} className="group relative block w-full">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-status-warning-fg transition-colors hover:bg-status-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 group-open:text-status-warning-fg [&::-webkit-details-marker]:hidden",
          showLabel
            ? "min-h-11 rounded-lg px-3 py-2 text-sm"
            : "h-11 w-11 justify-center rounded-lg sm:h-9 sm:w-9"
        )}
        aria-label={`系统告警，共 ${total} 项`}
        title={`系统告警，共 ${total} 项`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {showLabel && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">系统告警</span>
            <span className="shrink-0 rounded-full bg-status-warning-soft px-1.5 py-0.5 text-2xs font-medium tabular-nums text-status-warning-fg">
              {total}
            </span>
          </span>
        )}
      </summary>

      <div
        className={cn(
          "absolute left-0 z-dropdown w-64 overflow-hidden rounded-surface border border-status-warning-line bg-white p-1.5 shadow-popover",
          showLabel ? "bottom-full mb-2" : "top-full mt-2"
        )}
      >
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-2xs font-medium text-status-warning-fg">系统告警</span>
          <span className="text-2xs tabular-nums text-ink-muted">共 {total} 项</span>
        </div>
        <div className="flex flex-col gap-1">
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              href={alert.href}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs text-brand-charcoal/80 transition-colors hover:bg-status-warning-soft"
            >
              <span className="min-w-0 truncate">{alert.label}</span>
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-status-warning-fg">
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
