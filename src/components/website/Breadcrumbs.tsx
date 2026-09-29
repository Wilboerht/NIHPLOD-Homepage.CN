import { Link } from "next-view-transitions";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItemData {
  name: string;
  url: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItemData[];
  className?: string;
}

/**
 * 可见面包屑导航
 * 与页面 BreadcrumbList 结构化数据对应（结构化数据需对应用户可见内容）
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="面包屑"
      className={cn("px-6 pt-5 text-[12px] font-light tracking-[0.06em]", className)}
    >
      <ol className="flex flex-wrap items-center justify-center gap-1.5 text-brand-charcoal/50">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.url} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />}
              {isLast ? (
                <span aria-current="page" className="text-brand-charcoal/70">
                  {item.name}
                </span>
              ) : (
                <Link href={item.url} className="transition-colors hover:text-brand-charcoal">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
