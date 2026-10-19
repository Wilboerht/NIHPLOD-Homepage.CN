"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormActionsProps {
  children: ReactNode;
  start?: ReactNode;
  className?: string;
}

export function FormActions({ children, start, className }: FormActionsProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-t border-brand-charcoal/10 bg-white/95 px-4 py-3 backdrop-blur-sm",
        "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
        "sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
        start ? "justify-between" : "justify-end",
        className
      )}
    >
      {start ? <div className="min-w-0 flex-1">{start}</div> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
