"use client";

import { ReactNode } from "react";
import { Link } from "next-view-transitions";
import { m } from "framer-motion";
import {
  Package,
  Search,
  ShoppingBag,
  FileText,
  Users,
  Heart,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeInUp, defaultTransition } from "@/lib/animations";

/**
 * 预设的空状态类型
 */
type EmptyStateType =
  | "products"
  | "search"
  | "cart"
  | "orders"
  | "jobs"
  | "favorites"
  | "custom";

/**
 * 预设配置
 */
const presets: Record<
  Exclude<EmptyStateType, "custom">,
  { icon: LucideIcon; title: string; description: string }
> = {
  products: {
    icon: Package,
    title: "暂无产品",
    description: "我们正在准备更多精选产品，敬请期待",
  },
  search: {
    icon: Search,
    title: "未找到结果",
    description: "尝试使用其他关键词搜索",
  },
  cart: {
    icon: ShoppingBag,
    title: "购物车为空",
    description: "快去挑选心仪的护肤产品吧",
  },
  orders: {
    icon: FileText,
    title: "暂无订单",
    description: "您还没有任何订单记录",
  },
  jobs: {
    icon: Users,
    title: "暂无职位",
    description: "目前没有开放的职位，请稍后再来查看",
  },
  favorites: {
    icon: Heart,
    title: "暂无收藏",
    description: "收藏您喜欢的产品，方便下次查看",
  },
};

interface EmptyStateProps {
  /**
   * 预设类型
   */
  type?: EmptyStateType;
  /**
   * 自定义图标
   */
  icon?: LucideIcon;
  /**
   * 自定义标题
   */
  title?: string;
  /**
   * 自定义描述
   */
  description?: string;
  /**
   * 操作按钮文字
   */
  actionText?: string;
  /**
   * 操作按钮链接
   */
  actionHref?: string;
  /**
   * 操作按钮点击事件
   */
  onAction?: () => void;
  /**
   * 自定义内容
   */
  children?: ReactNode;
  /**
   * 容器类名
   */
  className?: string;
  /**
   * 尺寸
   */
  size?: "sm" | "md" | "lg";
}

/**
 * 空状态组件 - 用于显示无数据时的友好提示
 */
export function EmptyState({
  type = "custom",
  icon: customIcon,
  title: customTitle,
  description: customDescription,
  actionText,
  actionHref,
  onAction,
  children,
  className,
  size = "md",
}: EmptyStateProps) {
  // 获取预设或自定义配置
  const preset = type !== "custom" ? presets[type] : null;
  const Icon = customIcon || preset?.icon || Package;
  const title = customTitle || preset?.title || "暂无内容";
  const description = customDescription || preset?.description || "";

  // 尺寸配置
  const sizeClasses = {
    sm: {
      container: "py-8",
      icon: "h-10 w-10",
      iconWrapper: "h-16 w-16",
      title: "text-base",
      description: "text-xs",
    },
    md: {
      container: "py-12",
      icon: "h-12 w-12",
      iconWrapper: "h-20 w-20",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "py-16",
      icon: "h-16 w-16",
      iconWrapper: "h-24 w-24",
      title: "text-xl",
      description: "text-base",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <m.div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
    >
      {/* 图标 */}
      <div
        className={cn(
          "mb-4 flex items-center justify-center rounded-full bg-brand-beige/50",
          sizes.iconWrapper
        )}
      >
        <Icon className={cn("text-brand-gold/60", sizes.icon)} />
      </div>

      {/* 标题 */}
      <h3
        className={cn(
          "font-serif text-brand-charcoal",
          sizes.title
        )}
      >
        {title}
      </h3>

      {/* 描述 */}
      {description && (
        <p
          className={cn(
            "mx-auto mt-2 max-w-xs text-brand-charcoal/60",
            sizes.description
          )}
        >
          {description}
        </p>
      )}

      {/* 自定义内容 */}
      {children && <div className="mt-4">{children}</div>}

      {/* 操作按钮 */}
      {(actionText && actionHref) || (actionText && onAction) ? (
        <div className="mt-6">
          {actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-gold/90 hover:shadow-md"
            >
              {actionText}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-gold/90 hover:shadow-md"
            >
              {actionText}
            </button>
          )}
        </div>
      ) : null}
    </m.div>
  );
}

