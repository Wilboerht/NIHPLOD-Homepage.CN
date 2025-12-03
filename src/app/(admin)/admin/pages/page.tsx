"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FileText, ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DotBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PAGE_META } from "@/types/page-content";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  updatedAt: string;
  meta: { name: string; description: string };
}

export default function AdminPagesPage() {
  const { success, error: showError } = useToast();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  // 获取页面列表
  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pages");
      const data = await res.json();
      if (data.success) {
        setPages(data.data);
      }
    } catch (error) {
      console.error("获取页面列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // 切换发布状态
  const togglePublish = async (slug: string, published: boolean) => {
    setToggling(slug);
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });

      if (!res.ok) {
        throw new Error("操作失败");
      }

      success(published ? "已取消发布" : "已发布");
      fetchPages();
    } catch {
      showError("操作失败");
    } finally {
      setToggling(null);
    }
  };

  // 初始化缺失页面
  const initMissingPages = async () => {
    const existingSlugs = pages.map((p) => p.slug);
    const missingSlugs = Object.keys(PAGE_META).filter(
      (slug) => !existingSlugs.includes(slug)
    );

    if (missingSlugs.length === 0) {
      success("所有页面已存在");
      return;
    }

    setLoading(true);
    try {
      for (const slug of missingSlugs) {
        const meta = PAGE_META[slug];
        await fetch("/api/admin/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, title: meta.name }),
        });
      }
      success(`已创建 ${missingSlugs.length} 个页面`);
      fetchPages();
    } catch {
      showError("创建页面失败");
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">页面管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            编辑网站各页面内容，共 {pages.length} 个页面
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={initMissingPages}
        >
          初始化页面
        </Button>
      </div>

      {/* 页面列表 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <div
            key={page.id}
            className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-gold/10 p-2">
                  <FileText className="h-5 w-5 text-brand-gold" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{page.meta.name}</h3>
                  <p className="text-xs text-gray-500">/{page.slug}</p>
                </div>
              </div>
              <DotBadge color={page.published ? "green" : "gray"}>
                {page.published ? "已发布" : "草稿"}
              </DotBadge>
            </div>

            <p className="mb-4 text-sm text-gray-600">{page.meta.description}</p>

            <div className="mb-4 text-xs text-gray-400">
              更新于 {formatDate(page.updatedAt)}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <Link
                href={`/admin/pages/${page.slug}`}
                className="text-sm font-medium text-brand-gold hover:text-brand-gold/80"
              >
                编辑内容
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePublish(page.slug, page.published)}
                  disabled={toggling === page.slug}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={page.published ? "取消发布" : "发布"}
                >
                  {toggling === page.slug ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : page.published ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={`/${page.slug === "home" ? "" : page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="预览页面"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pages.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl bg-white text-gray-400">
          <FileText className="mb-2 h-12 w-12" />
          <p className="text-lg">暂无页面</p>
          <p className="mt-1 text-sm">点击上方按钮初始化页面</p>
        </div>
      )}
    </div>
  );
}
