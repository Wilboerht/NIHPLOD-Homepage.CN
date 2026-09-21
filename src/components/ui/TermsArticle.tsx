import Link from "next/link";
import { ContentParagraph } from "@/components/ui/PolicyContentRenderer";

// ============================================
// 服务条款正文（共享组件）
// 供 /terms 页面（TermsContent）与 /terms/embed 嵌入页复用，
// 保证两处正文内容与样式完全一致。
// 本文件不含 "use client" 与客户端 API，可同时用于服务端/客户端组件。
// ============================================

export interface TermsSection {
  id: string;
  title: string;
  content: string;
}

/** 将平铺内容拆分为独立章节（每条内容的第一行为标题） */
export function buildTermsSections(flatContent: string[]): TermsSection[] {
  return flatContent.map((text) => {
    const firstLine = text.split(/\r?\n/)[0].trim();
    // 提取编号作为 ID：1. 隐私权 → terms-1，24. AI 素颜测肤 → terms-24
    const numMatch = firstLine.match(/^(\d+)\./);
    const id = numMatch ? `terms-${numMatch[1]}` : `terms-intro`;
    return { id, title: firstLine, content: text };
  });
}

interface TermsArticleProps {
  sections: TermsSection[];
}

export function TermsArticle({ sections }: TermsArticleProps) {
  return (
    <main className="max-w-4xl flex-1 space-y-10 font-songti text-brand-charcoal/80 md:space-y-16 md:leading-relaxed">
      {sections.map((section, sIdx) => (
        <section key={section.id} id={section.id} className="scroll-mt-[100px] md:scroll-mt-32">
          <h2 className="mb-4 font-sans text-[19px] font-normal tracking-[0.15em] text-brand-charcoal md:mb-8 md:text-2xl md:font-light md:tracking-[0.12em]">
            {section.title}
          </h2>
          <div className="space-y-6">
            <ContentParagraph text={section.content} isFirst showHighlights />
          </div>

          {/* 隐私政策引用 - 仅在第一个章节 */}
          {sIdx === 1 && (
            <div className="mt-6 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-4 md:mt-8 md:p-5">
              <p className="text-[14px] leading-relaxed text-brand-charcoal/60">
                有关我们如何收集、使用和保护您的个人信息的详细说明，请参阅我们的{" "}
                <Link
                  href="/privacy"
                  className="font-light text-brand-charcoal underline decoration-brand-charcoal/20 underline-offset-4 transition-all hover:text-brand-charcoal hover:decoration-brand-charcoal/50"
                >
                  隐私政策
                </Link>
                。
              </p>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
