import type { ReactNode } from "react";
import { ContentParagraph } from "@/components/ui/PolicyContentRenderer";
import { PolicyDocumentHeader } from "@/components/ui/PolicyDocumentHeader";
import type { LegalDocumentContent } from "@/types/legal";

interface PolicyDocumentProps {
  content: LegalDocumentContent;
  /** 首个章节后插入的补充提示（服务条款的“隐私政策”说明） */
  afterFirstSection?: ReactNode;
}

/**
 * 法务文档正文渲染（服务条款 / 隐私政策 / 后台预览共用）
 *
 * 根节点刻意使用 div：后台预览会嵌套在管理端 <main> 内，避免出现嵌套 main。
 */
export function PolicyDocument({ content, afterFirstSection }: PolicyDocumentProps) {
  return (
    <>
      <PolicyDocumentHeader
        title={content.title}
        lastUpdated={content.lastUpdated}
        description={content.description}
      />
      <div className="mt-10 space-y-10 md:mt-12 md:space-y-12">
        {content.sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-[100px] md:scroll-mt-32">
            <h2 className="mb-4 font-sans text-[19px] font-light tracking-[0.04em] text-brand-charcoal md:mb-5 md:text-2xl md:tracking-[0.03em]">
              {section.title}
            </h2>
            <div className="space-y-4">
              {section.body.trim() ? <ContentParagraph text={section.body} showHighlights /> : null}
            </div>

            {index === 0 ? afterFirstSection : null}
          </section>
        ))}
      </div>
    </>
  );
}
