import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatStripItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  muted?: boolean;
}

interface StatStripProps {
  items: StatStripItem[];
  className?: string;
  /** strip：桌面端单行等分（默认）；grid：固定两列，适合窄容器 */
  layout?: "strip" | "grid";
}

/**
 * 紧凑指标条：无独立描边卡片，桌面端用细分隔线等分，移动端两列堆叠。
 * 用于仪表盘概览、可收起面板内部等需要降低视觉噪声的区域。
 */
export function StatStrip({ items, className, layout = "strip" }: StatStripProps) {
  if (items.length === 0) return null;

  return (
    <dl
      className={cn(
        "grid gap-x-4 gap-y-4",
        layout === "strip"
          ? "grid-cols-2 sm:auto-cols-fr sm:grid-flow-col sm:gap-x-0 sm:gap-y-0 sm:divide-x sm:divide-brand-charcoal/10"
          : "grid-cols-2",
        items.length === 1 && "grid-cols-1",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("min-w-0", layout === "strip" && "sm:px-4 sm:first:pl-0 sm:last:pr-0")}
        >
          <dt className="flex items-center gap-1.5 text-xs text-brand-charcoal/65">
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </dt>
          <dd
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums tracking-tight",
              item.muted ? "text-brand-charcoal/65" : "text-brand-charcoal"
            )}
          >
            {item.value}
          </dd>
          {item.description && (
            <dd className="mt-0.5 truncate text-[11px] text-brand-charcoal/65">
              {item.description}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
