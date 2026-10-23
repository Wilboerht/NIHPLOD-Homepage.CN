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
  UserX,
  Shield,
  ShieldCheck,
  ScrollText,
  Key,
  UserCog,
  MonitorStop,
  FileSearch,
  Activity,
  ClipboardCheck,
  Gift,
  Webhook,
  Timer,
  LucideIcon,
} from "lucide-react";
import type { AdminPermission } from "@/lib/admin-permissions";

export type AdminPageWidth = "narrow" | "default" | "wide";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number; // 可选徽章数字（如未读消息数）
  /** 访问所需权限点（不填表示所有管理员可见，如个人安全设置） */
  permission?: AdminPermission;
  /** 任一权限点满足即可访问（用于同时支持多个权限域的页面） */
  permissionsAny?: AdminPermission[];
  group?: string; // 导航分组（sidebar 渲染分组标题）
  /** 页面内容宽度：默认 5xl；多列表格用 wide，设置/向导用 narrow */
  width?: AdminPageWidth;
}

export const adminNavItems: NavItem[] = [
  { title: "仪表盘", href: "/admin", icon: LayoutDashboard, permission: "dashboard:read" },
  // 商城管理
  {
    title: "用户管理",
    href: "/admin/users",
    icon: Users,
    permission: "users:read",
    group: "商城管理",
  },
  {
    title: "注销申请管理",
    href: "/admin/account-deletions",
    icon: UserX,
    permission: "users:read",
    group: "商城管理",
  },
  {
    title: "产品管理",
    href: "/admin/products",
    icon: Package,
    permission: "products:read",
    group: "商城管理",
  },
  {
    title: "分类管理",
    href: "/admin/categories",
    icon: FolderTree,
    permission: "categories:read",
    group: "商城管理",
  },
  {
    title: "消费记录审核",
    href: "/admin/spent-adjustments",
    icon: ClipboardCheck,
    permissionsAny: ["spent:read", "spent:import"],
    group: "商城管理",
    width: "wide",
  },
  {
    title: "积分礼品",
    href: "/admin/point-gifts",
    icon: Gift,
    permissionsAny: ["redemptions:read", "gifts:read"],
    group: "商城管理",
  },
  // 招聘管理
  {
    title: "职位管理",
    href: "/admin/jobs",
    icon: Briefcase,
    permission: "jobs:read",
    group: "招聘管理",
  },
  {
    title: "简历管理",
    href: "/admin/applications",
    icon: UserCheck,
    permission: "applications:read",
    group: "招聘管理",
  },
  // 系统管理
  {
    title: "留言管理",
    href: "/admin/messages",
    icon: MessageSquare,
    permission: "messages:read",
    group: "系统管理",
  },
  {
    title: "管理员管理",
    href: "/admin/admins",
    icon: Shield,
    permission: "admins:read",
    group: "系统管理",
  },
  // 个人安全设置对所有管理员开放
  { title: "安全设置", href: "/admin/settings/totp", icon: ShieldCheck, group: "系统管理" },
  {
    title: "审计日志",
    href: "/admin/audit-logs",
    icon: ScrollText,
    permission: "audit:read",
    group: "系统管理",
  },
  {
    title: "定时任务",
    href: "/admin/cron-tasks",
    icon: Timer,
    permission: "cron:read",
    group: "系统管理",
  },
  // SSO 管理
  {
    title: "SSO 客户端",
    href: "/admin/oauth-clients",
    icon: Key,
    permission: "sso:clients:read",
    group: "SSO 管理",
    width: "wide",
  },
  {
    title: "SSO 授权管理",
    href: "/admin/oauth/consents",
    icon: UserCog,
    permission: "sso:read",
    group: "SSO 管理",
  },
  {
    title: "SSO 会话管理",
    href: "/admin/oauth/sessions",
    icon: MonitorStop,
    permission: "sso:read",
    group: "SSO 管理",
  },
  {
    title: "SSO 审计日志",
    href: "/admin/oauth/audit",
    icon: FileSearch,
    permission: "sso:read",
    group: "SSO 管理",
  },
  {
    title: "SSO 统计概览",
    href: "/admin/oauth/stats",
    icon: Activity,
    permission: "sso:read",
    group: "SSO 管理",
  },
  {
    title: "通知失败队列",
    href: "/admin/webhook-failures",
    icon: Webhook,
    permission: "webhooks:read",
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

const PAGE_WIDTH_OVERRIDES: Record<string, AdminPageWidth> = {
  // 非导航页 / 需要覆盖父级宽度的页面
  "/admin/oauth-clients/wizard": "narrow",
  "/admin/settings/totp": "narrow",
};

/**
 * 页面内容宽度：由 Shell 统一应用，页面不再写 mx-auto max-w-*。
 * 多列表格（9-10 列）用 wide，设置/向导用 narrow，其余 default(5xl)。
 */
export function getAdminPageWidth(pathname: string): AdminPageWidth {
  const normalized = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  const override = PAGE_WIDTH_OVERRIDES[normalized];
  if (override) return override;
  return getActiveNavItem(normalized)?.width ?? "default";
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
