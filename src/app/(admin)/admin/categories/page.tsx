"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

// 分类类型
interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
  order: number;
  productCount: number;
  createdAt: string;
}

export default function AdminCategoriesPage() {
  const { success, error: showError } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    category?: Category;
  }>({ open: false });
  const [deleting, setDeleting] = useState(false);

  // 拖拽状态
  const [dragItem, setDragItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);

  // 获取分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      console.error("获取分类失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingCategory(null);
    setFormOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormOpen(true);
  };

  // 删除分类
  const handleDelete = async () => {
    const { category } = deleteConfirm;
    if (!category) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "删除失败");
      }

      success("分类已删除");
      fetchCategories();
    } catch (err) {
      showError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteConfirm({ open: false });
    }
  };

  // 拖拽开始
  const handleDragStart = (index: number) => {
    setDragItem(index);
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverItem(index);
  };

  // 拖拽结束
  const handleDragEnd = async () => {
    if (dragItem === null || dragOverItem === null || dragItem === dragOverItem) {
      setDragItem(null);
      setDragOverItem(null);
      return;
    }

    // 重新排序
    const newCategories = [...categories];
    const draggedItem = newCategories[dragItem];
    newCategories.splice(dragItem, 1);
    newCategories.splice(dragOverItem, 0, draggedItem);

    // 更新本地状态
    const updated = newCategories.map((cat, i) => ({ ...cat, order: i }));
    setCategories(updated);
    setDragItem(null);
    setDragOverItem(null);

    // 保存到服务器
    try {
      const res = await fetch("/api/admin/categories/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: updated.map((cat) => ({ id: cat.id, order: cat.order })),
        }),
      });

      if (!res.ok) {
        throw new Error("保存排序失败");
      }

      success("排序已保存");
    } catch {
      showError("保存排序失败");
      fetchCategories(); // 恢复原数据
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">分类管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理产品分类，拖拽调整排序，共 {categories.length} 个分类
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleAdd}>
          新增分类
        </Button>
      </div>

      {/* 分类列表 */}
      <div className="rounded-xl bg-white shadow-sm">
        {categories.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-gray-400">
            <p className="text-lg">暂无分类</p>
            <p className="mt-1 text-sm">点击上方按钮创建第一个分类</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-gray-500">
              <div className="col-span-1"></div>
              <div className="col-span-1">图标</div>
              <div className="col-span-3">分类名称</div>
              <div className="col-span-2">URL 别名</div>
              <div className="col-span-2">产品数量</div>
              <div className="col-span-3 text-right">操作</div>
            </div>

            {/* 列表项 */}
            {categories.map((category, index) => (
              <div
                key={category.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "grid grid-cols-12 gap-4 px-6 py-4 transition-colors",
                  dragOverItem === index && "bg-brand-gold/5",
                  "hover:bg-gray-50"
                )}
              >
                {/* 拖拽手柄 */}
                <div className="col-span-1 flex items-center">
                  <button className="cursor-grab text-gray-400 hover:text-gray-600">
                    <GripVertical className="h-5 w-5" />
                  </button>
                </div>

                {/* 图标 */}
                <div className="col-span-1 flex items-center">
                  {category.icon ? (
                    <div
                      className="h-8 w-8 text-brand-gold"
                      dangerouslySetInnerHTML={{ __html: category.icon }}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                      无
                    </div>
                  )}
                </div>

                {/* 名称 */}
                <div className="col-span-3 flex flex-col justify-center">
                  <span className="font-medium text-gray-900">{category.name}</span>
                  <span className="text-sm text-gray-500">{category.nameEn}</span>
                </div>

                {/* Slug */}
                <div className="col-span-2 flex items-center">
                  <code className="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600">
                    {category.slug}
                  </code>
                </div>

                {/* 产品数量 */}
                <div className="col-span-2 flex items-center">
                  <Badge variant={category.productCount > 0 ? "secondary" : "default"}>
                    {category.productCount} 个产品
                  </Badge>
                </div>

                {/* 操作 */}
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, category })}
                    className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分类表单弹窗 */}
      <CategoryForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={fetchCategories}
        category={editingCategory}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={handleDelete}
        title="删除分类"
        description={
          deleteConfirm.category?.productCount
            ? `该分类下有 ${deleteConfirm.category.productCount} 个产品，无法删除。请先将产品移至其他分类。`
            : `确定要删除分类"${deleteConfirm.category?.name}"吗？此操作不可恢复。`
        }
        type="danger"
        confirmText="删除"
        loading={deleting}
        confirmDisabled={!!deleteConfirm.category?.productCount}
      />
    </div>
  );
}
