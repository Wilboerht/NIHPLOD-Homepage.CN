import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelCardProps {
  title?: ReactNode;
  /** 标题右侧操作区 */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * 管理端通用面板卡片：描边卡片（白底 + 细边框），标题区 + 内容区 + 可选操作区
 */
export function PanelCard({ title, action, className, children }: PanelCardProps) {
  return (
    <section
      className={cn("rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5", className)}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-brand-charcoal">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
