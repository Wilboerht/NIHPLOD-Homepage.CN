"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { ProductsTable, RequirePermission } from "@/components/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { apiGet, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";

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

  // 从 URL 获取筛选参数（非法值回退默认，避免 NaN 传给 API）
  const pageParam = Number(searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const pageSizeParam = Number(searchParams.get("pageSize"));
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam >= 1 ? Math.floor(pageSizeParam) : 10;
  const categoryId = searchParams.get("categoryId") || "";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  // 搜索输入框状态
  const [searchInput, setSearchInput] = useState(search);

  // 权限：逐项删除/批量删除/编辑发布分别对应不同权限点（与 API 层一致）
  const { can: canAdmin } = useAdminPermissions();
  const canBatchDelete = canAdmin("products:batch-delete");
  const canDelete = canAdmin("products:delete");
  const canWriteProducts = canAdmin("products:write");

  // 获取分类列表（管理端接口：包含隐藏分类，公开接口仅返回 visible 分类）
  useEffect(() => {
    apiGet<Category[]>("/api/admin/categories")
      .then((data) => setCategories(data))
      .catch(() => showError("加载分类列表失败"));
  }, [showError]);

  // 获取产品列表
  const takeLatestProducts = useLatestRequest();
  const fetchProducts = useCallback(async () => {
    const isLatest = takeLatestProducts();
    setLoading(true);
    try {
      const data = await apiGet<{ products: ProductItem[]; pagination: typeof pagination }>(
        "/api/admin/products",
        {
          page,
          pageSize,
          categoryId,
          status: status === "all" ? undefined : status,
          search,
          sortBy: sortBy || undefined,
          sortOrder: sortOrder || undefined,
        }
      );
      if (!isLatest()) return;
      setLoadError("");
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (error) {
      if (!isLatest()) return;
      if (error instanceof ApiError && error.status === 401) {
        router.push("/admin-login");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "列表加载失败，请重试");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, categoryId, status, search, sortBy, sortOrder, router, takeLatestProducts]);

  useEffect(() => {
    deferInEffect(fetchProducts);
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
    <RequirePermission permission="products:read">
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">产品管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            管理所有产品，共 {pagination.total} 个
          </p>
        </div>
        {canWriteProducts && (
          <Link href="/admin/products/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>新增产品</Button>
          </Link>
        )}
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
              aria-label="清除搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* 分类筛选 */}
        <div className="w-40">
          <Select
            aria-label="按分类筛选"
            options={categoryOptions}
            value={categoryId}
            onChange={(e) => updateParams({ categoryId: e.target.value })}
          />
        </div>

        {/* 状态筛选 */}
        <div className="w-32">
          <Select
            aria-label="按状态筛选"
            options={statusOptions}
            value={status}
            onChange={(e) => updateParams({ status: e.target.value })}
          />
        </div>
      </div>

      {/* 加载失败错误态（替代表格，避免错误与旧数据同时展示） */}
      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-red-500">{loadError}</p>
          <Button variant="outline" size="sm" onClick={fetchProducts}>
            重试
          </Button>
        </div>
      ) : (
        <ProductsTable
          products={products}
          loading={loading}
          pagination={pagination}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onPageSizeChange={(size) => updateParams({ pageSize: String(size), page: "1" })}
          onRefresh={fetchProducts}
          onSort={(key, order) => updateParams({ sortBy: key, sortOrder: order })}
          sortBy={sortBy || undefined}
          sortOrder={sortOrder as "asc" | "desc" | undefined}
          canDelete={canDelete}
          canBatchDelete={canBatchDelete}
          canWrite={canWriteProducts}
        />
      )}
    </div>
    </RequirePermission>
  );
}
