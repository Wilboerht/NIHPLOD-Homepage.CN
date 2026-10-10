import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 标题右侧的小附件（如状态徽标） */
  accessory?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
}

/**
 * 管理端页头：text-xl 标题 + 描述 + 右侧操作区
 * 页面边距由 AdminShell 统一提供，页头不再自带 padding
 */
export function PageHeader({ title, description, accessory, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-brand-charcoal">{title}</h1>
          {accessory}
        </div>
        {description && <p className="text-sm text-brand-charcoal/50">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
