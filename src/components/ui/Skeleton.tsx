"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "rectangular" | "circular";
  width?: string | number;
  height?: string | number;
  animation?: "pulse" | "wave" | "none";
}

/**
 * 骨架屏组件
 */
export function Skeleton({
  className,
  variant = "rectangular",
  width,
  height,
  animation = "pulse",
}: SkeletonProps) {
  const variantStyles = {
    text: "rounded",
    rectangular: "rounded-lg",
    circular: "rounded-full",
  };

  const animationStyles = {
    pulse: "animate-pulse",
    wave: "animate-shimmer",
    none: "",
  };

  const style: React.CSSProperties = {
    width: width,
    height: height,
  };

  return (
    <div
      className={cn(
        "bg-gray-200",
        variantStyles[variant],
        animationStyles[animation],
        className
      )}
      style={style}
    />
  );
}

/**
 * 文本骨架屏
 */
export function TextSkeleton({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={cn(
            "h-4",
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

/**
 * 卡片骨架屏
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl bg-white p-6 shadow-sm", className)}>
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" className="h-12 w-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/**
 * 表格行骨架屏
 */
export function TableRowSkeleton({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

