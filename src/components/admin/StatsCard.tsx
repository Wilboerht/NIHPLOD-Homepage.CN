"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
    /** 对比周期文案，默认「较上月」 */
    label?: string;
  };
  className?: string;
  loading?: boolean;
}

/**
 * 统计卡片组件
 */
export function StatsCard({
  title,
  value,
  icon,
  description,
  trend,
  className,
  loading = false,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-charcoal/10 bg-white p-5 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm text-brand-charcoal/50">{title}</p>
          {loading ? (
            <div className="mt-1 h-8 w-20 animate-pulse rounded bg-brand-charcoal/10" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-charcoal">{value}</p>
          )}
          {description && <p className="mt-1 text-xs text-brand-charcoal/50">{description}</p>}
          {trend && !loading && (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                trend.isPositive ? "text-emerald-600" : "text-red-500"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              <span className="ml-1 text-brand-charcoal/50">{trend.label ?? "较上月"}</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            "bg-brand-primary/10 text-brand-primary"
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
