"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { ProductsTable } from "@/components/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

// 产品类型
interface ProductItem {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: { id: string; name: string; slug: string };
  image: { id: string; url: string; alt: string | null } | null;
  featured: boolean;
  published: boolean;
  salesCount: number;
  stock: number;
  allowDirectBuy: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function AdminProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: showError } = useToast();

  // 状态
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  // 从 URL 获取筛选参数
  const page = parseInt(searchParams.get("page") || "1");
  const categoryId = searchParams.get("categoryId") || "";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  // 搜索输入框状态
  const [searchInput, setSearchInput] = useState(search);

  // 获取分类列表
  useEffect(() => {
    apiGet<Category[]>("/api/categories")
      .then((data) => setCategories(data))
      .catch(() => showError("加载分类列表失败"));
  }, []);

  // 获取产品列表
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "10");
      if (categoryId) params.set("categoryId", categoryId);
      if (status && status !== "all") params.set("status", status);
      if (search) params.set("search", search);

      const data = await apiGet<{ products: ProductItem[]; pagination: typeof pagination }>(
        "/api/admin/products",
        {
          page,
          pageSize: 10,
          categoryId,
          status: status === "all" ? undefined : status,
          search,
          sortBy: sortBy || undefined,
          sortOrder: sortOrder || undefined,
        }
      );
      setLoadError("");
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (error) {
      console.error("获取产品列表失败:", error);
      setLoadError("列表加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [page, categoryId, status, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // 更新 URL 参数
  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // 更改筛选条件时重置页码
    if (!("page" in updates)) {
      params.delete("page");
    }

    router.push(`/admin/products?${params.toString()}`);
  };

  // 处理搜索
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput });
  };

  // 清除搜索
  const clearSearch = () => {
    setSearchInput("");
    updateParams({ search: null });
  };

  // 状态筛选选项
  const statusOptions: SelectOption[] = [
    { value: "all", label: "全部状态" },
    { value: "published", label: "已发布" },
    { value: "draft", label: "草稿" },
  ];

  // 分类筛选选项
  const categoryOptions: SelectOption[] = [
    { value: "", label: "全部分类" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">产品管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理所有产品，共 {pagination.total} 个</p>
        </div>
        <Link href="/admin/products/new">
          <Button leftIcon={<Plus className="h-4 w-4" />}>新增产品</Button>
        </Link>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4">
        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="relative min-w-[200px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索产品名称..."
            className="pl-10 pr-10"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-charcoal/50 hover:text-brand-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* 分类筛选 */}
        <div className="w-40">
          <Select
            options={categoryOptions}
            value={categoryId}
            onChange={(e) => updateParams({ categoryId: e.target.value })}
          />
        </div>

        {/* 状态筛选 */}
        <div className="w-32">
          <Select
            options={statusOptions}
            value={status}
            onChange={(e) => updateParams({ status: e.target.value })}
          />
        </div>
      </div>

      {/* 加载失败错误态 */}
      {loadError && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-red-500 text-sm">{loadError}</p>
          <button onClick={fetchProducts} className="px-4 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
            重试
          </button>
        </div>
      )}

      {/* 产品表格 */}
      <ProductsTable
        products={products}
        loading={loading}
        pagination={pagination}
        onPageChange={(p) => updateParams({ page: String(p) })}
        onRefresh={fetchProducts}
        onSort={(key, order) =>
          updateParams({ sortBy: key, sortOrder: order })
        }
      />
    </div>
  );
}
