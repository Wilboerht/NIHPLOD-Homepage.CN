import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsiblePanelProps {
  title: ReactNode;
  /** 收起状态下的一行摘要，展开后自动隐藏 */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * 可收起面板：基于原生 details/summary，无额外 JS、键盘可操作。
 * 默认收起，适合承载次要统计或低频信息。
 */
export function CollapsiblePanel({
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: CollapsiblePanelProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cn("group rounded-2xl border border-brand-charcoal/10 bg-white", className)}
    >
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
            {title}
          </h2>
          {summary && (
            <p className="mt-0.5 truncate text-xs text-brand-charcoal/65 group-open:hidden">
              {summary}
            </p>
          )}
        </div>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-brand-charcoal/65 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-brand-charcoal/10 px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
        {children}
      </div>
    </details>
  );
}
