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

/**
 * 从名称生成 URL slug（小写、仅允许字母数字和连字符）
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/**
 * 判断当前路由是否隐藏全局底部导航栏
 * 独立全屏页面与产品详情页不显示 BottomNavBar，
 * 布局据此决定是否保留底部导航的占位 padding
 */
export function isBottomNavHiddenRoute(pathname: string): boolean {
  const isStandalonePage = ["/services", "/careers", "/contact", "/terms", "/privacy"].includes(
    pathname
  );
  const isProductDetailPage = pathname.startsWith("/products/") && pathname !== "/products";
  return isStandalonePage || isProductDetailPage;
}
