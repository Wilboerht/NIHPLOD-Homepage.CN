/**
 * 后台管理导航配置
 */
import {
  BadgeCheck,
  Bell,
  Briefcase,
  FolderTree,
  Gift,
  Key,
  LayoutDashboard,
  MessageSquare,
  Package,
  ReceiptText,
  Scale,
  ScanFace,
  ScrollText,
  Shield,
  Timer,
  UserCheck,
  UserX,
  Users,
  LucideIcon,
} from "lucide-react";
import type { AdminPermission } from "@/lib/admin-permissions";
import { getSectionEntry, type AdminSectionKey } from "./admin-sections";

/** 侧边栏待办数量来源，对应 /api/admin/nav-counts */
export type AdminNavCountKey =
  | "messages"
  | "baComplaints"
  | "accountDeletions"
  | "spentAdjustments"
  | "pointRedemptions"
  | "redemptionAfterSales"
  | "applications"
  | "approvals";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number; // 可选徽章数字（如未读消息数）
  /** 访问所需权限点（不填表示所有管理员可见） */
  permission?: AdminPermission;
  /** 任一权限点满足即可访问（用于同时支持多个权限域的页面） */
  permissionsAny?: AdminPermission[];
  /** 待办数量来源；多个来源会求和展示 */
  countKeys?: AdminNavCountKey[];
  /** 兼容单来源写法 */
  countKey?: AdminNavCountKey;
  /** 域中心分区；用于面包屑与页签 */
  section?: AdminSectionKey;
  /** 额外视为激活的路径前缀（域中心未移动到同一路径时使用） */
  activePrefixes?: string[];
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * 侧边栏分组（显式声明，避免依赖数组相邻顺序）
 * 数组顺序即展示顺序；权限过滤后为空的分组整体隐藏。
 */
export const adminNavGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { title: "仪表盘", href: "/admin", icon: LayoutDashboard, permission: "dashboard:read" },
    ],
  },
  {
    label: "会员运营",
    items: [
      { title: "用户管理", href: "/admin/users", icon: Users, permission: "users:read" },
      {
        title: "注销申请",
        href: "/admin/account-deletions",
        icon: UserX,
        permission: "users:read",
        countKeys: ["accountDeletions"],
      },
      {
        title: "消费审核",
        href: "/admin/spent-adjustments",
        icon: ReceiptText,
        permissionsAny: ["spent:read", "spent:import", "spent:create", "spent:review"],
        countKeys: ["spentAdjustments"],
      },
      {
        title: "对账中心",
        href: "/admin/reconciliation",
        icon: Scale,
        permission: "reconciliation:read",
      },
      {
        title: "积分兑换",
        href: "/admin/point-gifts",
        icon: Gift,
        section: "points",
        activePrefixes: ["/admin/redemption-after-sales", "/admin/points-ledger"],
        permissionsAny: [
          "redemptions:read",
          "redemptions:fulfill",
          "redemptions:cancel",
          "redemptions:after-sales",
          "gifts:read",
          "gifts:write",
          "points:read",
        ],
        countKeys: ["pointRedemptions", "redemptionAfterSales"],
      },
      {
        title: "留言管理",
        href: "/admin/messages",
        icon: MessageSquare,
        permissionsAny: [
          "messages:read",
          "ba:complaints:read",
          "ba:complaints:write",
          "ba:complaints:delete",
          "ba:complaints:sensitive:read",
        ],
        countKeys: ["messages", "baComplaints"],
      },
    ],
  },
  {
    label: "商品管理",
    items: [
      { title: "产品管理", href: "/admin/products", icon: Package, permission: "products:read" },
      {
        title: "分类管理",
        href: "/admin/categories",
        icon: FolderTree,
        permission: "categories:read",
      },
    ],
  },
  {
    label: "招聘管理",
    items: [
      { title: "职位管理", href: "/admin/jobs", icon: Briefcase, permission: "jobs:read" },
      {
        title: "简历管理",
        href: "/admin/applications",
        icon: UserCheck,
        permission: "applications:read",
        countKeys: ["applications"],
      },
    ],
  },
  {
    label: "安全与审计",
    items: [
      {
        title: "审批中心",
        href: "/admin/approvals",
        icon: BadgeCheck,
        permissionsAny: ["approvals:request", "approvals:review"],
        countKeys: ["approvals"],
      },
      { title: "管理员管理", href: "/admin/admins", icon: Shield, permission: "admins:read" },
      {
        title: "审计中心",
        href: "/admin/audit-logs",
        icon: ScrollText,
        permission: "audit:read",
        section: "audit",
        activePrefixes: ["/admin/audit-integrity", "/admin/audit-retention"],
      },
    ],
  },
  {
    label: "系统与集成",
    items: [
      {
        title: "法务文档",
        href: "/admin/legal",
        icon: Scale,
        permissionsAny: ["legal:read", "legal:write"],
      },
      { title: "定时任务", href: "/admin/cron-tasks", icon: Timer, permission: "cron:read" },
      {
        title: "通知投递",
        href: "/admin/notification-outbox",
        icon: Bell,
        section: "notifications",
        activePrefixes: ["/admin/webhook-failures"],
        permission: "notifications:read",
      },
      {
        title: "SSO 管理",
        href: "/admin/oauth/stats",
        icon: Key,
        section: "sso",
        activePrefixes: ["/admin/oauth", "/admin/oauth-clients"],
        permission: "sso:read",
      },
    ],
  },
  {
    label: "子站概览",
    items: [
      {
        title: "测肤子站",
        href: "/admin/subsites/advisor",
        icon: ScanFace,
        permissionsAny: ["advisor:stats:read", "advisor:access", "advisor:admin"],
      },
      {
        title: "BA 平台",
        href: "/admin/subsites/ba",
        icon: BadgeCheck,
        section: "ba",
        activePrefixes: ["/admin/subsites/ba/certificates"],
        permissionsAny: ["ba:access", "ba:admin"],
      },
    ],
  },
];

/** 扁平化导航项，供面包屑与当前项匹配使用 */
export const adminNavItems: NavItem[] = adminNavGroups.flatMap((group) => group.items);

/** 权限过滤：移除无权项，并丢弃过滤后为空的分组 */
export function getVisibleNavGroups(permissions: readonly string[]): NavGroup[] {
  return adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.permissionsAny) {
          return item.permissionsAny.some((permission) => permissions.includes(permission));
        }
        return !item.permission || permissions.includes(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** 路径段级匹配：/admin/foo 不会误命中 /admin/foobar */
export function isNavItemActive(
  item: Pick<NavItem, "href" | "activePrefixes">,
  pathname: string
): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return (item.activePrefixes ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * 获取当前路径对应的导航项
 */
function getActiveNavItem(pathname: string): NavItem | undefined {
  return adminNavItems.find((item) => isNavItemActive(item, pathname));
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
  // 法务文档编辑: /admin/legal/terms | /admin/legal/privacy
  if (/^\/admin\/legal\/(terms|privacy)\/?$/.test(pathname)) {
    return { title: "编辑法务文档", href: pathname };
  }
  // 管理员安全中心: /admin/settings/totp
  if (pathname === "/admin/settings/totp") {
    return { title: "管理员安全中心", href: "/admin/settings/totp" };
  }
  return null;
}

/**
 * 生成面包屑导航
 */
export function getBreadcrumbs(pathname: string): { title: string; href: string }[] {
  const breadcrumbs = [{ title: "管理后台", href: "/admin" }];

  // 仪表盘是 /admin 本身：补一级“仪表盘”，避免移动端标题与 document.title 只剩“管理后台”
  if (pathname === "/admin") {
    breadcrumbs.push({ title: "仪表盘", href: "/admin" });
    return breadcrumbs;
  }

  const activeItem = getActiveNavItem(pathname);
  if (activeItem && activeItem.href !== "/admin") {
    breadcrumbs.push({ title: activeItem.title, href: activeItem.href });
  }

  const sectionEntry = getSectionEntry(pathname);
  if (sectionEntry && sectionEntry.tab.label !== activeItem?.title) {
    breadcrumbs.push({ title: sectionEntry.tab.label, href: sectionEntry.tab.href });
  }

  const deepPath = parseDeepPath(pathname);
  if (deepPath) {
    breadcrumbs.push({ title: deepPath.title, href: deepPath.href });
  }

  return breadcrumbs;
}
