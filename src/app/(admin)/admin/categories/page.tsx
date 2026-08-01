"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Empty } from "@/components/ui/Empty";
import { cn } from "@/lib/utils";
import { apiGet, apiPut, apiDelete } from "@/lib/api-client";

// 分类类型
interface Category {
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
      const data = await apiGet<Category[]>("/api/admin/categories");
      setCategories(data);
    } catch (error) {
      console.error("获取分类失败:", error);
      showError("加载失败，请刷新重试");
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
      await apiDelete(`/api/admin/categories/${category.id}`);
      success("分类已删除");
      fetchCategories();
    } catch (err) {
      showError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteConfirm({ open: false });
    }
  };

  // 切换前台可见性
  const handleToggleVisible = async (category: Category) => {
    try {
      await apiPut(`/api/admin/categories/${category.id}`, { visible: !category.visible });

      // 更新本地状态
      setCategories((prev) =>
        prev.map((cat) => (cat.id === category.id ? { ...cat, visible: !category.visible } : cat))
      );
      success(category.visible ? "分类已隐藏" : "分类已显示");
    } catch (err) {
      showError(err instanceof Error ? err.message : "更新失败");
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
      await apiPut("/api/admin/categories/order", {
        items: updated.map((cat) => ({ id: cat.id, order: cat.order })),
      });

      success("排序已保存");
    } catch {
      showError("保存排序失败");
      fetchCategories(); // 恢复原数据
    }
  };

  // 上移/下移（移动端/键盘替代拖拽）
  const moveCategory = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const newCategories = [...categories];
    const [moved] = newCategories.splice(index, 1);
    newCategories.splice(target, 0, moved);

    const updated = newCategories.map((cat, i) => ({ ...cat, order: i }));
    setCategories(updated);

    try {
      await apiPut("/api/admin/categories/order", {
        items: updated.map((cat) => ({ id: cat.id, order: cat.order })),
      });
      success("排序已保存");
    } catch {
      showError("保存排序失败");
      fetchCategories(); // 恢复原数据
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">分类管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
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
          <Empty className="h-48" title="暂无分类" description="点击上方按钮创建第一个分类" />
        ) : (
          <div className="divide-y divide-brand-charcoal/8">
            {/* 表头 */}
            <div className="grid grid-cols-11 gap-4 px-6 py-3 text-sm font-medium text-brand-charcoal/50">
              <div className="col-span-1"></div>
              <div className="col-span-3">分类名称</div>
              <div className="col-span-2">URL 别名</div>
              <div className="col-span-1">产品数量</div>
              <div className="col-span-1">前台展示</div>
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
                  "grid grid-cols-11 gap-4 px-6 py-4 transition-colors",
                  dragOverItem === index && "bg-brand-primary/5",
                  "hover:bg-brand-charcoal/[0.03]"
                )}
              >
                {/* 拖拽手柄 + 移动端排序按钮 */}
                <div className="col-span-1 flex items-center gap-1">
                  <button
                    className="hidden cursor-grab text-brand-charcoal/50 hover:text-brand-charcoal md:block"
                    title="拖拽排序"
                  >
                    <GripVertical className="h-5 w-5" />
                  </button>
                  <div className="flex md:hidden">
                    <Tooltip content="上移" side="top">
                      <button
                        onClick={() => moveCategory(index, -1)}
                        disabled={index === 0}
                        className="rounded p-1 text-brand-charcoal/50 hover:text-brand-charcoal disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="下移" side="top">
                      <button
                        onClick={() => moveCategory(index, 1)}
                        disabled={index === categories.length - 1}
                        className="rounded p-1 text-brand-charcoal/50 hover:text-brand-charcoal disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* 名称 */}
                <div className="col-span-3 flex flex-col justify-center">
                  <span className="font-medium text-brand-charcoal">{category.name}</span>
                  <span className="text-sm text-brand-charcoal/50">{category.nameEn}</span>
                </div>

                {/* Slug */}
                <div className="col-span-2 flex items-center">
                  <code className="rounded bg-brand-charcoal/8 px-2 py-1 text-sm text-brand-charcoal/60">
                    {category.slug}
                  </code>
                </div>

                {/* 产品数量 */}
                <div className="col-span-1 flex items-center">
                  <Badge variant={category.productCount > 0 ? "secondary" : "default"}>
                    {category.productCount}
                  </Badge>
                </div>

                {/* 前台展示开关 */}
                <div className="col-span-1 flex items-center">
                  <Tooltip content={category.visible ? "点击隐藏" : "点击显示"} side="top">
                    <button
                      onClick={() => handleToggleVisible(category)}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors",
                        category.visible
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-brand-charcoal/8 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06]"
                      )}
                    >
                      {category.visible ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> 显示
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> 隐藏
                        </>
                      )}
                    </button>
                  </Tooltip>
                </div>

                {/* 操作 */}
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <Tooltip content="编辑" side="top">
                    <button
                      onClick={() => handleEdit(category)}
                      className="rounded p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <Tooltip content="删除" side="top">
                    <button
                      onClick={() => setDeleteConfirm({ open: true, category })}
                      className="rounded p-2 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
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
