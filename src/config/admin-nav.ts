/**
 * 后台管理导航配置
 */
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Briefcase,
  UserCheck,
  MessageSquare,
  ShoppingCart,
  Users,
  Ticket,
  Shield,
  ScrollText,
  LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number; // 可选的徽章数字（如未读消息数）
  roles?: string[]; // 允许访问的角色，不填则全部允许
}

export const adminNavItems: NavItem[] = [
  { title: "仪表盘", href: "/admin", icon: LayoutDashboard, roles: ["owner", "admin"] },
  { title: "订单管理", href: "/admin/orders", icon: ShoppingCart, roles: ["owner", "admin"] },
  { title: "用户管理", href: "/admin/users", icon: Users, roles: ["owner", "admin"] },
  { title: "产品管理", href: "/admin/products", icon: Package, roles: ["owner", "admin"] },
  { title: "分类管理", href: "/admin/categories", icon: FolderTree, roles: ["owner", "admin"] },
  { title: "优惠券管理", href: "/admin/coupons", icon: Ticket, roles: ["owner", "admin"] },
  { title: "职位管理", href: "/admin/jobs", icon: Briefcase, roles: ["owner", "admin"] },
  { title: "简历管理", href: "/admin/applications", icon: UserCheck, roles: ["owner", "admin"] },
  { title: "留言管理", href: "/admin/messages", icon: MessageSquare, roles: ["owner", "admin"] },
  { title: "管理员管理", href: "/admin/admins", icon: Shield, roles: ["owner"] },
  { title: "审计日志", href: "/admin/audit-logs", icon: ScrollText, roles: ["owner", "admin"] },
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

