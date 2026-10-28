"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type DashboardModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface DashboardModalCardProps {
  title: string;
  icon?: ReactNode;
  /** 折叠态的一行摘要 */
  summary?: ReactNode;
  className?: string;
  modalSize?: DashboardModalSize;
  children: ReactNode;
}

/**
 * 仪表盘摘要卡：点击打开弹窗查看完整内容，不做就地展开。
 * 服务端渲染的子节点通过 children 传入，仅弹窗打开时挂载。
 */
export function DashboardModalCard({
  title,
  icon,
  summary,
  className,
  modalSize = "lg",
  children,
}: DashboardModalCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-brand-charcoal/10 bg-white px-4 py-3 text-left transition-colors hover:bg-brand-charcoal/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 sm:px-5",
          className
        )}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-charcoal">
            {icon}
            {title}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate text-xs text-brand-charcoal/65">{summary}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-brand-charcoal/40 transition-transform group-hover:translate-x-0.5"
        />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size={modalSize}>
        {children}
      </Modal>
    </>
  );
}
