import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileListProps {
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  skeletonCount?: number;
  className?: string;
  children?: ReactNode;
}

export function MobileList({
  loading = false,
  error,
  empty,
  skeletonCount = 3,
  className,
  children,
}: MobileListProps) {
  if (loading) {
    return (
      <div className={cn("space-y-2 md:hidden", className)}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-brand-charcoal/[0.04]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-brand-charcoal/10 bg-white px-4 py-10 text-center text-sm text-brand-charcoal/50 md:hidden",
          className
        )}
      >
        {error}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-brand-charcoal/10 bg-white px-4 py-10 text-center text-sm text-brand-charcoal/50 md:hidden",
          className
        )}
      >
        {empty}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "divide-y divide-brand-charcoal/10 overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white md:hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
