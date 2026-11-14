import type { AdminPermission } from "@/lib/admin-permissions";

export type AdminSectionKey = "sso" | "audit" | "notifications" | "points" | "ba";

export interface AdminSectionTab {
  label: string;
  href: string;
  permission?: AdminPermission;
  permissionsAny?: AdminPermission[];
}

export interface AdminSection {
  title: string;
  tabs: AdminSectionTab[];
}

/**
 * 域中心页签配置。
 * 导航只保留一个入口，页签负责域内页面切换；现有 URL 保持不变，避免破坏书签。
 */
export const ADMIN_SECTIONS: Record<AdminSectionKey, AdminSection> = {
  sso: {
    title: "SSO 管理",
    tabs: [
      { label: "概览", href: "/admin/oauth/stats", permission: "sso:read" },
      { label: "OAuth 客户端", href: "/admin/oauth-clients", permission: "sso:clients:read" },
      { label: "授权记录", href: "/admin/oauth/consents", permission: "sso:read" },
      { label: "会话管理", href: "/admin/oauth/sessions", permission: "sso:read" },
      { label: "SSO 审计", href: "/admin/oauth/audit", permission: "sso:read" },
    ],
  },
  audit: {
    title: "审计中心",
    tabs: [
      { label: "审计日志", href: "/admin/audit-logs", permission: "audit:read" },
      { label: "审计完整性", href: "/admin/audit-integrity", permission: "audit:read" },
      {
        label: "审计保留",
        href: "/admin/audit-retention",
        permission: "audit:retention:read",
      },
    ],
  },
  notifications: {
    title: "通知投递",
    tabs: [
      {
        label: "事务通知",
        href: "/admin/notification-outbox",
        permission: "notifications:read",
      },
      { label: "SSO 通知失败", href: "/admin/webhook-failures", permission: "webhooks:read" },
    ],
  },
  points: {
    title: "积分兑换",
    tabs: [
      {
        label: "兑换履约",
        href: "/admin/point-gifts",
        permissionsAny: [
          "redemptions:read",
          "redemptions:fulfill",
          "redemptions:cancel",
          "gifts:read",
          "gifts:write",
        ],
      },
      {
        label: "兑换售后",
        href: "/admin/redemption-after-sales",
        permission: "redemptions:after-sales",
      },
      { label: "积分流水", href: "/admin/points-ledger", permission: "points:read" },
    ],
  },
  ba: {
    title: "BA 平台",
    tabs: [
      {
        label: "平台概览",
        href: "/admin/subsites/ba",
        permissionsAny: ["ba:access", "ba:admin"],
      },
      {
        label: "证书管理",
        href: "/admin/subsites/ba/certificates",
        permission: "ba:certificates:read",
      },
    ],
  },
};

export function getSectionEntry(pathname: string): {
  sectionKey: AdminSectionKey;
  section: AdminSection;
  tab: AdminSectionTab;
} | null {
  let best: { sectionKey: AdminSectionKey; section: AdminSection; tab: AdminSectionTab } | null =
    null;
  for (const [sectionKey, section] of Object.entries(ADMIN_SECTIONS) as [
    AdminSectionKey,
    AdminSection,
  ][]) {
    for (const tab of section.tabs) {
      if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
        if (!best || tab.href.length > best.tab.href.length) {
          best = { sectionKey, section, tab };
        }
      }
    }
  }
  return best;
}

export function getVisibleSectionTabs(
  sectionKey: AdminSectionKey,
  permissions: readonly string[]
): AdminSectionTab[] {
  return ADMIN_SECTIONS[sectionKey].tabs.filter((tab) => {
    if (tab.permissionsAny) return tab.permissionsAny.some((p) => permissions.includes(p));
    return !tab.permission || permissions.includes(tab.permission);
  });
}
