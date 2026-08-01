"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  showTotal?: boolean;
  className?: string;
  /** 每页条数选择（可选）。传了 onPageSizeChange 才显示选择器 */
  onPageSizeChange?: (pageSize: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * 分页控件组件
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  showTotal = true,
  className,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);

  // 单页时仍显示"共 N 条 + 每页条数选择器"（只有一页时隐藏页码）
  if (totalPages <= 1) {
    if (!onPageSizeChange && !showTotal) return null;
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showTotal && <span className="mr-2 text-sm text-brand-charcoal/50">共 {total} 条</span>}
        {onPageSizeChange && (
          <label className="mr-2 flex items-center gap-1 text-sm text-brand-charcoal/50">
            每页
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-brand-charcoal/20 bg-white px-2 py-1 text-sm text-brand-charcoal focus:border-brand-primary focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            条
          </label>
        )}
      </div>
    );
  }

  // 生成页码数组
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 总是显示第一页
      pages.push(1);

      if (page > 3) {
        pages.push("ellipsis");
      }

      // 显示当前页附近的页码
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push("ellipsis");
      }

      // 总是显示最后一页
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  const buttonBaseStyles =
    "flex h-9 min-w-[36px] items-center justify-center rounded-lg text-sm font-medium transition-colors";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* 总数显示 + 每页条数选择 */}
      {showTotal && <span className="mr-2 text-sm text-brand-charcoal/50">共 {total} 条</span>}
      {onPageSizeChange && (
        <label className="mr-2 flex items-center gap-1 text-sm text-brand-charcoal/50">
          每页
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-brand-charcoal/20 bg-white px-2 py-1 text-sm text-brand-charcoal focus:border-brand-primary focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          条
        </label>
      )}

      {/* 上一页 */}
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={cn(
          buttonBaseStyles,
          "border border-brand-charcoal/20 bg-white px-2",
          page === 1 ? "cursor-not-allowed opacity-50" : "hover:bg-brand-charcoal/[0.03]"
        )}
        aria-label="上一页"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* 页码 */}
      <div className="flex gap-1">
        {pageNumbers.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center text-brand-charcoal/50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item)}
              aria-current={page === item ? "page" : undefined}
              aria-label={`第 ${item} 页`}
              className={cn(
                buttonBaseStyles,
                "px-3",
                page === item
                  ? "bg-brand-primary text-white"
                  : "border border-brand-charcoal/20 bg-white hover:bg-brand-charcoal/[0.03]"
              )}
            >
              {item}
            </button>
          )
        )}
      </div>

      {/* 下一页 */}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={cn(
          buttonBaseStyles,
          "border border-brand-charcoal/20 bg-white px-2",
          page === totalPages ? "cursor-not-allowed opacity-50" : "hover:bg-brand-charcoal/[0.03]"
        )}
        aria-label="下一页"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
