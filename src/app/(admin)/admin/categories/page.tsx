"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { CategoriesTable, type CategoryItem } from "@/components/admin/CategoriesTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { RequirePermission } from "@/components/admin/RequirePermission";

function AdminCategoriesContent() {
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("categories:write");
  const canDelete = canAdmin("categories:delete");

  /** 分类编辑：服务端要求 step-up，首次调用失败时拉起二次验证并重试 */
  const withStepUp = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
      if (!verified) return null;
      return await action();
    }
  };

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    category?: CategoryItem;
  }>({ open: false });
  const [deleting, setDeleting] = useState(false);

  // 排序请求串行化：进行中禁止再次拖拽/移动，避免中间态覆盖
  const [savingOrder, setSavingOrder] = useState(false);
  // 可见性切换中的行 id
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 获取分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiGet<CategoryItem[]>("/api/admin/categories");
      setCategories(data);
    } catch (error) {
      apiConsole.error("获取分类失败:", error);
      showError("加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchCategories);
  }, [fetchCategories]);

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingCategory(null);
    setFormOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (category: CategoryItem) => {
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
      setDeleteConfirm({ open: false });
      fetchCategories();
    } catch (err) {
      showError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 切换前台可见性（带行级 pending，防重复点击）
  const handleToggleVisible = async (category: CategoryItem) => {
    if (togglingId) return;
    setTogglingId(category.id);
    const nextVisible = !category.visible;
    try {
      const result = await withStepUp(() =>
        apiPut(`/api/admin/categories/${category.id}`, { visible: nextVisible })
      );
      if (result === null) return;

      // 更新本地状态
      setCategories((prev) =>
        prev.map((cat) => (cat.id === category.id ? { ...cat, visible: nextVisible } : cat))
      );
      success(nextVisible ? "分类已显示" : "分类已隐藏");
    } catch (err) {
      showError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setTogglingId(null);
    }
  };

  // 保存排序（本地先行更新，失败恢复）
  const saveOrder = async (updated: CategoryItem[]) => {
    setCategories(updated);
    setSavingOrder(true);
    try {
      await apiPut("/api/admin/categories/order", {
        items: updated.map((cat) => ({ id: cat.id, order: cat.order })),
      });
      success("排序已保存");
    } catch {
      showError("保存排序失败");
      fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  };

  // 拖拽排序
  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (savingOrder || !canWrite || fromIndex === toIndex) return;

    const newCategories = [...categories];
    const [draggedItem] = newCategories.splice(fromIndex, 1);
    newCategories.splice(toIndex, 0, draggedItem);
    const updated = newCategories.map((cat, i) => ({ ...cat, order: i }));
    void saveOrder(updated);
  };

  // 上移/下移（移动端/键盘替代拖拽）
  const moveCategory = (index: number, direction: -1 | 1) => {
    if (savingOrder || !canWrite) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const newCategories = [...categories];
    const [moved] = newCategories.splice(index, 1);
    newCategories.splice(target, 0, moved);
    const updated = newCategories.map((cat, i) => ({ ...cat, order: i }));
    void saveOrder(updated);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 页面头部 */}
      <PageHeader
        title="分类管理"
        description={`管理产品分类，拖拽调整排序，共 ${categories.length} 个分类`}
        actions={
          canWrite ? (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={handleAdd}
            >
              新增分类
            </Button>
          ) : undefined
        }
      />

      {/* 分类列表 */}
      <CategoriesTable
        categories={categories}
        loading={loading}
        canWrite={canWrite}
        canDelete={canDelete}
        togglingId={togglingId}
        savingOrder={savingOrder}
        onEdit={handleEdit}
        onDelete={(category) => setDeleteConfirm({ open: true, category })}
        onToggleVisible={handleToggleVisible}
        onMove={moveCategory}
        onReorder={handleReorder}
        onCreate={handleAdd}
      />

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

      {totpModal}
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <RequirePermission permission="categories:read">
      <AdminCategoriesContent />
    </RequirePermission>
  );
}
