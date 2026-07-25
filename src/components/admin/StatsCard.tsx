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
        "rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-brand-charcoal/50">{title}</p>
          {loading ? (
            <div className="mt-2 h-9 w-20 animate-pulse rounded bg-brand-charcoal/10" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-brand-charcoal">{value}</p>
          )}
          {description && <p className="mt-1 text-xs text-brand-charcoal/50">{description}</p>}
          {trend && !loading && (
            <p
              className={cn(
                "mt-2 text-sm font-medium",
                trend.isPositive ? "text-green-600" : "text-red-600"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              <span className="ml-1 text-brand-charcoal/50">较上月</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-lg",
            "bg-brand-primary/10 text-brand-primary"
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
