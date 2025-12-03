"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  primary: "bg-brand-gold/10 text-brand-gold",
  secondary: "bg-gray-500/10 text-gray-600",
  success: "bg-green-50 text-green-700",
  warning: "bg-yellow-50 text-yellow-700",
  danger: "bg-red-50 text-red-700",
  outline: "border border-gray-300 text-gray-700 bg-transparent",
};

const sizeStyles = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

/**
 * 状态徽章组件
 */
export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
}: BadgeProps) {
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
  color?: "gray" | "green" | "yellow" | "red" | "gold";
  className?: string;
}) {
  const dotColors = {
    gray: "bg-gray-400",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    gold: "bg-brand-gold",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("h-2 w-2 rounded-full", dotColors[color])} />
      {children}
    </span>
  );
}

