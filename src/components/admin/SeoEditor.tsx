"use client";

import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { SeoConfig } from "@/types/page-content";

interface SeoEditorProps {
  value: SeoConfig;
  onChange: (seo: SeoConfig) => void;
}

export function SeoEditor({ value, onChange }: SeoEditorProps) {
  const updateField = <K extends keyof SeoConfig>(key: K, val: SeoConfig[K]) => {
    onChange({ ...value, [key]: val });
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

      <Input
        label="关键词"
        value={value.keywords || ""}
        onChange={(e) => updateField("keywords", e.target.value)}
        placeholder="关键词，用逗号分隔"
        maxLength={200}
      />

      <Input
        label="OG 图片"
        value={value.ogImage || ""}
        onChange={(e) => updateField("ogImage", e.target.value)}
        placeholder="社交分享时显示的图片 URL"
      />

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

