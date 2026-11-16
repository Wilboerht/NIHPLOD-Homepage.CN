"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-charcoal/10 text-brand-charcoal/80",
  primary: "bg-brand-primary/10 text-brand-primary",
  secondary: "bg-brand-charcoal/10 text-brand-charcoal/70",
  success: "bg-status-success-soft text-status-success-fg",
  warning: "bg-status-warning-soft text-status-warning-fg",
  danger: "bg-status-danger-soft text-status-danger-fg",
  info: "bg-status-info-soft text-status-info-fg",
  neutral: "bg-status-neutral-soft text-status-neutral-fg",
  outline: "border border-line-strong text-brand-charcoal/80 bg-transparent",
};

const sizeStyles = {
  sm: "px-2.5 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

/**
 * 状态徽章组件
 */
export function Badge({ children, variant = "default", size = "sm", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * 圆点徽章组件
 */
export function DotBadge({
  children,
  color = "gray",
  className,
}: {
  children: ReactNode;
  color?: "gray" | "green" | "yellow" | "red" | "primary";
  className?: string;
}) {
  const dotColors = {
    gray: "bg-brand-charcoal/40",
    green: "bg-status-success-fg",
    yellow: "bg-status-warning-fg",
    red: "bg-status-danger-fg",
    primary: "bg-brand-primary",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className={cn("h-2 w-2 rounded-full", dotColors[color])} />
      {children}
    </span>
  );
}
