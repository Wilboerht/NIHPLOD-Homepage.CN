"use client";

/**
 * Empty 空状态组件
 *
 * 统一空数据的展示：图标 + 标题 + 描述 + 可选操作按钮。
 *
 * @example
 * ```tsx
 * <Empty
 *   title="暂无订单"
 *   description="用户下单后会显示在这里"
 *   action={<Button>去创建</Button>}
 * />
 * ```
 */
import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * 空状态组件
 */
export function Empty({ title = "暂无数据", description, icon, action, className }: EmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-charcoal/[0.04]">
        {icon || <Inbox className="h-8 w-8 text-brand-charcoal/25" />}
      </div>
      <div>
        <p className="text-sm font-medium text-brand-charcoal/70">{title}</p>
        {description && <p className="mt-1 text-sm text-brand-charcoal/50">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
