"use client";

import { useEffect, useState } from "react";
import { ProductForm } from "@/components/admin/ProductForm";

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function NewProductPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCategories(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">新增产品</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}

