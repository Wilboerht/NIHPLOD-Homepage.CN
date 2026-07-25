"use client";

import { useEffect, useState } from "react";
import { ProductForm } from "@/components/admin/ProductForm";
import { apiGet } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function NewProductPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();

  useEffect(() => {
    apiGet<Category[]>("/api/categories")
      .then((data) => setCategories(data))
      .catch(() => showError("加载分类列表失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-charcoal">新增产品</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}
