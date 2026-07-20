import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化价格
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**

 * 检查当前路径是否匹配给定的 href
 * 支持精确匹配和 startsWith 匹配（排除首页 "/" 的误判）
 */
export function isCurrentPage(pathname: string, href: string): boolean {
  return href === pathname || (href !== "/" && pathname.startsWith(href));
}
