"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Eye, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SeoEditor } from "@/components/admin/SeoEditor";
import { PAGE_META, type SeoConfig } from "@/types/page-content";

interface PageData {
  id: string;
  title: string;
  slug: string;
  seo: SeoConfig | null;
  published: boolean;
  updatedAt: string;
}

export default function PageEditPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { success, error: showError } = useToast();

  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 获取页面数据
  const fetchPage = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/pages/${slug}`);
      if (!res.ok) {
        if (res.status === 404) {
          showError("页面不存在");
          router.push("/admin/pages");
          return;
        }
        throw new Error("获取页面失败");
      }
      const data = await res.json();
      setPage(data.data);
    } catch (error) {
      console.error("获取页面失败:", error);
      showError("获取页面失败");
    } finally {
      setLoading(false);
    }
  }, [slug, router, showError]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // 保存页面
  const handleSave = async () => {
    if (!page) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seo: page.seo, // 仅保存 SEO 设置
        }),
      });

      if (!res.ok) {
        throw new Error("保存失败");
      }

      success("保存成功");
      setHasChanges(false);
    } catch (error) {
      console.error("保存失败:", error);
      showError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 切换发布状态
  const togglePublish = async () => {
    if (!page) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !page.published }),
      });

      if (!res.ok) {
        throw new Error("操作失败");
      }

      setPage((prev) => (prev ? { ...prev, published: !prev.published } : null));
      success(page.published ? "已取消发布" : "已发布");
    } catch (error) {
      console.error("操作失败:", error);
      showError("操作失败");
    } finally {
      setSaving(false);
    }
  };

  // 更新 SEO
  const updateSeo = (seo: SeoConfig) => {
    setPage((prev) => (prev ? { ...prev, seo } : null));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  if (!page) {
    return null;
  }

  const pageMeta = PAGE_META[slug] || { name: page.title, description: "" };

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/pages"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              搜索优化 - {pageMeta.name}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">/{slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={page.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            onClick={togglePublish}
            disabled={saving}
          >
            {page.published ? "取消发布" : "发布"}
          </Button>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
          >
            保存更改
          </Button>
        </div>
      </div>

      {/* 未保存提示 */}
      {hasChanges && (
        <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          您有未保存的更改
        </div>
      )}

      {/* 核心设置内容 */}
      <div className="space-y-6">
        <div className="rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <div className="flex items-center gap-2 font-medium text-gray-900">
              <Settings className="h-4 w-4 text-brand-gold" />
              SEO 搜索优化
            </div>
          </div>
          <div className="p-6">
             <SeoEditor value={page.seo || {}} onChange={updateSeo} />
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 p-8 text-center text-gray-500">
          <p className="text-sm font-medium">提示：页面具体文案已归入前端代码管理</p>
          <p className="mt-1 text-xs">如需修改页面布局或特定文案，请联系开发团队或在源代码中进行调整。</p>
        </div>
      </div>
    </div>
  );
}
