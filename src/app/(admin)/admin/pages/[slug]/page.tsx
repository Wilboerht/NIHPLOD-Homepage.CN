"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Save, Eye, EyeOff, Settings, FileText, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SeoEditor } from "@/components/admin/SeoEditor";
import { BackgroundImagePicker } from "@/components/admin/BackgroundImagePicker";
import {
  HomeContentEditor,
  StoryContentEditor,
  ContactContentEditor,
  CareersContentEditor,
  PrivacyContentEditor,
  LegalContentEditor,
  RitualContentEditor,
  ServicesContentEditor,
} from "@/components/admin/PageContentEditor";
import { PAGE_META, type PageSlug, type SeoConfig } from "@/types/page-content";
import { cn } from "@/lib/utils";

interface PageData {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  seo: SeoConfig | null;
  backgroundImage: string | null;
  published: boolean;
  updatedAt: string;
}

type TabType = "content" | "seo" | "background";

export default function PageEditPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { success, error: showError } = useToast();

  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("content");
  const [hasChanges, setHasChanges] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);

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
          content: page.content,
          seo: page.seo,
          backgroundImage: page.backgroundImage,
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

  // 更新内容
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateContent = (content: any) => {
    setPage((prev) => (prev ? { ...prev, content } : null));
    setHasChanges(true);
  };

  // 更新 SEO
  const updateSeo = (seo: SeoConfig) => {
    setPage((prev) => (prev ? { ...prev, seo } : null));
    setHasChanges(true);
  };

  // 更新背景图片
  const updateBackgroundImage = (url: string) => {
    setPage((prev) => (prev ? { ...prev, backgroundImage: url } : null));
    setHasChanges(true);
    setShowBackgroundPicker(false);
  };

  // 删除背景图片
  const removeBackgroundImage = () => {
    setPage((prev) => (prev ? { ...prev, backgroundImage: null } : null));
    setHasChanges(true);
  };

  // 渲染内容编辑器
  const renderContentEditor = () => {
    if (!page) return null;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    switch (slug as PageSlug) {
      case "home":
        return (
          <HomeContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "story":
        return (
          <StoryContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "contact":
        return (
          <ContactContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "careers":
        return (
          <CareersContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "privacy":
        return (
          <PrivacyContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "terms":
        return (
          <LegalContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "ritual":
        return (
          <RitualContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      case "services":
        return (
          <ServicesContentEditor
            content={page.content as any}
            onChange={updateContent}
          />
        );
      default:
        return (
          <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">
            此页面类型暂无专用编辑器
          </div>
        );
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
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
              编辑页面 - {pageMeta.name}
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

      {/* Tab 切换 */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("content")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "content"
                ? "border-brand-gold text-brand-gold"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            )}
          >
            <FileText className="h-4 w-4" />
            页面内容
          </button>
          <button
            onClick={() => setActiveTab("background")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "background"
                ? "border-brand-gold text-brand-gold"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            )}
          >
            <ImageIcon className="h-4 w-4" />
            背景图片
          </button>
          <button
            onClick={() => setActiveTab("seo")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
              activeTab === "seo"
                ? "border-brand-gold text-brand-gold"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            )}
          >
            <Settings className="h-4 w-4" />
            SEO 设置
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        {activeTab === "content" && renderContentEditor()}
        {activeTab === "background" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-medium text-gray-900">页面背景图片</h3>
              <p className="text-sm text-gray-500">
                设置页面的背景图片，将显示在页面顶部或作为页面背景
              </p>
            </div>

            {page.backgroundImage ? (
              <div className="space-y-4">
                <div className="relative aspect-[21/9] w-full overflow-hidden rounded-lg border border-gray-200">
                  <Image
                    src={page.backgroundImage}
                    alt="页面背景图片"
                    fill
                    className="object-cover"
                  />
                  <button
                    onClick={removeBackgroundImage}
                    className="absolute right-2 top-2 rounded-full bg-red-500 p-2 text-white shadow-lg transition-colors hover:bg-red-600"
                    title="删除背景图片"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  variant="outline"
                  leftIcon={<ImageIcon className="h-4 w-4" />}
                  onClick={() => setShowBackgroundPicker(true)}
                >
                  更换背景图片
                </Button>
              </div>
            ) : (
              <div
                onClick={() => setShowBackgroundPicker(true)}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 transition-colors hover:border-brand-gold hover:bg-brand-cream/30"
              >
                <div className="mb-3 rounded-full bg-gray-100 p-4">
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                </div>
                <p className="mb-1 text-sm font-medium text-gray-700">
                  点击选择背景图片
                </p>
                <p className="text-xs text-gray-500">
                  建议使用宽屏比例的图片，如 21:9 或 16:9
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  可以直接上传，或上传后裁剪调整图片区域
                </p>
              </div>
            )}
          </div>
        )}
        {activeTab === "seo" && (
          <SeoEditor value={page.seo || {}} onChange={updateSeo} />
        )}
      </div>

      {/* 背景图片选择器（带裁剪功能） */}
      <BackgroundImagePicker
        isOpen={showBackgroundPicker}
        onClose={() => setShowBackgroundPicker(false)}
        onSelect={updateBackgroundImage}
        aspectRatio={21 / 9}
        title="选择背景图片"
      />
    </div>
  );
}
