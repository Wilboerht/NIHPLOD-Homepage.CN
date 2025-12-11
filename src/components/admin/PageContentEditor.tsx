"use client";

import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/components/admin/MediaPicker";
import type {
  HomePageContent,
  StoryPageContent,
  StoryTabContent,
  StorySection,
  ContactPageContent,
  CareersPageContent,
  PrivacyPageContent,
  TermsPageContent,
  ServicesPageContent,
  ServiceDetail,
  ServiceLink,
  ContentSection,
  RitualPageContent,
  RitualStep,
  RitualTabContent,
  RitualTabId,
} from "@/types/page-content";

// 通用 Section 编辑器
interface SectionEditorProps {
  section: ContentSection;
  index: number;
  onChange: (section: ContentSection) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function SectionEditor({
  section,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SectionEditorProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-700">
            区块 {index + 1}: {section.title || "(无标题)"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* 内容 */}
      {!collapsed && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <Input
            label="标题"
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          <RichTextEditor
            label="内容"
            value={section.content}
            onChange={(value) => onChange({ ...section, content: value })}
            minHeight="120px"
          />
          <Select
            label="布局"
            options={[
              { value: "left", label: "图片居左" },
              { value: "right", label: "图片居右" },
              { value: "center", label: "居中" },
            ]}
            value={section.layout}
            onChange={(e) =>
              onChange({ ...section, layout: e.target.value as ContentSection["layout"] })
            }
          />
          <Input
            label="图片 URL"
            value={section.image || ""}
            onChange={(e) => onChange({ ...section, image: e.target.value })}
            placeholder="可选，输入图片地址"
          />
        </div>
      )}
    </div>
  );
}

// Hero 区块编辑器
interface HeroEditorProps {
  value: { title: string; subtitle?: string; backgroundImage?: string } | undefined;
  onChange: (hero: { title: string; subtitle?: string; backgroundImage?: string }) => void;
}

function HeroEditor({ value, onChange }: HeroEditorProps) {
  // 确保 value 存在
  const hero = value || { title: "", subtitle: "", backgroundImage: "" };

  return (
    <div className="space-y-4">
      <Input
        label="主标题"
        value={hero.title || ""}
        onChange={(e) => onChange({ ...hero, title: e.target.value })}
      />
      <Input
        label="副标题"
        value={hero.subtitle || ""}
        onChange={(e) => onChange({ ...hero, subtitle: e.target.value })}
      />
      <Input
        label="背景图片 URL"
        value={hero.backgroundImage || ""}
        onChange={(e) => onChange({ ...hero, backgroundImage: e.target.value })}
        placeholder="输入背景图片地址"
      />
    </div>
  );
}

// 默认底部导航链接
const defaultFooterLinks = [
  { text: "关于旎柏", href: "/story" },
  { text: "护肤仪式", href: "/ritual" },
  { text: "联系我们", href: "/contact" },
  { text: "加入我们", href: "/careers" },
  { text: "隐私政策", href: "/privacy" },
  { text: "服务入口", href: "/services" },
];

// 首页内容编辑器 - 简洁品牌着陆页
export function HomeContentEditor({
  content,
  onChange,
}: {
  content: HomePageContent;
  onChange: (content: HomePageContent) => void;
}) {
  // 确保嵌套对象存在
  const brand = content.brand || { chineseName: "旎柏", slogan: "逆转时光" };
  const buttons = content.buttons || {
    advisorText: "AI 护肤顾问",
    advisorLink: "/advisor",
    productsText: "探索产品",
    productsLink: "/products",
  };
  const footerLinks = content.footerLinks || defaultFooterLinks;

  // 添加底部链接
  const addFooterLink = () => {
    onChange({
      ...content,
      footerLinks: [...footerLinks, { text: "", href: "" }],
    });
  };

  // 更新底部链接
  const updateFooterLink = (index: number, field: "text" | "href", value: string) => {
    const newLinks = [...footerLinks];
    newLinks[index] = { ...newLinks[index], [field]: value };
    onChange({ ...content, footerLinks: newLinks });
  };

  // 删除底部链接
  const removeFooterLink = (index: number) => {
    onChange({
      ...content,
      footerLinks: footerLinks.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-8">
      {/* 品牌信息 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">品牌信息</h3>
        <p className="mb-4 text-sm text-gray-500">
          首页中央显示的品牌名称和标语
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="品牌中文名"
            value={brand.chineseName || ""}
            onChange={(e) =>
              onChange({ ...content, brand: { ...brand, chineseName: e.target.value } })
            }
            placeholder="旎柏"
          />
          <Input
            label="品牌标语"
            value={brand.slogan || ""}
            onChange={(e) =>
              onChange({ ...content, brand: { ...brand, slogan: e.target.value } })
            }
            placeholder="逆转时光"
          />
        </div>
      </section>

      {/* 入口按钮 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">入口按钮</h3>
        <p className="mb-4 text-sm text-gray-500">
          首页中央的两个主要入口按钮
        </p>
        <div className="space-y-4">
          {/* AI 顾问按钮 */}
          <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/5 p-4">
            <h4 className="mb-3 text-sm font-medium text-brand-gold">AI 护肤顾问按钮（金色）</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="按钮文字"
                value={buttons.advisorText || ""}
                onChange={(e) =>
                  onChange({ ...content, buttons: { ...buttons, advisorText: e.target.value } })
                }
                placeholder="AI 护肤顾问"
              />
              <Input
                label="链接地址"
                value={buttons.advisorLink || ""}
                onChange={(e) =>
                  onChange({ ...content, buttons: { ...buttons, advisorLink: e.target.value } })
                }
                placeholder="/advisor"
              />
            </div>
          </div>
          {/* 产品浏览按钮 */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700">探索产品按钮（白色）</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="按钮文字"
                value={buttons.productsText || ""}
                onChange={(e) =>
                  onChange({ ...content, buttons: { ...buttons, productsText: e.target.value } })
                }
                placeholder="探索产品"
              />
              <Input
                label="链接地址"
                value={buttons.productsLink || ""}
                onChange={(e) =>
                  onChange({ ...content, buttons: { ...buttons, productsLink: e.target.value } })
                }
                placeholder="/products"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 底部导航链接 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">底部导航链接</h3>
            <p className="mt-1 text-sm text-gray-500">页面底部显示的快速导航链接</p>
          </div>
          <button
            type="button"
            onClick={addFooterLink}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
          >
            + 添加链接
          </button>
        </div>
        <div className="space-y-3">
          {footerLinks.map((link, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex flex-1 gap-3">
                <Input
                  label=""
                  value={link.text}
                  onChange={(e) => updateFooterLink(index, "text", e.target.value)}
                  placeholder="链接文字"
                  className="flex-1"
                />
                <Input
                  label=""
                  value={link.href}
                  onChange={(e) => updateFooterLink(index, "href", e.target.value)}
                  placeholder="/path"
                  className="flex-1"
                />
              </div>
              <button
                type="button"
                onClick={() => removeFooterLink(index)}
                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="删除"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 版权信息 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">底部版权</h3>
        <Input
          label="版权文字"
          value={content.copyright || ""}
          onChange={(e) => onChange({ ...content, copyright: e.target.value })}
          placeholder="NIHPLOD All Rights Reserved."
        />
        <p className="mt-2 text-xs text-gray-400">
          年份会自动添加，例如：© 2024 NIHPLOD All Rights Reserved.
        </p>
      </section>
    </div>
  );
}

// 关于旎柏页内容编辑器
export function StoryContentEditor({
  content,
  onChange,
}: {
  content: StoryPageContent;
  onChange: (content: StoryPageContent) => void;
}) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<{ tabId: string; sectionIndex: number } | null>(null);

  // 确保嵌套对象存在
  const pageTitle = content.pageTitle || { en: "ABOUT NIHPLOD", zh: "关于旎柏" };
  const tabs = content.tabs || {};

  const tabConfigs = [
    { id: "story", label: "品牌故事", icon: "📖" },
    { id: "mission", label: "公司使命", icon: "🎯" },
    { id: "philosophy", label: "经营理念", icon: "🏆" },
    { id: "media", label: "媒体报道", icon: "📰" },
    { id: "awards", label: "荣获奖项", icon: "🏅" },
  ];

  const updateTab = (tabId: string, tabContent: StoryTabContent) => {
    onChange({
      ...content,
      tabs: { ...tabs, [tabId]: tabContent } as StoryPageContent["tabs"],
    });
  };

  // 处理图片选择
  const handleImageSelect = (url: string, alt?: string) => {
    if (!editingImage) return;
    const { tabId, sectionIndex } = editingImage;
    const tabContent = tabs[tabId as keyof typeof tabs];
    if (!tabContent) return;

    const newSections = [...(tabContent.sections || [])];
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      image: url,
      imageAlt: alt || newSections[sectionIndex].imageAlt,
    };
    updateTab(tabId, { ...tabContent, sections: newSections });
    setMediaPickerOpen(false);
    setEditingImage(null);
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={pageTitle.en}
            onChange={(e) =>
              onChange({ ...content, pageTitle: { ...pageTitle, en: e.target.value } })
            }
            placeholder="ABOUT NIHPLOD"
          />
          <Input
            label="中文标题"
            value={pageTitle.zh}
            onChange={(e) =>
              onChange({ ...content, pageTitle: { ...pageTitle, zh: e.target.value } })
            }
            placeholder="关于旎柏"
          />
        </div>
      </section>

      {/* 标签页内容 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">标签页内容</h3>
        <div className="space-y-3">
          {tabConfigs.map((tab) => {
            const tabContent = tabs[tab.id as keyof typeof tabs] || { title: tab.label, sections: [] };
            const isExpanded = expandedTab === tab.id;
            const sectionCount = tabContent.sections?.length || 0;

            return (
              <div key={tab.id} className="rounded-lg border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedTab(isExpanded ? null : tab.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{tab.icon}</span>
                    <div>
                      <span className="font-medium text-gray-900">{tab.label}</span>
                      <span className="ml-2 text-sm text-gray-500">({sectionCount}个内容块)</span>
                    </div>
                  </div>
                  <ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 space-y-4">
                    {/* 标签页基本信息 */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="标题"
                        value={tabContent.title || ""}
                        onChange={(e) => updateTab(tab.id, { ...tabContent, title: e.target.value })}
                      />
                      {(tab.id === "mission" || tab.id === "philosophy" || tab.id === "media") && (
                        <Input
                          label="英文副标题"
                          value={tabContent.subtitle || ""}
                          onChange={(e) => updateTab(tab.id, { ...tabContent, subtitle: e.target.value })}
                          placeholder="如：OUR MISSION"
                        />
                      )}
                    </div>

                    {tab.id === "philosophy" && (
                      <Input
                        label="理念口号"
                        value={tabContent.slogan || ""}
                        onChange={(e) => updateTab(tab.id, { ...tabContent, slogan: e.target.value })}
                        placeholder="如：「顶奢体验 · 护肤艺术」"
                      />
                    )}

                    {/* 内容块列表 */}
                    <div className="mt-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="font-medium text-gray-700">内容块</h5>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Plus className="h-4 w-4" />}
                          onClick={() => {
                            const newSection = { type: "section" as const, title: "", paragraphs: [] };
                            updateTab(tab.id, { ...tabContent, sections: [...(tabContent.sections || []), newSection] });
                          }}
                        >
                          添加内容块
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {(tabContent.sections || []).map((section, index) => (
                          <StorySectionEditor
                            key={index}
                            section={section}
                            index={index}
                            tabId={tab.id}
                            tabContent={tabContent}
                            updateTab={updateTab}
                            onSelectImage={() => {
                              setEditingImage({ tabId: tab.id, sectionIndex: index });
                              setMediaPickerOpen(true);
                            }}
                          />
                        ))}

                        {(!tabContent.sections || tabContent.sections.length === 0) && (
                          <p className="py-6 text-center text-sm text-gray-400">
                            暂无内容块，点击上方按钮添加
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 媒体选择器 */}
      <MediaPicker
        isOpen={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setEditingImage(null);
        }}
        onSelect={handleImageSelect}
        title="选择图片"
      />
    </div>
  );
}

// 故事内容块编辑器子组件
function StorySectionEditor({
  section,
  index,
  tabId,
  tabContent,
  updateTab,
  onSelectImage,
}: {
  section: StorySection;
  index: number;
  tabId: string;
  tabContent: StoryTabContent;
  updateTab: (tabId: string, tabContent: StoryTabContent) => void;
  onSelectImage: () => void;
}) {
  const updateSection = (updates: Partial<StorySection>) => {
    const newSections = [...(tabContent.sections || [])];
    newSections[index] = { ...section, ...updates };
    updateTab(tabId, { ...tabContent, sections: newSections });
  };

  const removeSection = () => {
    const newSections = (tabContent.sections || []).filter((_, i) => i !== index);
    updateTab(tabId, { ...tabContent, sections: newSections });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">内容块 {index + 1}</span>
        <button
          onClick={removeSection}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="标题"
          value={section.title || ""}
          onChange={(e) => updateSection({ title: e.target.value })}
        />
        <Input
          label="副标题"
          value={section.subtitle || ""}
          onChange={(e) => updateSection({ subtitle: e.target.value })}
        />
      </div>

      {/* 图片区域 */}
      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">图片</label>
        <div className="flex items-start gap-4">
          {/* 图片预览 */}
          <div
            onClick={onSelectImage}
            className="group relative h-32 w-48 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-100 transition-colors hover:border-brand-gold"
          >
            {section.image ? (
              <>
                <img
                  src={section.image}
                  alt={section.imageAlt || ""}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-sm text-white">点击更换</span>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
                <Plus className="mb-1 h-6 w-6" />
                <span className="text-xs">点击选择图片</span>
              </div>
            )}
          </div>
          {/* 图片描述 */}
          <div className="flex-1">
            <Input
              label="图片描述 (Alt)"
              value={section.imageAlt || ""}
              onChange={(e) => updateSection({ imageAlt: e.target.value })}
              placeholder="描述图片内容，用于无障碍访问"
            />
            {section.image && (
              <button
                onClick={() => updateSection({ image: "", imageAlt: "" })}
                className="mt-2 text-xs text-red-500 hover:text-red-600"
              >
                移除图片
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 内容段落 */}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">内容段落（每行一段）</label>
        <textarea
          value={(section.paragraphs || []).join("\n")}
          onChange={(e) => updateSection({ paragraphs: e.target.value.split("\n").filter(Boolean) })}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
          placeholder="每行一个段落..."
        />
      </div>
    </div>
  );
}

// 默认留言类型
const defaultMessageTypes = [
  { value: "consultation", label: "产品咨询" },
  { value: "cooperation", label: "商务合作" },
  { value: "feedback", label: "使用反馈" },
  { value: "complaint", label: "投诉建议" },
  { value: "other", label: "其他问题" },
];

// 联系我们页内容编辑器
export function ContactContentEditor({
  content,
  onChange,
}: {
  content: ContactPageContent;
  onChange: (content: ContactPageContent) => void;
}) {
  // 确保嵌套对象存在
  const title = content.title || { en: "CONTACT US", zh: "联系我们" };
  const messageTypes = content.messageTypes || defaultMessageTypes;

  // 添加留言类型
  const addMessageType = () => {
    onChange({
      ...content,
      messageTypes: [...messageTypes, { value: "", label: "" }],
    });
  };

  // 更新留言类型
  const updateMessageType = (index: number, field: "value" | "label", value: string) => {
    const newTypes = [...messageTypes];
    newTypes[index] = { ...newTypes[index], [field]: value };
    onChange({ ...content, messageTypes: newTypes });
  };

  // 删除留言类型
  const removeMessageType = (index: number) => {
    onChange({
      ...content,
      messageTypes: messageTypes.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <p className="mb-4 text-sm text-gray-500">
          页面顶部显示的标题
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={title.en || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, en: e.target.value } })
            }
            placeholder="CONTACT US"
          />
          <Input
            label="中文标题"
            value={title.zh || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, zh: e.target.value } })
            }
            placeholder="联系我们"
          />
        </div>
      </section>

      {/* 页面描述 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面描述</h3>
        <Input
          label="描述文字"
          value={content.description || ""}
          onChange={(e) => onChange({ ...content, description: e.target.value })}
          placeholder="有任何问题或建议？我们期待与您的每一次交流"
        />
      </section>

      {/* 留言类型 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">留言类型</h3>
            <p className="mt-1 text-sm text-gray-500">表单中的留言类型下拉选项</p>
          </div>
          <button
            type="button"
            onClick={addMessageType}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
          >
            + 添加类型
          </button>
        </div>
        <div className="space-y-3">
          {messageTypes.map((type, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex flex-1 gap-3">
                <Input
                  label=""
                  value={type.value}
                  onChange={(e) => updateMessageType(index, "value", e.target.value)}
                  placeholder="值（英文，如 consultation）"
                  className="flex-1"
                />
                <Input
                  label=""
                  value={type.label}
                  onChange={(e) => updateMessageType(index, "label", e.target.value)}
                  placeholder="显示名称（如 产品咨询）"
                  className="flex-1"
                />
              </div>
              <button
                type="button"
                onClick={() => removeMessageType(index)}
                className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="删除"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 版权信息 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">底部版权</h3>
        <Input
          label="版权文字"
          value={content.copyright || ""}
          onChange={(e) => onChange({ ...content, copyright: e.target.value })}
          placeholder="NIHPLOD All Rights Reserved."
        />
        <p className="mt-2 text-xs text-gray-400">
          年份会自动添加，例如：© 2024 NIHPLOD All Rights Reserved.
        </p>
      </section>
    </div>
  );
}

// 加入我们页内容编辑器
export function CareersContentEditor({
  content,
  onChange,
}: {
  content: CareersPageContent;
  onChange: (content: CareersPageContent) => void;
}) {
  // 确保嵌套对象存在
  const title = content.title || { en: "JOIN US", zh: "加入我们" };
  const submitTip = content.submitTip || { title: "简历投递", content: "" };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <p className="mb-4 text-sm text-gray-500">
          页面顶部显示的标题
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={title.en || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, en: e.target.value } })
            }
            placeholder="JOIN US"
          />
          <Input
            label="中文标题"
            value={title.zh || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, zh: e.target.value } })
            }
            placeholder="加入我们"
          />
        </div>
      </section>

      {/* 页面描述 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面描述</h3>
        <Input
          label="描述文字"
          value={content.description || ""}
          onChange={(e) => onChange({ ...content, description: e.target.value })}
          placeholder="与热爱美好事物的人一起，创造高端护肤的未来"
        />
      </section>

      {/* 投递提示 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">投递提示</h3>
        <p className="mb-4 text-sm text-gray-500">
          职位列表下方的投递说明区块
        </p>
        <div className="space-y-4">
          <Input
            label="提示标题"
            value={submitTip.title || ""}
            onChange={(e) =>
              onChange({ ...content, submitTip: { ...submitTip, title: e.target.value } })
            }
            placeholder="简历投递"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              提示内容
            </label>
            <textarea
              value={submitTip.content || ""}
              onChange={(e) =>
                onChange({ ...content, submitTip: { ...submitTip, content: e.target.value } })
              }
              placeholder="请将简历直接投递到在招岗位的投递提交表单中&#10;简历命名格式：【应聘】职位名称 - 姓名"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
            />
            <p className="mt-1 text-xs text-gray-400">支持换行，用于多行说明</p>
          </div>
        </div>
      </section>

      {/* 联系邮箱 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">招聘联系</h3>
        <Input
          label="联系邮箱"
          type="email"
          value={content.contactEmail || ""}
          onChange={(e) => onChange({ ...content, contactEmail: e.target.value })}
          placeholder="hr@nihplod.com"
        />
        <p className="mt-2 text-xs text-gray-400">
          投递失败时显示的备用联系邮箱
        </p>
      </section>

      {/* 提示信息 */}
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="text-sm text-blue-700">
          <strong>提示：</strong>职位列表通过「职位管理」页面进行管理，不在此处编辑。
        </p>
      </div>
    </div>
  );
}

// 隐私政策标签编辑器组件
function PrivacyTabEditor({
  tabId,
  tabLabel,
  title,
  content,
  onTitleChange,
  onContentChange,
}: {
  tabId: string;
  tabLabel: string;
  title: string;
  content: string[];
  onTitleChange: (title: string) => void;
  onContentChange: (content: string[]) => void;
}) {
  const addParagraph = () => {
    onContentChange([...content, ""]);
  };

  const updateParagraph = (index: number, value: string) => {
    const newContent = [...content];
    newContent[index] = value;
    onContentChange(newContent);
  };

  const removeParagraph = (index: number) => {
    onContentChange(content.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-medium text-gray-900">{tabLabel}</h4>
        <button
          type="button"
          onClick={addParagraph}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
        >
          + 添加段落
        </button>
      </div>
      <Input
        label="标签标题"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={tabLabel}
      />
      <div className="mt-4 space-y-3">
        {content.map((paragraph, index) => (
          <div key={index} className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                段落 {index + 1}
              </label>
              <textarea
                value={paragraph}
                onChange={(e) => updateParagraph(index, e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                placeholder="支持换行符分隔小节，如：&#10;一、标题&#10;内容...&#10;&#10;• 列表项1&#10;• 列表项2"
              />
            </div>
            <button
              type="button"
              onClick={() => removeParagraph(index)}
              className="mt-6 rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {content.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            暂无段落，点击"添加段落"开始编辑
          </p>
        )}
      </div>
    </div>
  );
}

// 隐私政策页内容编辑器
export function PrivacyContentEditor({
  content,
  onChange,
}: {
  content: PrivacyPageContent;
  onChange: (content: PrivacyPageContent) => void;
}) {
  // 确保嵌套对象存在
  const title = content.title || { en: "PRIVACY POLICY", zh: "隐私政策" };
  const tabs = content.tabs || {
    collect: { title: "信息收集", content: [] },
    use: { title: "信息使用", content: [] },
    protect: { title: "信息保护", content: [] },
    rights: { title: "您的权利", content: [] },
  };

  const updateTab = (
    tabId: "collect" | "use" | "protect" | "rights",
    field: "title" | "content",
    value: string | string[]
  ) => {
    onChange({
      ...content,
      tabs: {
        ...tabs,
        [tabId]: {
          ...tabs[tabId],
          [field]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={title.en || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, en: e.target.value } })
            }
            placeholder="PRIVACY POLICY"
          />
          <Input
            label="中文标题"
            value={title.zh || ""}
            onChange={(e) =>
              onChange({ ...content, title: { ...title, zh: e.target.value } })
            }
            placeholder="隐私政策"
          />
        </div>
      </section>

      {/* 页面描述 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面描述</h3>
        <Input
          label="描述文字"
          value={content.description || ""}
          onChange={(e) => onChange({ ...content, description: e.target.value })}
          placeholder="我们重视并尊重您的隐私"
        />
      </section>

      {/* 最后更新日期 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">更新日期</h3>
        <Input
          label="最后更新日期"
          value={content.lastUpdated || ""}
          onChange={(e) => onChange({ ...content, lastUpdated: e.target.value })}
          placeholder="2024年12月1日"
        />
      </section>

      {/* 标签页内容 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">标签页内容</h3>
        <p className="mb-4 text-sm text-gray-500">
          隐私政策使用标签式布局，包含4个标签页。每个标签可包含多个段落，支持换行符格式化。
        </p>
        <div className="space-y-6">
          <PrivacyTabEditor
            tabId="collect"
            tabLabel="信息收集"
            title={tabs.collect?.title || "信息收集"}
            content={tabs.collect?.content || []}
            onTitleChange={(val) => updateTab("collect", "title", val)}
            onContentChange={(val) => updateTab("collect", "content", val)}
          />
          <PrivacyTabEditor
            tabId="use"
            tabLabel="信息使用"
            title={tabs.use?.title || "信息使用"}
            content={tabs.use?.content || []}
            onTitleChange={(val) => updateTab("use", "title", val)}
            onContentChange={(val) => updateTab("use", "content", val)}
          />
          <PrivacyTabEditor
            tabId="protect"
            tabLabel="信息保护"
            title={tabs.protect?.title || "信息保护"}
            content={tabs.protect?.content || []}
            onTitleChange={(val) => updateTab("protect", "title", val)}
            onContentChange={(val) => updateTab("protect", "content", val)}
          />
          <PrivacyTabEditor
            tabId="rights"
            tabLabel="您的权利"
            title={tabs.rights?.title || "您的权利"}
            content={tabs.rights?.content || []}
            onTitleChange={(val) => updateTab("rights", "title", val)}
            onContentChange={(val) => updateTab("rights", "content", val)}
          />
        </div>
      </section>

      {/* 格式说明 */}
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="mb-2 text-sm font-medium text-blue-700">段落格式说明</p>
        <ul className="space-y-1 text-xs text-blue-600">
          <li>• 使用空行分隔不同小节</li>
          <li>• 以"一、二、三..."开头的行会显示为小标题</li>
          <li>• 以"•"开头的行会显示为列表项</li>
          <li>• 其他内容显示为普通段落</li>
        </ul>
      </div>
    </div>
  );
}

// 服务条款页内容编辑器（保留原有实现）
export function LegalContentEditor({
  content,
  onChange,
}: {
  content: TermsPageContent;
  onChange: (content: TermsPageContent) => void;
}) {
  // 确保 sections 数组存在
  const sections = content.sections || [];

  const addSection = () => {
    const newSection = { title: "", content: "" };
    onChange({ ...content, sections: [...sections, newSection] });
  };

  const updateSection = (index: number, section: { title: string; content: string }) => {
    const newSections = [...sections];
    newSections[index] = section;
    onChange({ ...content, sections: newSections });
  };

  const removeSection = (index: number) => {
    onChange({ ...content, sections: sections.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-8">
      <section>
        <Input
          label="页面标题"
          value={content.title || ""}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
        />
        <div className="mt-4">
          <Input
            label="最后更新日期"
            value={content.lastUpdated || ""}
            onChange={(e) => onChange({ ...content, lastUpdated: e.target.value })}
            placeholder="2024-01-01"
          />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">条款内容</h3>
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addSection}>
            添加章节
          </Button>
        </div>
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={index} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-gray-700">章节 {index + 1}</span>
                <button
                  onClick={() => removeSection(index)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input
                label="章节标题"
                value={section.title || ""}
                onChange={(e) => updateSection(index, { ...section, title: e.target.value })}
              />
              <div className="mt-4">
                <RichTextEditor
                  label="章节内容"
                  value={section.content || ""}
                  onChange={(value) => updateSection(index, { ...section, content: value })}
                  minHeight="100px"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================
// 护肤仪式步骤编辑器组件
// ============================================
interface StepEditorProps {
  step: RitualStep;
  index: number;
  onChange: (step: RitualStep) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function RitualStepEditor({
  step,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepEditorProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-xs text-white">
            {step.order}
          </div>
          <span className="font-medium text-gray-700">
            {step.name || "(未命名)"} <span className="text-xs text-gray-400">{step.nameEn}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              className="rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* 内容 */}
      {!collapsed && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="步骤名称（中文）"
              value={step.name}
              onChange={(e) => onChange({ ...step, name: e.target.value })}
              placeholder="如：洁面"
            />
            <Input
              label="步骤名称（英文）"
              value={step.nameEn}
              onChange={(e) => onChange({ ...step, nameEn: e.target.value })}
              placeholder="如：CLEANSE"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              步骤描述
            </label>
            <textarea
              value={step.description}
              onChange={(e) => onChange({ ...step, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
              placeholder="描述这个步骤的详细内容..."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="建议时长"
              value={step.duration}
              onChange={(e) => onChange({ ...step, duration: e.target.value })}
              placeholder="如：1-2分钟"
            />
            <Input
              label="关联产品 Slug"
              value={step.productSlug || ""}
              onChange={(e) => onChange({ ...step, productSlug: e.target.value || null })}
              placeholder="如：foam-cleanser（可选）"
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================
// 护肤仪式标签页编辑器组件
// ============================================
interface RitualTabEditorProps {
  tabId: RitualTabId;
  tabLabel: string;
  tabContent: RitualTabContent;
  onChange: (content: RitualTabContent) => void;
}

function RitualTabEditor({
  tabId,
  tabLabel,
  tabContent,
  onChange,
}: RitualTabEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const addStep = () => {
    const newStep: RitualStep = {
      order: tabContent.steps.length + 1,
      name: "",
      nameEn: "",
      description: "",
      duration: "",
      productSlug: null,
    };
    onChange({ ...tabContent, steps: [...tabContent.steps, newStep] });
  };

  const updateStep = (index: number, step: RitualStep) => {
    const newSteps = [...tabContent.steps];
    newSteps[index] = step;
    onChange({ ...tabContent, steps: newSteps });
  };

  const removeStep = (index: number) => {
    const newSteps = tabContent.steps.filter((_, i) => i !== index);
    // 重新排序
    const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));
    onChange({ ...tabContent, steps: reorderedSteps });
  };

  const moveStep = (from: number, to: number) => {
    const newSteps = [...tabContent.steps];
    const [removed] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, removed);
    // 重新排序
    const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));
    onChange({ ...tabContent, steps: reorderedSteps });
  };

  // 获取标签页图标
  const getTabIcon = () => {
    switch (tabId) {
      case "morning":
        return "☀️";
      case "evening":
        return "🌙";
      case "couple":
        return "💑";
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      {/* 头部 - 可折叠 */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getTabIcon()}</span>
          <div>
            <h4 className="font-medium text-gray-900">{tabLabel}</h4>
            <p className="text-xs text-gray-500">
              {tabContent.steps.length} 个步骤
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* 内容 */}
      {expanded && (
        <div className="space-y-4 border-t border-gray-200 px-4 py-4">
          {/* 基本信息 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="标签标题（中文）"
              value={tabContent.title}
              onChange={(e) => onChange({ ...tabContent, title: e.target.value })}
              placeholder="如：晨间仪式"
            />
            <Input
              label="标签标题（英文）"
              value={tabContent.titleEn}
              onChange={(e) => onChange({ ...tabContent, titleEn: e.target.value })}
              placeholder="如：MORNING RITUAL"
            />
          </div>
          <Input
            label="标签描述"
            value={tabContent.description}
            onChange={(e) => onChange({ ...tabContent, description: e.target.value })}
            placeholder="简短描述这个仪式的特点..."
          />

          {/* 步骤列表 - 所有标签页通用 */}
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="font-medium text-gray-700">
                {tabId === "couple" ? "SPA 活动" : "护肤步骤"}
              </h5>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={addStep}
              >
                {tabId === "couple" ? "添加活动" : "添加步骤"}
              </Button>
            </div>
            <div className="space-y-3">
              {tabContent.steps.map((step, index) => (
                <RitualStepEditor
                  key={`${tabId}-step-${index}`}
                  step={step}
                  index={index}
                  onChange={(s) => updateStep(index, s)}
                  onRemove={() => removeStep(index)}
                  onMoveUp={index > 0 ? () => moveStep(index, index - 1) : undefined}
                  onMoveDown={
                    index < tabContent.steps.length - 1
                      ? () => moveStep(index, index + 1)
                      : undefined
                  }
                />
              ))}
              {tabContent.steps.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  暂无{tabId === "couple" ? "活动" : "步骤"}，点击上方按钮开始编辑
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 护肤仪式页内容编辑器
// ============================================
export function RitualContentEditor({
  content,
  onChange,
}: {
  content: RitualPageContent;
  onChange: (content: RitualPageContent) => void;
}) {
  // 确保嵌套对象存在
  const pageTitle = content.pageTitle || {
    en: "SKINCARE RITUAL",
    zh: "护肤仪式",
    description: "每一次护肤，都是与自己对话的珍贵时光",
  };

  const tabs = content.tabs || {
    morning: {
      title: "晨间仪式",
      titleEn: "MORNING RITUAL",
      description: "清晨护肤，唤醒肌肤活力，为新的一天注入能量",
      steps: [],
    },
    evening: {
      title: "晚间仪式",
      titleEn: "EVENING RITUAL",
      description: "夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新",
      steps: [],
    },
    couple: {
      title: "双人SPA",
      titleEn: "COUPLE SPA",
      description: "与伴侣一起，享受护肤的亲密时光，在彼此的呵护中，感受爱与美的交融",
      steps: [],
    },
  };

  const updateTab = (tabId: RitualTabId, tabContent: RitualTabContent) => {
    onChange({
      ...content,
      tabs: {
        ...tabs,
        [tabId]: tabContent,
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <p className="mb-4 text-sm text-gray-500">
          护肤仪式页面顶部显示的标题信息
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={pageTitle.en || ""}
            onChange={(e) =>
              onChange({
                ...content,
                pageTitle: { ...pageTitle, en: e.target.value },
              })
            }
            placeholder="SKINCARE RITUAL"
          />
          <Input
            label="中文标题"
            value={pageTitle.zh || ""}
            onChange={(e) =>
              onChange({
                ...content,
                pageTitle: { ...pageTitle, zh: e.target.value },
              })
            }
            placeholder="护肤仪式"
          />
        </div>
        <div className="mt-4">
          <Input
            label="副标题描述"
            value={pageTitle.description || ""}
            onChange={(e) =>
              onChange({
                ...content,
                pageTitle: { ...pageTitle, description: e.target.value },
              })
            }
            placeholder="每一次护肤，都是与自己对话的珍贵时光"
          />
        </div>
      </section>

      {/* 三个标签页 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">仪式标签页</h3>
        <p className="mb-4 text-sm text-gray-500">
          点击展开编辑各个仪式标签页的内容和步骤
        </p>
        <div className="space-y-4">
          <RitualTabEditor
            tabId="morning"
            tabLabel="晨间仪式"
            tabContent={tabs.morning}
            onChange={(tc) => updateTab("morning", tc)}
          />
          <RitualTabEditor
            tabId="evening"
            tabLabel="晚间仪式"
            tabContent={tabs.evening}
            onChange={(tc) => updateTab("evening", tc)}
          />
          <RitualTabEditor
            tabId="couple"
            tabLabel="双人SPA"
            tabContent={tabs.couple}
            onChange={(tc) => updateTab("couple", tc)}
          />
        </div>
      </section>

      {/* 提示信息 */}
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="mb-2 text-sm font-medium text-blue-700">编辑说明</p>
        <ul className="space-y-1 text-xs text-blue-600">
          <li>• 每个标签页可以单独编辑标题、描述和步骤</li>
          <li>• 步骤可以拖拽排序（使用上下箭头）</li>
          <li>• 关联产品 Slug 用于链接到产品详情页</li>
          <li>• 双人SPA标签页目前显示的是固定内容，步骤不会显示在前端</li>
        </ul>
      </div>
    </div>
  );
}

// 服务入口页内容编辑器
export function ServicesContentEditor({
  content,
  onChange,
}: {
  content: ServicesPageContent;
  onChange: (content: ServicesPageContent) => void;
}) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  // 确保嵌套对象存在
  const pageTitle = content.pageTitle || { en: "SERVICES", zh: "服务入口" };
  const services = content.services || [];

  // 更新服务
  const updateService = (index: number, updates: Partial<ServiceDetail>) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], ...updates };
    onChange({ ...content, services: newServices });
  };

  // 添加服务
  const addService = () => {
    const newService: ServiceDetail = {
      id: `service-${Date.now()}`,
      label: "新服务",
      title: "新服务标题",
      nameEn: "New Service",
      description: "服务描述",
      links: [],
    };
    onChange({ ...content, services: [...services, newService] });
  };

  // 删除服务
  const removeService = (index: number) => {
    onChange({ ...content, services: services.filter((_, i) => i !== index) });
  };

  // 添加链接
  const addLink = (serviceIndex: number) => {
    const newLink: ServiceLink = { label: "新链接", url: "", isAdmin: false, description: "" };
    const newServices = [...services];
    newServices[serviceIndex] = {
      ...newServices[serviceIndex],
      links: [...newServices[serviceIndex].links, newLink],
    };
    onChange({ ...content, services: newServices });
  };

  // 更新链接
  const updateLink = (serviceIndex: number, linkIndex: number, updates: Partial<ServiceLink>) => {
    const newServices = [...services];
    const newLinks = [...newServices[serviceIndex].links];
    newLinks[linkIndex] = { ...newLinks[linkIndex], ...updates };
    newServices[serviceIndex] = { ...newServices[serviceIndex], links: newLinks };
    onChange({ ...content, services: newServices });
  };

  // 删除链接
  const removeLink = (serviceIndex: number, linkIndex: number) => {
    const newServices = [...services];
    newServices[serviceIndex] = {
      ...newServices[serviceIndex],
      links: newServices[serviceIndex].links.filter((_, i) => i !== linkIndex),
    };
    onChange({ ...content, services: newServices });
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">页面标题</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="英文标题"
            value={pageTitle.en}
            onChange={(e) => onChange({ ...content, pageTitle: { ...pageTitle, en: e.target.value } })}
            placeholder="SERVICES"
          />
          <Input
            label="中文标题"
            value={pageTitle.zh}
            onChange={(e) => onChange({ ...content, pageTitle: { ...pageTitle, zh: e.target.value } })}
            placeholder="服务入口"
          />
        </div>
      </section>

      {/* 服务列表 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">服务列表</h3>
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addService}>
            添加服务
          </Button>
        </div>

        <div className="space-y-3">
          {services.map((service, serviceIndex) => {
            const isExpanded = expandedService === service.id;

            return (
              <div key={service.id} className="rounded-lg border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedService(isExpanded ? null : service.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🔗</span>
                    <div>
                      <span className="font-medium text-gray-900">{service.label}</span>
                      <span className="ml-2 text-sm text-gray-500">({service.links.length}个链接)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeService(serviceIndex);
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 space-y-4">
                    {/* 基本信息 */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="标签名称"
                        value={service.label}
                        onChange={(e) => updateService(serviceIndex, { label: e.target.value })}
                        placeholder="会员系统"
                      />
                      <Input
                        label="服务ID"
                        value={service.id}
                        onChange={(e) => updateService(serviceIndex, { id: e.target.value })}
                        placeholder="vip"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="服务标题"
                        value={service.title}
                        onChange={(e) => updateService(serviceIndex, { title: e.target.value })}
                        placeholder="旎柏会员系统"
                      />
                      <Input
                        label="英文名"
                        value={service.nameEn}
                        onChange={(e) => updateService(serviceIndex, { nameEn: e.target.value })}
                        placeholder="VIP System"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">服务描述</label>
                      <textarea
                        value={service.description}
                        onChange={(e) => updateService(serviceIndex, { description: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                        placeholder="服务描述..."
                      />
                    </div>

                    {/* 链接列表 */}
                    <div className="mt-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="font-medium text-gray-700">服务链接</h5>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Plus className="h-4 w-4" />}
                          onClick={() => addLink(serviceIndex)}
                        >
                          添加链接
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {service.links.map((link, linkIndex) => (
                          <div key={linkIndex} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">
                                链接 {linkIndex + 1} {link.isAdmin && <span className="text-orange-500">(管理端)</span>}
                              </span>
                              <button
                                onClick={() => removeLink(serviceIndex, linkIndex)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Input
                                label="链接名称"
                                value={link.label}
                                onChange={(e) => updateLink(serviceIndex, linkIndex, { label: e.target.value })}
                                placeholder="用户端"
                              />
                              <Input
                                label="链接地址"
                                value={link.url}
                                onChange={(e) => updateLink(serviceIndex, linkIndex, { url: e.target.value })}
                                placeholder="https://..."
                              />
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <Input
                                label="链接描述"
                                value={link.description}
                                onChange={(e) => updateLink(serviceIndex, linkIndex, { description: e.target.value })}
                                placeholder="链接的简要说明"
                              />
                              <div className="flex items-center gap-2 pt-6">
                                <input
                                  type="checkbox"
                                  id={`admin-${serviceIndex}-${linkIndex}`}
                                  checked={link.isAdmin}
                                  onChange={(e) => updateLink(serviceIndex, linkIndex, { isAdmin: e.target.checked })}
                                  className="h-4 w-4 rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
                                />
                                <label htmlFor={`admin-${serviceIndex}-${linkIndex}`} className="text-sm text-gray-700">
                                  管理端（仅授权人员）
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}

                        {service.links.length === 0 && (
                          <p className="py-4 text-center text-sm text-gray-400">
                            暂无链接，点击上方按钮添加
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {services.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              暂无服务，点击上方按钮添加
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
