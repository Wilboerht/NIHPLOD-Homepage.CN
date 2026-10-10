import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconButtonVariant = "ghost" | "danger";
type IconButtonSize = "md" | "lg";

const variantCls: Record<IconButtonVariant, string> = {
  ghost: "text-brand-charcoal/50 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.06]",
  danger: "text-brand-charcoal/50 hover:text-red-500 hover:bg-red-500/10",
};

const sizeCls: Record<IconButtonSize, string> = {
  md: "p-2 min-h-[36px] min-w-[36px]",
  lg: "p-2 min-h-[44px] min-w-[44px]",
};

interface IconButtonProps {
  /** 必填：图标按钮没有可见文字，靠 aria-label 传达用途 */
  label: string;
  /** 传 href 时渲染为链接（如"编辑"跳转） */
  href?: string;
  onClick?: () => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  title?: string;
  className?: string;
  children: ReactNode;
}

/** 管理端图标按钮：默认 36px 触控区 */
export function IconButton({
  label,
  href,
  onClick,
  variant = "ghost",
  size = "md",
  title,
  className,
  children,
}: IconButtonProps) {
  const cls = cn(
    "inline-flex items-center justify-center rounded-lg transition-colors",
    variantCls[variant],
    sizeCls[size],
    className
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} title={title} onClick={onClick} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title} className={cls}>
      {children}
    </button>
  );
}
