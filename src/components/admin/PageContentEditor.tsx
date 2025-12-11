"use client";

import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { useState } from "react";
import type {
  HomePageContent,
  StoryPageContent,
  ContactPageContent,
  CareersPageContent,
  PrivacyPageContent,
  TermsPageContent,
  ContentSection,
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

// 品牌故事页内容编辑器
export function StoryContentEditor({
  content,
  onChange,
}: {
  content: StoryPageContent;
  onChange: (content: StoryPageContent) => void;
}) {
  // 确保嵌套对象存在
  const intro = content.intro || { title: "", content: "" };
  const sections = content.sections || [];

  const addSection = () => {
    const newSection: ContentSection = {
      id: `section-${Date.now()}`,
      title: "",
      content: "",
      layout: "left",
    };
    onChange({ ...content, sections: [...sections, newSection] });
  };

  const updateSection = (index: number, section: ContentSection) => {
    const newSections = [...sections];
    newSections[index] = section;
    onChange({ ...content, sections: newSections });
  };

  const removeSection = (index: number) => {
    onChange({ ...content, sections: sections.filter((_, i) => i !== index) });
  };

  const moveSection = (from: number, to: number) => {
    const newSections = [...sections];
    const [removed] = newSections.splice(from, 1);
    newSections.splice(to, 0, removed);
    onChange({ ...content, sections: newSections });
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">Hero 区块</h3>
        <HeroEditor
          value={content.hero}
          onChange={(hero) => onChange({ ...content, hero })}
        />
      </section>

      {/* 简介 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">简介</h3>
        <Input
          label="标题"
          value={intro.title || ""}
          onChange={(e) =>
            onChange({ ...content, intro: { ...intro, title: e.target.value } })
          }
        />
        <div className="mt-4">
          <RichTextEditor
            label="内容"
            value={intro.content || ""}
            onChange={(value) =>
              onChange({ ...content, intro: { ...intro, content: value } })
            }
            minHeight="100px"
          />
        </div>
      </section>

      {/* 内容区块 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">内容区块</h3>
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addSection}>
            添加区块
          </Button>
        </div>
        <div className="space-y-4">
          {sections.map((section, index) => (
            <SectionEditor
              key={section.id}
              section={section}
              index={index}
              onChange={(s) => updateSection(index, s)}
              onRemove={() => removeSection(index)}
              onMoveUp={index > 0 ? () => moveSection(index, index - 1) : undefined}
              onMoveDown={index < sections.length - 1 ? () => moveSection(index, index + 1) : undefined}
            />
          ))}
        </div>
      </section>
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
