"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  ADMIN_SECTIONS,
  getVisibleSectionTabs,
  type AdminSectionKey,
  type AdminSectionTab,
} from "@/config/admin-sections";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { cn } from "@/lib/utils";

function isActive(tab: AdminSectionTab, pathname: string): boolean {
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/**
 * 域中心页签：把低频域内页面收进二级页签。
 * - 权限过滤后只剩一个页签时不渲染，避免无意义的单页签
 * - 现有页面 URL 保持不变，页签仅负责切换
 */
export function AdminHubTabs({
  section,
  className,
}: {
  section: AdminSectionKey;
  className?: string;
}) {
  const pathname = usePathname();
  const { permissions } = useAdminPermissions();
  const tabs = useMemo(
    () => getVisibleSectionTabs(section, Array.from(permissions ?? [])),
    [permissions, section]
  );

  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label={`${ADMIN_SECTIONS[section].title}分区`}
      className={cn(
        "scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-xl bg-brand-charcoal/[0.04] p-1",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = isActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
              active
                ? "bg-white font-medium text-brand-charcoal shadow-sm"
                : "text-brand-charcoal/65 hover:bg-white/70 hover:text-brand-charcoal"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
