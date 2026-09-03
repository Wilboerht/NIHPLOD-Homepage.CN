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
  Users,
  Shield,
  ShieldCheck,
  ScrollText,
  Crown,
  Key,
  UserCog,
  MonitorStop,
  FileSearch,
  Activity,
  ClipboardCheck,
  LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number; // 可选的徽章数字（如未读消息数）
  roles?: string[]; // 允许访问的角色，不填则全部允许
  group?: string; // 导航分组（sidebar 渲染分组标题）
}

export const adminNavItems: NavItem[] = [
  { title: "仪表盘", href: "/admin", icon: LayoutDashboard, roles: ["owner", "admin"] },
  // 商城管理
  {
    title: "用户管理",
    href: "/admin/users",
    icon: Users,
    roles: ["owner", "admin"],
    group: "商城管理",
  },
  {
    title: "产品管理",
    href: "/admin/products",
    icon: Package,
    roles: ["owner", "admin"],
    group: "商城管理",
  },
  {
    title: "分类管理",
    href: "/admin/categories",
    icon: FolderTree,
    roles: ["owner", "admin"],
    group: "商城管理",
  },
  {
    title: "会员等级定义",
    href: "/admin/vip",
    icon: Crown,
    roles: ["owner", "admin"],
    group: "商城管理",
  },
  {
    title: "消费记录审核",
    href: "/admin/spent-adjustments",
    icon: ClipboardCheck,
    roles: ["owner", "admin"],
    group: "商城管理",
  },
  // 招聘管理
  {
    title: "职位管理",
    href: "/admin/jobs",
    icon: Briefcase,
    roles: ["owner", "admin"],
    group: "招聘管理",
  },
  {
    title: "简历管理",
    href: "/admin/applications",
    icon: UserCheck,
    roles: ["owner", "admin"],
    group: "招聘管理",
  },
  // 系统管理
  {
    title: "留言管理",
    href: "/admin/messages",
    icon: MessageSquare,
    roles: ["owner", "admin"],
    group: "系统管理",
  },
  { title: "管理员管理", href: "/admin/admins", icon: Shield, roles: ["owner"], group: "系统管理" },
  {
    title: "安全设置",
    href: "/admin/settings/totp",
    icon: ShieldCheck,
    roles: ["owner", "admin"],
    group: "系统管理",
  },
  {
    title: "审计日志",
    href: "/admin/audit-logs",
    icon: ScrollText,
    roles: ["owner", "admin"],
    group: "系统管理",
  },
  // SSO 管理
  {
    title: "SSO 客户端",
    href: "/admin/oauth-clients",
    icon: Key,
    roles: ["owner"],
    group: "SSO 管理",
  },
  {
    title: "SSO 授权管理",
    href: "/admin/oauth/consents",
    icon: UserCog,
    roles: ["owner"],
    group: "SSO 管理",
  },
  {
    title: "SSO 会话管理",
    href: "/admin/oauth/sessions",
    icon: MonitorStop,
    roles: ["owner"],
    group: "SSO 管理",
  },
  {
    title: "SSO 审计日志",
    href: "/admin/oauth/audit",
    icon: FileSearch,
    roles: ["owner"],
    group: "SSO 管理",
  },
  {
    title: "SSO 统计概览",
    href: "/admin/oauth/stats",
    icon: Activity,
    roles: ["owner"],
    group: "SSO 管理",
  },
];

/**
 * 获取当前路径对应的导航项
 */
function getActiveNavItem(pathname: string): NavItem | undefined {
  // 精确匹配仪表盘
  if (pathname === "/admin") {
    return adminNavItems[0];
  }
  // 前缀匹配其他页面
  return adminNavItems.find((item) => item.href !== "/admin" && pathname.startsWith(item.href));
}

/**
 * 解析路径获取深层路径信息
 */
function parseDeepPath(pathname: string): { title: string; href: string } | null {
  // 产品编辑: /admin/products/[id]/edit
  if (pathname.match(/\/admin\/products\/[^/]+\/edit/)) {
    return { title: "编辑产品", href: pathname };
  }
  // 产品新建: /admin/products/new
  if (pathname === "/admin/products/new") {
    return { title: "新增产品", href: "/admin/products/new" };
  }
  // 职位编辑: /admin/jobs/[id]/edit
  if (pathname.match(/\/admin\/jobs\/[^/]+\/edit/)) {
    return { title: "编辑职位", href: pathname };
  }
  // 职位新建: /admin/jobs/new
  if (pathname === "/admin/jobs/new") {
    return { title: "新增职位", href: "/admin/jobs/new" };
  }
  // OAuth 客户端向导: /admin/oauth-clients/wizard
  if (pathname === "/admin/oauth-clients/wizard") {
    return { title: "创建客户端", href: "/admin/oauth-clients/wizard" };
  }
  // TOTP 设置: /admin/settings/totp
  if (pathname === "/admin/settings/totp") {
    return { title: "安全设置", href: "/admin/settings/totp" };
  }
  return null;
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

  const deepPath = parseDeepPath(pathname);
  if (deepPath) {
    breadcrumbs.push({ title: deepPath.title, href: deepPath.href });
  }

  return breadcrumbs;
}
