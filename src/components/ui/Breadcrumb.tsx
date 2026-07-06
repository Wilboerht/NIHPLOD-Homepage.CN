import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * 面包屑导航
 *
 * 使用示例：
 * <Breadcrumb items={[{ label: "首页", href: "/" }, { label: "隐私政策" }]} />
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="面包屑导航"
      className={cn("py-4", className)}
    >
      <ol className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm scrollbar-hide">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <span
                  className="text-zinc-300 mx-1 select-none"
                  aria-hidden="true"
                >
                  ›
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center text-zinc-500 hover:text-zinc-900 transition-colors !min-h-0 !min-w-0 leading-none"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    isLast ? "text-zinc-900" : "text-zinc-500"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
