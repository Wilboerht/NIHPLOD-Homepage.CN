"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { IconButton } from "@/components/admin/IconButton";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiGet } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";
import { isPurchasePlatformKey } from "@/lib/purchase-platforms";
import { parseGeoFaqs } from "@/lib/product-faqs";
import type { PurchaseLinkItem } from "@/lib/purchase-link-form";
import type { GeoFaq } from "@/schemas/product";

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
  published: boolean;
  geoFaqs: GeoFaq[] | null;
}

function EditProductContent() {
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
      // 使用管理端接口：包含隐藏分类（公开接口仅返回 visible 分类）
      apiGet<Category[]>("/api/admin/categories"),
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
              platformKey: isPurchasePlatformKey(link.platformKey) ? link.platformKey : null,
              url: link.url,
              miniProgramShortLink: link.miniProgramShortLink ?? "",
              miniProgramPath: link.miniProgramPath ?? "",
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
          published: data.published,
          geoFaqs: parseGeoFaqs(data.geoFaqs),
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
        <p className="text-brand-charcoal/65">{error || "产品不存在"}</p>
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
          <PageHeader
            title="编辑产品"
            description={product.name}
            accessory={
              <Badge variant={product.published ? "success" : "secondary"}>
                {product.published ? "已发布" : "草稿"}
              </Badge>
            }
            actions={
              product.published ? (
                <Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ExternalLink className="h-4 w-4" />}
                  >
                    查看前台
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      </div>
      <ProductForm mode="edit" initialData={product} categories={categories} />
    </div>
  );
}

export default function EditProductPage() {
  return (
    <RequirePermission permission="products:write">
      <RequirePermission permission="products:read">
        <RequirePermission permission="categories:read">
          <EditProductContent />
        </RequirePermission>
      </RequirePermission>
    </RequirePermission>
  );
}
