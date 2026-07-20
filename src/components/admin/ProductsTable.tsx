"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { DataTable, Column } from "@/components/admin";
import { Badge, DotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiPost, apiPatch, apiDelete } from "@/lib/api-client";

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
  salesCount: number;
  stock: number;
  allowDirectBuy: boolean;
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
  onRefresh: () => void;
}

export function ProductsTable({
  products,
  loading = false,
  pagination,
  onPageChange,
  onRefresh,
}: ProductsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id?: string;
    name?: string;
    batch?: boolean;
  }>({ open: false });

  // 选择/取消选择
  const handleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  // 切换发布状态
  const handleTogglePublish = async (id: string, published: boolean) => {
    setActionLoading(id);
    try {
      await apiPatch(`/api/admin/products/${id}`, { published: !published });
      onRefresh();
    } catch (error) {
      console.error("操作失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // 删除产品
  const handleDelete = async () => {
    const { id, batch } = deleteConfirm;
    setActionLoading("delete");
    try {
      if (batch) {
        await apiPost("/api/admin/products/batch", { ids: selectedIds, action: "delete" });
        setSelectedIds([]);
      } else if (id) {
        await apiDelete(`/api/admin/products/${id}`);
      }
      onRefresh();
    } catch (error) {
      console.error("删除失败:", error);
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
      setSelectedIds([]);
      onRefresh();
    } catch (error) {
      console.error("批量操作失败:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // 格式化价格
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // 表格列定义
  const columns: Column<ProductItem>[] = [
    {
      key: "select",
      title: (
        <input
          type="checkbox"
          checked={selectedIds.length === products.length && products.length > 0}
          onChange={handleSelectAll}
          className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
        />
      ) as unknown as string,
      width: "50px",
      render: (_, record) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(record.id)}
          onChange={() => handleSelect(record.id)}
          className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
        />
      ),
    },
    {
      key: "image",
      title: "图片",
      width: "80px",
      render: (_, record) => (
        <div className="h-12 w-12 overflow-hidden rounded-lg bg-gray-100">
          {record.image ? (
            <Image
              src={record.image.url}
              alt={record.image.alt || record.name}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
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
          <p className="font-medium text-gray-900">{record.name}</p>
          <p className="text-xs text-gray-500">{record.nameEn}</p>
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
      render: (_, record) => <span className="font-medium">{formatPrice(record.price)}</span>,
    },
    {
      key: "salesCount",
      title: "销量",
      align: "right",
      render: (_, record) => <span className="text-sm text-gray-600">{record.salesCount}</span>,
    },
    {
      key: "stock",
      title: "库存",
      align: "right",
      render: (_, record) => (
        <span
          className={`text-sm ${record.allowDirectBuy && record.stock <= 5 ? "font-medium text-red-500" : "text-gray-600"}`}
        >
          {record.allowDirectBuy ? record.stock : "-"}
        </span>
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
          <button
            onClick={() => handleTogglePublish(record.id, record.published)}
            disabled={actionLoading === record.id}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={record.published ? "取消发布" : "发布"}
          >
            {record.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <Link
            href={`/admin/products/${record.id}/edit`}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setDeleteConfirm({ open: true, id: record.id, name: record.name })}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 批量操作栏 */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-brand-primary/5 px-4 py-3">
          <span className="text-sm text-gray-700">
            已选择 <strong>{selectedIds.length}</strong> 项
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchAction("publish")}
              loading={actionLoading === "publish"}
            >
              发布
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchAction("unpublish")}
              loading={actionLoading === "unpublish"}
            >
              取消发布
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDeleteConfirm({ open: true, batch: true })}
            >
              删除
            </Button>
          </div>
          <button
            onClick={() => setSelectedIds([])}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
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
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: onPageChange,
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
            ? `确定要删除选中的 ${selectedIds.length} 个产品吗？此操作不可恢复。`
            : `确定要删除产品"${deleteConfirm.name}"吗？此操作不可恢复。`
        }
        type="danger"
        confirmText="删除"
        loading={actionLoading === "delete"}
      />
    </div>
  );
}
