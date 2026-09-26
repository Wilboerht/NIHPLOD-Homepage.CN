"use client";

import { useEffect, useState } from "react";
import { ProductForm } from "@/components/admin/ProductForm";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { apiGet } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

interface Category {
  id: string;
  name: string;
  slug: string;
}

function NewProductContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();

  useEffect(() => {
    // 使用管理端接口：包含隐藏分类（公开接口仅返回 visible 分类）
    apiGet<Category[]>("/api/admin/categories")
      .then((data) => setCategories(data))
      .catch(() => showError("加载分类列表失败"))
      .finally(() => setLoading(false));
  }, [showError]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-medium text-brand-charcoal">新增产品</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}

export default function NewProductPage() {
  return (
    <RequirePermission permission="products:write">
      <NewProductContent />
    </RequirePermission>
  );
}
