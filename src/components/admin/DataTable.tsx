"use client";

import { ReactNode, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Plus } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// 列定义接口
export interface Column<T> {
  key: keyof T | string;
  title: string;
  width?: string;
  render?: (value: unknown, record: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
}

// 分页配置接口
interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

// 排序配置接口
interface SortConfig {
  key: string;
  order: "asc" | "desc";
}

// DataTable Props
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: PaginationConfig;
  rowKey?: keyof T | ((record: T) => string);
  onRowClick?: (record: T) => void;
  emptyText?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  onSort?: (key: string, order: "asc" | "desc") => void;
  className?: string;
}

/**
 * 数据表格组件
 */
export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  pagination,
  rowKey,
  onRowClick,
  emptyText = "暂无数据",
  emptyAction,
  onSort,
  className,
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // 获取行的唯一键
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === "function") {
      return rowKey(record);
    }
    if (rowKey && record[rowKey] !== undefined) {
      return String(record[rowKey]);
    }
    return String(index);
  };

  // 获取单元格值
  const getCellValue = (record: T, key: string): unknown => {
    const keys = key.split(".");
    let value: unknown = record;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    return value;
  };

  // 处理排序
  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return;

    const key = String(column.key);
    let order: "asc" | "desc" = "asc";

    if (sortConfig?.key === key) {
      order = sortConfig.order === "asc" ? "desc" : "asc";
    }

    setSortConfig({ key, order });
    onSort?.(key, order);
  };

  // 获取排序图标
  const getSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null;

    const key = String(column.key);
    if (sortConfig?.key !== key) {
      return <ArrowUpDown className="h-4 w-4 text-brand-charcoal/50" />;
    }
    return sortConfig.order === "asc" ? (
      <ArrowUp className="h-4 w-4 text-brand-primary" />
    ) : (
      <ArrowDown className="h-4 w-4 text-brand-primary" />
    );
  };

  const alignStyles = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-brand-charcoal/15 bg-white",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-brand-charcoal/10" aria-label={emptyText || "数据表格"}>
          <thead className="sticky top-0 z-10 bg-brand-charcoal/[0.02]">
            <tr>
              {columns.map((column) => {
                const sortState =
                  sortConfig?.key === String(column.key)
                    ? sortConfig.order === "asc"
                      ? ("ascending" as const)
                      : ("descending" as const)
                    : ("none" as const);
                return (
                  <th
                    key={String(column.key)}
                    scope="col"
                    style={{ width: column.width }}
                    className={cn(
                      "px-6 py-3 text-sm font-medium uppercase tracking-wider text-brand-charcoal/50",
                      alignStyles[column.align || "left"],
                      column.sortable && "cursor-pointer select-none hover:bg-brand-charcoal/[0.06]"
                    )}
                    aria-sort={column.sortable ? sortState : undefined}
                    onClick={() => handleSort(column)}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        column.align === "center" && "justify-center",
                        column.align === "right" && "justify-end"
                      )}
                    >
                      <span>{column.title}</span>
                      {getSortIcon(column)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/10 bg-white">
            {loading ? (
              // 加载状态
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={columns.length} />
              ))
            ) : data.length === 0 ? (
              // 空状态
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center text-brand-charcoal/50">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-4xl">📭</span>
                    <span>{emptyText}</span>
                    {emptyAction && (
                      <Button
                        size="sm"
                        onClick={emptyAction.onClick}
                        leftIcon={<Plus className="h-4 w-4" />}
                      >
                        {emptyAction.label}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              // 数据行
              data.map((record, rowIndex) => (
                <tr
                  key={getRowKey(record, rowIndex)}
                  onClick={() => onRowClick?.(record)}
                  className={cn(
                    "transition-colors even:bg-brand-charcoal/[0.02]",
                    onRowClick && "cursor-pointer hover:bg-brand-charcoal/[0.03]"
                  )}
                >
                  {columns.map((column) => {
                    const value = getCellValue(record, String(column.key));
                    return (
                      <td
                        key={String(column.key)}
                        className={cn(
                          "whitespace-nowrap px-6 py-4 text-sm text-brand-charcoal",
                          alignStyles[column.align || "left"]
                        )}
                      >
                        {column.render
                          ? column.render(value, record, rowIndex)
                          : value !== undefined && value !== null
                            ? String(value)
                            : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pagination && pagination.total > pagination.pageSize && (
        <div className="border-t border-brand-charcoal/15 px-6 py-4">
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={pagination.onChange}
          />
        </div>
      )}

      {/* 加载遮罩 */}
      {loading && data.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
      )}
    </div>
  );
}
