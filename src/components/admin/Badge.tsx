import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "outline";

const variantCls: Record<BadgeVariant, string> = {
  neutral: "bg-brand-charcoal/10 text-brand-charcoal",
  success: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  danger: "bg-red-500/10 text-red-600 border border-red-500/20",
  outline: "border border-brand-charcoal/10 text-brand-charcoal/50",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

/**
 * 管理端专用徽标（与 ui/Badge 相互独立，样式对齐工具面板风格）
 */
export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        variantCls[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
