"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, GripVertical, Pencil, Trash2 } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { IconButton } from "./IconButton";
import { Badge, DotBadge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

// 分类类型
export interface CategoryItem {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
  order: number;
  visible: boolean;
  productCount: number;
  createdAt: string;
}

interface CategoriesTableProps {
  categories: CategoryItem[];
  loading?: boolean;
  /** 是否可编辑/排序（需 categories:write） */
  canWrite?: boolean;
  /** 是否可删除（需 categories:delete） */
  canDelete?: boolean;
  /** 可见性切换中的行 id */
  togglingId?: string | null;
  /** 排序保存中：禁止再次拖拽/移动 */
  savingOrder?: boolean;
  onEdit: (category: CategoryItem) => void;
  onDelete: (category: CategoryItem) => void;
  onToggleVisible: (category: CategoryItem) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onCreate?: () => void;
}

function VisibilityToggle({
  category,
  disabled,
  onToggle,
}: {
  category: CategoryItem;
  disabled?: boolean;
  onToggle: (category: CategoryItem) => void;
}) {
  return (
    <Tooltip content={category.visible ? "点击隐藏" : "点击显示"} side="top">
      <button
        type="button"
        onClick={() => onToggle(category)}
        disabled={disabled}
        aria-label={`${category.visible ? "隐藏" : "显示"}分类 ${category.name}`}
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-1 transition-colors disabled:opacity-50",
          category.visible ? "hover:bg-emerald-50" : "hover:bg-brand-charcoal/[0.06]"
        )}
      >
        <DotBadge color={category.visible ? "green" : "gray"}>
          {category.visible ? "显示" : "隐藏"}
        </DotBadge>
      </button>
    </Tooltip>
  );
}

export function CategoriesTable({
  categories,
  loading = false,
  canWrite = false,
  canDelete = false,
  togglingId = null,
  savingOrder = false,
  onEdit,
  onDelete,
  onToggleVisible,
  onMove,
  onReorder,
  onCreate,
}: CategoriesTableProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const columns: Column<CategoryItem>[] = useMemo(
    () => [
      {
        key: "drag",
        title: <span className="sr-only">排序</span>,
        width: "48px",
        align: "center",
        render: () =>
          canWrite ? (
            <span
              className={cn(
                "inline-flex items-center justify-center text-brand-charcoal/65",
                savingOrder ? "cursor-not-allowed opacity-40" : "cursor-grab"
              )}
              title="拖拽排序"
              aria-hidden="true"
            >
              <GripVertical className="h-5 w-5" />
            </span>
          ) : null,
      },
      {
        key: "name",
        title: "分类名称",
        width: "280px",
        render: (_, record) => (
          <div className="min-w-0">
            <Link
              href={`/admin/products?categoryId=${record.id}`}
              className="group inline-flex max-w-full items-center gap-1.5 font-medium text-brand-charcoal transition-colors hover:text-brand-primary"
              title="查看该分类下的产品"
            >
              <span className="truncate">{record.name}</span>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-brand-charcoal/65 transition-colors group-hover:text-brand-primary" />
            </Link>
            <p className="truncate text-xs text-brand-charcoal/65" title={record.nameEn}>
              {record.nameEn}
            </p>
          </div>
        ),
      },
      {
        key: "slug",
        title: "URL 别名",
        width: "200px",
        render: (_, record) => (
          <code
            className="bg-brand-charcoal/8 inline-block max-w-full truncate rounded px-2 py-1 align-middle text-xs text-brand-charcoal/70"
            title={record.slug}
          >
            {record.slug}
          </code>
        ),
      },
      {
        key: "productCount",
        title: "产品数量",
        width: "112px",
        align: "center",
        render: (_, record) => (
          <Badge variant={record.productCount > 0 ? "secondary" : "default"}>
            {record.productCount}
          </Badge>
        ),
      },
      {
        key: "visible",
        title: "前台展示",
        width: "112px",
        align: "center",
        render: (_, record) => (
          <VisibilityToggle
            category={record}
            disabled={!canWrite || togglingId === record.id}
            onToggle={onToggleVisible}
          />
        ),
      },
      {
        key: "order",
        title: "排序",
        width: "60px",
        align: "right",
        render: (_, record) => (
          <span className="text-sm text-brand-charcoal/65">{record.order}</span>
        ),
      },
      {
        key: "actions",
        title: "操作",
        width: "112px",
        align: "right",
        render: (_, record) => (
          <div className="flex items-center justify-end gap-1">
            {canWrite && (
              <Tooltip content="编辑" side="top">
                <IconButton label={`编辑 ${record.name}`} onClick={() => onEdit(record)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip content="删除" side="top">
                <IconButton
                  label={`删除 ${record.name}`}
                  variant="danger"
                  onClick={() => onDelete(record)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    [canWrite, canDelete, togglingId, savingOrder, onEdit, onDelete, onToggleVisible]
  );

  return (
    <DataTable
      columns={columns}
      data={categories}
      loading={loading}
      rowKey="id"
      tableLayout="fixed"
      minWidth="940px"
      emptyText="暂无分类"
      emptyAction={canWrite && onCreate ? { label: "新增分类", onClick: onCreate } : undefined}
      rowProps={(_, index) => ({
        draggable: canWrite && !savingOrder,
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(index));
          setDragIndex(index);
        },
        onDragOver: (event) => {
          if (!canWrite || savingOrder) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOverIndex(index);
        },
        onDragEnd: () => {
          if (
            !savingOrder &&
            dragIndex !== null &&
            dragOverIndex !== null &&
            dragIndex !== dragOverIndex
          ) {
            onReorder(dragIndex, dragOverIndex);
          }
          setDragIndex(null);
          setDragOverIndex(null);
        },
        className: cn(
          dragIndex === index && "opacity-60",
          dragOverIndex === index &&
            dragIndex !== index &&
            "ring-1 ring-inset ring-brand-primary/30"
        ),
      })}
      mobileCard={(record, index) => (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/products?categoryId=${record.id}`}
                className="group inline-flex max-w-full items-center gap-1.5 font-medium text-brand-charcoal transition-colors hover:text-brand-primary"
                title="查看该分类下的产品"
              >
                <span className="truncate">{record.name}</span>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-brand-charcoal/65 transition-colors group-hover:text-brand-primary" />
              </Link>
              <p className="truncate text-xs text-brand-charcoal/65">{record.nameEn}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={record.productCount > 0 ? "secondary" : "default"}>
                  {record.productCount} 个产品
                </Badge>
                <VisibilityToggle
                  category={record}
                  disabled={!canWrite || togglingId === record.id}
                  onToggle={onToggleVisible}
                />
                <code className="bg-brand-charcoal/8 rounded px-2 py-0.5 text-xs text-brand-charcoal/70">
                  {record.slug}
                </code>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
            <span className="text-xs text-brand-charcoal/65">排序 {record.order}</span>
            <div className="flex items-center justify-end gap-1">
              {canWrite && (
                <>
                  <Tooltip content="上移" side="top">
                    <IconButton
                      label={`上移 ${record.name}`}
                      onClick={() => onMove(index, -1)}
                      disabled={index === 0 || savingOrder}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="下移" side="top">
                    <IconButton
                      label={`下移 ${record.name}`}
                      onClick={() => onMove(index, 1)}
                      disabled={index === categories.length - 1 || savingOrder}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {canWrite && (
                <Tooltip content="编辑" side="top">
                  <IconButton label={`编辑 ${record.name}`} onClick={() => onEdit(record)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip content="删除" side="top">
                  <IconButton
                    label={`删除 ${record.name}`}
                    variant="danger"
                    onClick={() => onDelete(record)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      )}
    />
  );
}
