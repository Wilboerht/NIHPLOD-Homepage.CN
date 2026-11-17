"use client";

import { Fragment, ReactNode, useState, type HTMLAttributes } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";

// 列定义接口
export interface Column<T> {
  key: keyof T | string;
  title: ReactNode;
  width?: string;
  render?: (value: unknown, record: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  /** 数字列：默认右对齐并使用等宽数字 */
  numeric?: boolean;
}

// 分页配置接口
interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
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
  /** 查询失败时的内联错误；提供 onRetry 时展示重试按钮。 */
  error?: string | null;
  onRetry?: () => void;
  pagination?: PaginationConfig;
  rowKey?: keyof T | ((record: T) => string);
  onRowClick?: (record: T) => void;
  emptyText?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  /** 当前是否处于筛选状态；为 true 时空态展示“清除筛选” */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  onSort?: (key: string, order: "asc" | "desc") => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  className?: string;
  /** 表格无障碍名称，默认“数据表格” */
  ariaLabel?: string;
  /** 固定表头：容器使用 max-height 内部滚动，避免 sticky 失效 */
  stickyHeader?: boolean;
  /** 行密度：compact 40px / default 44px 行高 */
  density?: "compact" | "default";
  /** 固定列宽布局；配合 Column.width 使用，避免宽屏下短列被拉宽 */
  tableLayout?: "auto" | "fixed";
  /** 表格最小宽度；空间不足时容器横向滚动，而不是压缩列 */
  minWidth?: string;
  /** 移动端卡片渲染；提供后 md 以下使用卡片列表，表格仅桌面显示 */
  mobileCard?: (record: T, index: number) => ReactNode;
  /** 展开行内容；返回 null 时不渲染。移动端请在 mobileCard 内自行处理 */
  expandedRow?: (record: T, index: number) => ReactNode | null;
  /** 行级属性（如拖拽排序）；className / onClick / onKeyDown 会与内置行为合并 */
  rowProps?: (record: T, index: number) => HTMLAttributes<HTMLTableRowElement> | undefined;
}

/**
 * 数据表格组件
 */
export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  error,
  onRetry,
  pagination,
  rowKey,
  onRowClick,
  emptyText = "暂无数据",
  emptyAction,
  isFiltered = false,
  onClearFilters,
  onSort,
  sortBy,
  sortOrder,
  className,
  ariaLabel = "数据表格",
  stickyHeader = false,
  density = "default",
  tableLayout = "auto",
  minWidth,
  mobileCard,
  expandedRow,
  rowProps,
}: DataTableProps<T>) {
  const cellDensityCls = density === "compact" ? "px-3 py-2.5" : "px-4 py-3";
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(
    sortBy && sortOrder ? { key: sortBy, order: sortOrder } : null
  );

  // 受控排序参数变化时同步内部状态（渲染阶段同步，避免 effect 内 setState）
  const [prevSortProps, setPrevSortProps] = useState<[typeof sortBy, typeof sortOrder] | null>(
    null
  );
  if (!prevSortProps || prevSortProps[0] !== sortBy || prevSortProps[1] !== sortOrder) {
    setPrevSortProps([sortBy, sortOrder]);
    if (sortBy && sortOrder) {
      setSortConfig({ key: sortBy, order: sortOrder });
    }
  }

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
      return <ArrowUpDown className="h-4 w-4 text-ink-muted" />;
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
  // 刷新失败但已有数据时保留表格，只在顶部展示错误条。
  const showErrorState = Boolean(error) && data.length === 0;

  return (
    <div
      aria-busy={loading}
      className={cn(
        "relative overflow-hidden rounded-card border border-line bg-white",
        className
      )}
    >
      {error && data.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-status-danger-line bg-status-danger-soft px-4 py-2 text-sm text-status-danger-strong"
        >
          <span>{error}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              重试
            </Button>
          )}
        </div>
      )}
      {mobileCard && (
        <div className="md:hidden">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-xl bg-surface-muted"
                />
              ))}
            </div>
          ) : showErrorState ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 px-4 py-12 text-center text-status-danger-fg"
            >
              <span>{error}</span>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  重试
                </Button>
              )}
            </div>
          ) : data.length === 0 ? (
            <Empty
              className="py-10"
              title={isFiltered ? "没有符合条件的数据" : emptyText}
              description={isFiltered ? "试试调整或清除筛选条件" : undefined}
              action={
                isFiltered && onClearFilters ? (
                  <Button variant="outline" size="sm" onClick={onClearFilters}>
                    清除筛选
                  </Button>
                ) : emptyAction ? (
                  <Button variant="outline" size="sm" onClick={emptyAction.onClick}>
                    {emptyAction.label}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-line">
              {data.map((record, index) => (
                <div key={getRowKey(record, index)} className="p-4">
                  {mobileCard(record, index)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "overflow-x-auto",
          stickyHeader && "max-h-[calc(100dvh-16rem)] overflow-y-auto",
          mobileCard && "hidden md:block"
        )}
      >
        <table
          className={cn(
            "w-full divide-y divide-line",
            tableLayout === "fixed" && "table-fixed"
          )}
          style={minWidth ? { minWidth } : undefined}
          aria-label={ariaLabel}
        >
          <thead
            className={cn(
              "z-10 bg-surface-subtle text-xs font-medium tracking-wide text-brand-charcoal/70",
              stickyHeader && "sticky top-0 backdrop-blur"
            )}
          >
            <tr>
              {columns.map((column) => {
                const sortState =
                  sortConfig?.key === String(column.key)
                    ? sortConfig.order === "asc"
                      ? ("ascending" as const)
                      : ("descending" as const)
                    : ("none" as const);
                const columnAlign = column.align ?? (column.numeric ? "right" : "left");
                return (
                  <th
                    key={String(column.key)}
                    scope="col"
                    style={{ width: column.width }}
                    className={cn(
                      cellDensityCls,
                      alignStyles[columnAlign],
                      column.sortable && "cursor-pointer select-none hover:bg-surface-hover"
                    )}
                    aria-sort={column.sortable ? sortState : undefined}
                    tabIndex={column.sortable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (column.sortable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleSort(column);
                      }
                    }}
                    onClick={() => handleSort(column)}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        columnAlign === "center" && "justify-center",
                        columnAlign === "right" && "justify-end"
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
          <tbody className="divide-y divide-line bg-white">
            {loading ? (
              // 加载状态
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={columns.length} density={density} />
              ))
            ) : showErrorState ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-status-danger-fg">
                  <div role="alert" className="flex flex-col items-center gap-3">
                    <span>{error}</span>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        重试
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              // 空状态
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <Empty
                    className="py-8"
                    title={isFiltered ? "没有符合条件的数据" : emptyText}
                    description={isFiltered ? "试试调整或清除筛选条件" : undefined}
                    action={
                      isFiltered && onClearFilters ? (
                        <Button variant="outline" size="sm" onClick={onClearFilters}>
                          清除筛选
                        </Button>
                      ) : emptyAction ? (
                        <Button variant="outline" size="sm" onClick={emptyAction.onClick}>
                          {emptyAction.label}
                        </Button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              // 数据行
              data.map((record, rowIndex) => {
                const {
                  className: rowClassName,
                  onClick: rowOnClick,
                  onKeyDown: rowOnKeyDown,
                  ...rowRestProps
                } = rowProps?.(record, rowIndex) ?? {};
                const rowKey = getRowKey(record, rowIndex);
                const expanded = expandedRow?.(record, rowIndex);
                return (
                  <Fragment key={rowKey}>
                    <tr
                      {...rowRestProps}
                      tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      rowOnKeyDown?.(e);
                      if (
                        !e.defaultPrevented &&
                        (e.key === "Enter" || e.key === " ") &&
                        onRowClick
                      ) {
                        e.preventDefault();
                        onRowClick(record);
                      }
                    }}
                    onClick={(e) => {
                      rowOnClick?.(e);
                      // 操作按钮/链接/表单控件不应同时触发行点击（否则会重复打开详情）
                      const target = e.target as HTMLElement | null;
                      if (target?.closest("button,a,input,select,textarea,label")) return;
                      if (!e.defaultPrevented) onRowClick?.(record);
                    }}
                    className={cn(
                      "transition-colors",
                      rowClassName,
                      onRowClick &&
                        "cursor-pointer hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    )}
                  >
                    {columns.map((column) => {
                      const value = getCellValue(record, String(column.key));
                      const columnAlign = column.align ?? (column.numeric ? "right" : "left");
                      return (
                        <td
                          key={String(column.key)}
                          className={cn(
                            "whitespace-nowrap text-sm text-brand-charcoal",
                            cellDensityCls,
                            alignStyles[columnAlign],
                            column.numeric && "tabular-nums"
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
                    {expanded && (
                      <tr className="bg-surface-subtle">
                        <td colSpan={columns.length} className="px-4 py-3">
                          {expanded}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页：即使只有一页也展示总数/每页条数（Pagination 内部按需隐藏页码） */}
      {pagination && (pagination.total > 0 || pagination.onPageSizeChange) && (
        <div className="border-t border-line px-4 py-3">
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={pagination.onChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </div>
      )}

      {/* 加载遮罩 — 仅覆盖表格内容区，不影响分页 */}
      {loading && data.length > 0 && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-white/50",
            pagination ? "bottom-[60px]" : "bottom-0"
          )}
        >
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
      )}
    </div>
  );
}
