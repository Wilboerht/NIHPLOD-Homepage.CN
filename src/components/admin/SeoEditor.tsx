"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import type { SeoConfig } from "@/types/page-content";

interface SeoEditorProps {
  value: SeoConfig;
  onChange: (seo: SeoConfig) => void;
}

export function SeoEditor({ value, onChange }: SeoEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof SeoConfig>(key: K, val: SeoConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    // 验证文件类型
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("仅支持 JPG、PNG、WebP 格式");
      return;
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("文件大小不能超过 10MB");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "seo");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "上传失败");
      }

      updateField("ogImage", data.data.url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  // 处理拖拽
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // 清除图片
  const clearImage = () => {
    updateField("ogImage", "");
  };

  return (
    <div className="space-y-4">
      <Input
        label="SEO 标题"
        value={value.title || ""}
        onChange={(e) => updateField("title", e.target.value)}
        placeholder="页面标题（用于搜索引擎）"
        maxLength={100}
      />
      <div className="text-right text-xs text-gray-400">
        {(value.title || "").length}/100
      </div>

      <Textarea
        label="SEO 描述"
        value={value.description || ""}
        onChange={(e) => updateField("description", e.target.value)}
        placeholder="页面描述（用于搜索引擎）"
        rows={3}
        maxLength={300}
      />
      <div className="text-right text-xs text-gray-400">
        {(value.description || "").length}/300
      </div>

      {/* OG 图片上传 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          OG 图片
        </label>
        <p className="mb-3 text-xs text-gray-500">
          社交媒体分享时显示的图片，推荐尺寸 1200×630 像素
        </p>

        {value.ogImage ? (
          // 已上传图片预览
          <div className="relative overflow-hidden rounded-lg border border-gray-200">
            <div className="relative aspect-[1200/630] w-full bg-gray-100">
              <Image
                src={value.ogImage}
                alt="OG 图片预览"
                fill
                className="object-cover"
              />
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2">
              <span className="truncate text-xs text-gray-500">{value.ogImage}</span>
              <button
                type="button"
                onClick={clearImage}
                className="ml-2 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="删除图片"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          // 上传区域
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
              uploading && "pointer-events-none opacity-60",
              dragActive
                ? "border-brand-gold bg-brand-gold/5"
                : uploadError
                  ? "border-red-300 bg-red-50"
                  : "border-gray-300 hover:border-brand-gold hover:bg-brand-cream/30"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
            <div className="mb-2 rounded-full bg-gray-100 p-2">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand-gold" />
              ) : dragActive ? (
                <Upload className="h-5 w-5 text-brand-gold" />
              ) : (
                <ImageIcon className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <p className="text-sm text-gray-600">
              {uploading ? "上传中..." : dragActive ? "释放以上传" : "点击或拖拽上传图片"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              支持 JPG、PNG、WebP，最大 10MB
            </p>
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-sm text-red-500">{uploadError}</p>
        )}

        {/* 或者手动输入 URL */}
        <div className="mt-3">
          <Input
            label=""
            value={value.ogImage || ""}
            onChange={(e) => updateField("ogImage", e.target.value)}
            placeholder="或直接输入图片 URL"
            className="text-sm"
          />
        </div>
      </div>

      {/* SEO 预览 */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-medium text-gray-500">搜索引擎预览</p>
        <div className="space-y-1">
          <p className="text-lg text-blue-600 hover:underline">
            {value.title || "页面标题"}
          </p>
          <p className="text-sm text-green-700">
            https://nihplod.cn/...
          </p>
          <p className="text-sm text-gray-600 line-clamp-2">
            {value.description || "页面描述将显示在这里..."}
          </p>
        </div>
      </div>
    </div>
  );
}

