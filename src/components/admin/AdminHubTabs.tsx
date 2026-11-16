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
  const { permissions, loading } = useAdminPermissions();
  const tabs = useMemo(
    () => getVisibleSectionTabs(section, Array.from(permissions ?? [])),
    [permissions, section]
  );

  if (loading) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center gap-1 rounded-xl bg-surface-muted p-1",
          className
        )}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-9 flex-1 animate-pulse rounded-lg bg-brand-charcoal/10 sm:flex-none sm:w-24"
          />
        ))}
      </div>
    );
  }

  if (tabs.length < 2) return null;

  return (
    <div className={cn("relative", className)}>
      <nav
        aria-label={`${ADMIN_SECTIONS[section].title}分区`}
        className="scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1"
      >
        {tabs.map((tab) => {
          const active = isActive(tab, pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 sm:min-h-9",
                active
                  ? "bg-white font-medium text-brand-charcoal shadow-sm"
                  : "text-ink-muted hover:bg-white/70 hover:text-brand-charcoal"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-1 w-8 rounded-r-xl bg-gradient-to-l from-surface-muted to-transparent"
      />
    </div>
  );
}
