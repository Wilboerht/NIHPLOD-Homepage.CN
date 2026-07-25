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
  | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-charcoal/8 text-brand-charcoal/80",
  primary: "bg-brand-primary/10 text-brand-primary",
  secondary: "bg-brand-charcoal/8 text-brand-charcoal/60",
  success: "bg-green-50 text-green-700",
  warning: "bg-yellow-50 text-yellow-700",
  danger: "bg-red-50 text-red-700",
  outline: "border border-brand-charcoal/20 text-brand-charcoal/80 bg-transparent",
};

const sizeStyles = {
  sm: "px-2.5 py-0.5 text-sm",
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
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    primary: "bg-brand-primary",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("h-2 w-2 rounded-full", dotColors[color])} />
      {children}
    </span>
  );
}
