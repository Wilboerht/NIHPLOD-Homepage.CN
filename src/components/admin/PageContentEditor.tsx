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

// 首页内容编辑器
export function HomeContentEditor({
  content,
  onChange,
}: {
  content: HomePageContent;
  onChange: (content: HomePageContent) => void;
}) {
  // 确保嵌套对象存在
  const hero = content.hero || { title: "", subtitle: "", backgroundImage: "", buttonText: "", buttonLink: "" };
  const intro = content.intro || { title: "", content: "" };
  const featuredProducts = content.featuredProducts || { title: "", subtitle: "" };
  const brandStory = content.brandStory || { title: "", content: "", image: "" };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">Hero 区块</h3>
        <HeroEditor
          value={hero}
          onChange={(newHero) => onChange({ ...content, hero: { ...hero, ...newHero } })}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="按钮文字"
            value={hero.buttonText || ""}
            onChange={(e) =>
              onChange({ ...content, hero: { ...hero, buttonText: e.target.value } })
            }
          />
          <Input
            label="按钮链接"
            value={hero.buttonLink || ""}
            onChange={(e) =>
              onChange({ ...content, hero: { ...hero, buttonLink: e.target.value } })
            }
          />
        </div>
      </section>

      {/* 简介 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">简介区块</h3>
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

      {/* 推荐产品区块 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">推荐产品区块</h3>
        <Input
          label="标题"
          value={featuredProducts.title || ""}
          onChange={(e) =>
            onChange({
              ...content,
              featuredProducts: { ...featuredProducts, title: e.target.value },
            })
          }
        />
        <div className="mt-4">
          <Input
            label="副标题"
            value={featuredProducts.subtitle || ""}
            onChange={(e) =>
              onChange({
                ...content,
                featuredProducts: { ...featuredProducts, subtitle: e.target.value },
              })
            }
          />
        </div>
      </section>

      {/* 品牌故事区块 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">品牌故事区块</h3>
        <Input
          label="标题"
          value={brandStory.title || ""}
          onChange={(e) =>
            onChange({ ...content, brandStory: { ...brandStory, title: e.target.value } })
          }
        />
        <div className="mt-4">
          <RichTextEditor
            label="内容"
            value={brandStory.content || ""}
            onChange={(value) =>
              onChange({ ...content, brandStory: { ...brandStory, content: value } })
            }
            minHeight="100px"
          />
        </div>
        <div className="mt-4">
          <Input
            label="图片 URL"
            value={brandStory.image || ""}
            onChange={(e) =>
              onChange({ ...content, brandStory: { ...brandStory, image: e.target.value } })
            }
          />
        </div>
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

// 联系我们页内容编辑器
export function ContactContentEditor({
  content,
  onChange,
}: {
  content: ContactPageContent;
  onChange: (content: ContactPageContent) => void;
}) {
  // 确保 info 对象存在
  const info = content.info || { address: "", email: "", phone: "", wechat: "", workingHours: "" };

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

      {/* 联系信息 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">联系信息</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="地址"
            value={info.address || ""}
            onChange={(e) =>
              onChange({ ...content, info: { ...info, address: e.target.value } })
            }
          />
          <Input
            label="邮箱"
            type="email"
            value={info.email || ""}
            onChange={(e) =>
              onChange({ ...content, info: { ...info, email: e.target.value } })
            }
          />
          <Input
            label="电话"
            value={info.phone || ""}
            onChange={(e) =>
              onChange({ ...content, info: { ...info, phone: e.target.value } })
            }
          />
          <Input
            label="微信"
            value={info.wechat || ""}
            onChange={(e) =>
              onChange({ ...content, info: { ...info, wechat: e.target.value } })
            }
          />
          <Input
            label="工作时间"
            value={info.workingHours || ""}
            onChange={(e) =>
              onChange({ ...content, info: { ...info, workingHours: e.target.value } })
            }
            className="md:col-span-2"
          />
        </div>
      </section>

      {/* 地图 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">地图嵌入</h3>
        <Input
          label="地图嵌入代码"
          value={content.mapEmbed || ""}
          onChange={(e) => onChange({ ...content, mapEmbed: e.target.value })}
          placeholder="粘贴地图 iframe 代码"
        />
      </section>

      {/* 表单配置 */}
      <section>
        <h3 className="mb-4 font-medium text-gray-900">表单配置</h3>
        <Input
          label="表单标题"
          value={content.formTitle || ""}
          onChange={(e) => onChange({ ...content, formTitle: e.target.value })}
        />
        <div className="mt-4">
          <Input
            label="表单描述"
            value={content.formDescription || ""}
            onChange={(e) => onChange({ ...content, formDescription: e.target.value })}
          />
        </div>
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
  // 确保 intro 对象存在
  const intro = content.intro || { title: "", content: "" };

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
          value={intro.title}
          onChange={(e) =>
            onChange({ ...content, intro: { ...intro, title: e.target.value } })
          }
        />
        <div className="mt-4">
          <RichTextEditor
            label="内容"
            value={intro.content}
            onChange={(value) =>
              onChange({ ...content, intro: { ...intro, content: value } })
            }
            minHeight="100px"
          />
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
          placeholder="hr@nihplod.cn"
        />
      </section>
    </div>
  );
}

// 隐私政策/服务条款页内容编辑器
export function LegalContentEditor({
  content,
  onChange,
}: {
  content: PrivacyPageContent;
  onChange: (content: PrivacyPageContent) => void;
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
