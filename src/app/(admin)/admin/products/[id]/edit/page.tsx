"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { apiGet } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";

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
  origin: string | null;
  purchaseLinks: PurchaseLinkItem[];
  description: string;
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  images: ImageItem[];
  order: number;
  featured: boolean;
  published: boolean;
  geoFaqs: { question: string; answer: string }[] | null;
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
      apiGet<ProductData>(`/api/admin/products/${id}`),
      apiGet<Category[]>("/api/categories"),
    ])
      .then(([data, categoriesData]) => {
        setCategories(categoriesData);

        // 格式化产品数据
        setProduct({
          id: data.id,
          name: data.name,
          nameEn: data.nameEn,
          slug: data.slug,
          categoryId: data.categoryId,
          price: data.price,
          capacity: data.capacity || "",
          origin: data.origin || "",
          purchaseLinks: (data.purchaseLinks || []).map(
            (link: PurchaseLinkItem, index: number) => ({
              id: link.id,
              platform: link.platform,
              url: link.url,
              order: link.order ?? index,
            })
          ),
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
          geoFaqs: data.geoFaqs ?? null,
        });
      })
      .catch((err) => {
        apiConsole.error("获取产品数据失败:", err);
        setError("获取数据失败");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-brand-charcoal/50">{error || "产品不存在"}</p>
        <button
          onClick={() => router.push("/admin/products")}
          className="text-brand-primary hover:underline"
        >
          返回产品列表
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-medium text-brand-charcoal">编辑产品</h1>
      <ProductForm mode="edit" initialData={product} categories={categories} />
    </div>
  );
}
