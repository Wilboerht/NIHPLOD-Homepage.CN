"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { DataTable, Column } from "@/components/admin";
import { Badge, DotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { useRowSelection } from "@/hooks/useRowSelection";
import { formatPrice } from "@/lib/utils";

// 产品类型
interface ProductItem {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  image: {
    id: string;
    url: string;
    alt: string | null;
  } | null;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductsTableProps {
  products: ProductItem[];
  loading?: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  onSort?: (key: string, order: "asc" | "desc") => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** 是否可删除单个产品（需 products:delete） */
  canDelete?: boolean;
  /** 是否可批量删除（需 products:batch-delete） */
  canBatchDelete?: boolean;
  /** 是否可发布/编辑（需 products:write） */
  canWrite?: boolean;
}

export function ProductsTable({
  products,
  loading = false,
  pagination,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onSort,
  sortBy,
  sortOrder,
  canDelete = false,
  canBatchDelete = false,
  canWrite = false,
}: ProductsTableProps) {
  // 勾选状态：当前页数据内容变化（翻页/筛选/刷新）时自动清空
  const selection = useRowSelection<ProductItem>(
    (p) => p.id,
    `${pagination.page}|${pagination.pageSize}|${products.map((p) => p.id).join(",")}`
  );
  const selectedIds = useMemo(() => Array.from(selection.selectedIds), [selection.selectedIds]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { error: showError } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id?: string;
    name?: string;
    batch?: boolean;
  }>({ open: false });

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    selection.toggleAll(products, !selection.isAllSelected(products));
  }, [products, selection]);

  // 切换发布状态
  const handleTogglePublish = useCallback(
    async (id: string, published: boolean) => {
      setActionLoading(id);
      try {
        await apiPatch(`/api/admin/products/${id}`, { published: !published });
        onRefresh();
      } catch {
        showError("操作失败，请重试");
      } finally {
        setActionLoading(null);
      }
    },
    [onRefresh, showError]
  );

  // 删除产品
  const handleDelete = async () => {
    const { id, batch } = deleteConfirm;
    setActionLoading("delete");
    try {
      if (batch) {
        await apiPost("/api/admin/products/batch", { ids: selectedIds, action: "delete" });
        selection.clear();
      } else if (id) {
        await apiDelete(`/api/admin/products/${id}`);
      }
      // 删光当前页所有数据（单删最后一条或批量选中全页）时回退一页
      const deletesWholePage = batch
        ? products.length > 0 && products.every((p) => selection.selectedIds.has(p.id))
        : products.length === 1;
      if (deletesWholePage && pagination.page > 1) {
        onPageChange(pagination.page - 1);
      } else {
        onRefresh();
      }
    } catch {
      showError("删除失败，请重试");
    } finally {
      setActionLoading(null);
      setDeleteConfirm({ open: false });
    }
  };

  // 批量操作
  const handleBatchAction = async (action: "publish" | "unpublish") => {
    setActionLoading(action);
    try {
      await apiPost("/api/admin/products/batch", { ids: selectedIds, action });
      selection.clear();
      onRefresh();
    } catch {
      showError("批量操作失败，请重试");
    } finally {
      setActionLoading(null);
    }
  };

  // 表格列定义（无任何写/删权限时不展示勾选列）
  const canSelect = canWrite || canDelete || canBatchDelete;
  const columns: Column<ProductItem>[] = useMemo(() => {
    const selectColumn: Column<ProductItem> = {
      key: "select",
      title: (
        <input
          type="checkbox"
          checked={selection.isAllSelected(products)}
          ref={(el) => {
            if (el) el.indeterminate = selection.isIndeterminate(products);
          }}
          onChange={handleSelectAll}
          aria-label="全选本页产品"
          className="h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary"
        />
      ),
      width: "50px",
      render: (_, record) => (
        <input
          type="checkbox"
          checked={selection.isSelected(record)}
          onChange={() => selection.toggle(record)}
          aria-label={`选择 ${record.name}`}
          className="h-4 w-4 rounded border-brand-charcoal/20 text-brand-primary focus:ring-brand-primary"
        />
      ),
    };
    return [
      ...(canSelect ? [selectColumn] : []),
      {
        key: "image",
        title: "图片",
        width: "80px",
        render: (_, record) => (
          <div className="bg-brand-charcoal/8 h-12 w-12 overflow-hidden rounded-lg">
            {record.image ? (
              <Image
                src={record.image.url}
                alt={record.image.alt || record.name}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-brand-charcoal/50">
                无图
              </div>
            )}
          </div>
        ),
      },
      {
        key: "name",
        title: "产品名称",
        render: (_, record) => (
          <div>
            <p className="font-medium text-brand-charcoal">{record.name}</p>
            <p className="text-xs text-brand-charcoal/50">{record.nameEn}</p>
          </div>
        ),
      },
      {
        key: "category.name",
        title: "分类",
        render: (_, record) => <Badge variant="secondary">{record.category.name}</Badge>,
      },
      {
        key: "price",
        title: "价格",
        align: "right",
        sortable: true,
        render: (_, record) => <span className="font-medium">{formatPrice(record.price)}</span>,
      },
      {
        key: "order",
        title: "排序",
        align: "right",
        width: "70px",
        render: (_, record) => (
          <span className="text-sm text-brand-charcoal/40">{record.order}</span>
        ),
      },
      {
        key: "published",
        title: "状态",
        render: (_, record) => (
          <DotBadge color={record.published ? "green" : "gray"}>
            {record.published ? "已发布" : "草稿"}
          </DotBadge>
        ),
      },
      {
        key: "actions",
        title: "操作",
        width: "120px",
        align: "right",
        render: (_, record) => (
          <div className="flex items-center justify-end gap-1">
            {canWrite && (
              <Tooltip content={record.published ? "取消发布" : "发布"} side="top">
                <button
                  onClick={() => handleTogglePublish(record.id, record.published)}
                  disabled={actionLoading !== null}
                  aria-label={record.published ? `取消发布 ${record.name}` : `发布 ${record.name}`}
                  className="rounded p-1.5 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal disabled:opacity-40"
                >
                  {record.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </Tooltip>
            )}
            {canWrite && (
              <Tooltip content="编辑" side="top">
                <Link
                  href={`/admin/products/${record.id}/edit`}
                  aria-label={`编辑 ${record.name}`}
                  className="rounded p-1.5 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip content="删除" side="top">
                <button
                  onClick={() => setDeleteConfirm({ open: true, id: record.id, name: record.name })}
                  disabled={actionLoading !== null}
                  aria-label={`删除 ${record.name}`}
                  className="rounded p-1.5 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>
        ),
      },
    ];
  }, [
    products,
    actionLoading,
    handleSelectAll,
    selection,
    canSelect,
    canDelete,
    canWrite,
    handleTogglePublish,
  ]);

  return (
    <div className="space-y-4">
      {/* 批量操作栏 */}
      {selection.selectedCount > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-brand-primary/5 px-4 py-3">
          <span className="text-sm text-brand-charcoal/80">
            已选择 <strong>{selection.selectedCount}</strong> 项
          </span>
          <div className="flex gap-2">
            {canWrite && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("publish")}
                  loading={actionLoading === "publish"}
                  disabled={actionLoading !== null && actionLoading !== "publish"}
                >
                  发布
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction("unpublish")}
                  loading={actionLoading === "unpublish"}
                  disabled={actionLoading !== null && actionLoading !== "unpublish"}
                >
                  取消发布
                </Button>
              </>
            )}
            {canBatchDelete && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setDeleteConfirm({ open: true, batch: true })}
                disabled={actionLoading !== null}
              >
                删除
              </Button>
            )}
          </div>
          <button
            onClick={selection.clear}
            className="ml-auto text-sm text-brand-charcoal/50 hover:text-brand-charcoal/80"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 数据表格 */}
      <DataTable
        columns={columns}
        data={products}
        loading={loading}
        rowKey="id"
        emptyText="暂无产品数据"
        onSort={onSort}
        sortBy={sortBy}
        sortOrder={sortOrder}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: onPageChange,
          onPageSizeChange,
        }}
      />

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={handleDelete}
        title={deleteConfirm.batch ? "批量删除产品" : "删除产品"}
        description={
          deleteConfirm.batch
            ? `确定要删除选中的 ${selection.selectedCount} 个产品吗？此操作不可恢复。`
            : `确定要删除产品"${deleteConfirm.name}"吗？此操作不可恢复。`
        }
        type="danger"
        confirmText="删除"
        loading={actionLoading === "delete"}
      />
    </div>
  );
}
