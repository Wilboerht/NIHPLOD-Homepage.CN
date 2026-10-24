"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/admin/ProductForm";
import { IconButton } from "@/components/admin/IconButton";
import { PageHeader } from "@/components/admin/PageHeader";
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
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-1 sm:gap-2">
        <IconButton
          href="/admin/products"
          label="返回产品列表"
          className="-ml-2 -mt-2 shrink-0 sm:-mt-1"
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <PageHeader title="新增产品" description="创建新的产品" />
        </div>
      </div>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}

export default function NewProductPage() {
  return (
    <RequirePermission permission="products:write">
      <RequirePermission permission="categories:read">
        <NewProductContent />
      </RequirePermission>
    </RequirePermission>
  );
}
