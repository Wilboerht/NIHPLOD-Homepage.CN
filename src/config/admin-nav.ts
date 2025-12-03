/**
 * 后台管理导航配置
 */
import {
  LayoutDashboard,
  Package,
  FolderTree,
  FileText,
  Image,
  Bot,
  Briefcase,
  MessageSquare,
  Settings,
  LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number; // 可选的徽章数字（如未读消息数）
}

export const adminNavItems: NavItem[] = [
  { title: "仪表盘", href: "/admin", icon: LayoutDashboard },
  { title: "产品管理", href: "/admin/products", icon: Package },
  { title: "分类管理", href: "/admin/categories", icon: FolderTree },
  { title: "页面内容", href: "/admin/pages", icon: FileText },
  { title: "媒体库", href: "/admin/media", icon: Image },
  { title: "AI 顾问", href: "/admin/advisor", icon: Bot },
  { title: "职位管理", href: "/admin/jobs", icon: Briefcase },
  { title: "留言管理", href: "/admin/messages", icon: MessageSquare },
  { title: "系统设置", href: "/admin/settings", icon: Settings },
];

/**
 * 获取当前路径对应的导航项
 */
export function getActiveNavItem(pathname: string): NavItem | undefined {
  // 精确匹配仪表盘
  if (pathname === "/admin") {
    return adminNavItems[0];
  }
  // 前缀匹配其他页面
  return adminNavItems.find(
    (item) => item.href !== "/admin" && pathname.startsWith(item.href)
  );
}

/**
 * 生成面包屑导航
 */
export function getBreadcrumbs(pathname: string): { title: string; href: string }[] {
  const breadcrumbs = [{ title: "管理后台", href: "/admin" }];
  
  const activeItem = getActiveNavItem(pathname);
  if (activeItem && activeItem.href !== "/admin") {
    breadcrumbs.push({ title: activeItem.title, href: activeItem.href });
  }
  
  return breadcrumbs;
}

