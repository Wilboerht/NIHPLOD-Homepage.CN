"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ImageItem {
  id: string;
  url: string;
  alt: string | null;
  order: number;
}

interface PurchaseLinkItem {
  id: string;
  platform: string;
  url: string;
  order: number;
}

interface ProductData {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  categoryId: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  purchaseLinks: PurchaseLinkItem[];
  description: string;
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  images: ImageItem[];
  order: number;
  featured: boolean;
  published: boolean;
  allowDirectBuy: boolean;
  stock: number;
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [product, setProduct] = useState<ProductData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 同时获取产品和分类
    Promise.all([
      fetch(`/api/admin/products/${id}`).then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
    ])
      .then(([productRes, categoriesRes]) => {
        if (!productRes.success) {
          setError(productRes.error?.message || "获取产品失败");
          return;
        }

        if (categoriesRes.success) {
          setCategories(categoriesRes.data);
        }

        // 格式化产品数据
        const data = productRes.data;
        setProduct({
          id: data.id,
          name: data.name,
          nameEn: data.nameEn,
          slug: data.slug,
          categoryId: data.categoryId,
          price: data.price,
          capacity: data.capacity || "",
          purchaseUrl: data.purchaseUrl || "",
          purchaseLinks: (data.purchaseLinks || []).map((link: PurchaseLinkItem, index: number) => ({
            id: link.id,
            platform: link.platform,
            url: link.url,
            order: link.order ?? index,
          })),
          description: data.description,
          ingredients: data.ingredients || "",
          usage: data.usage || "",
          benefits: data.benefits || [],
          images: data.images.map((img: ImageItem) => ({
            id: img.id,
            url: img.url,
            alt: img.alt,
            order: img.order,
          })),
          order: data.order,
          featured: data.featured,
          published: data.published,
          allowDirectBuy: data.allowDirectBuy ?? false,
          stock: data.stock ?? 0,
        });
      })
      .catch((err) => {
        console.error("获取数据失败:", err);
        setError("获取数据失败");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-gray-500">{error || "产品不存在"}</p>
        <button
          onClick={() => router.push("/admin/products")}
          className="text-brand-gold hover:underline"
        >
          返回产品列表
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">编辑产品</h1>
      <ProductForm mode="edit" initialData={product} categories={categories} />
    </div>
  );
}

