import Link from "next/link";
import { ContentParagraph } from "@/components/ui/PolicyContentRenderer";
import { PolicyDocumentHeader } from "@/components/ui/PolicyDocumentHeader";

// 供 /terms 与 /terms/embed 复用，内容和排版使用同一来源。
export interface TermsSection {
  id: string;
  title: string;
  content: string;
}

/** 将平铺内容拆分为独立章节（每条内容的第一行为标题） */
export function buildTermsSections(flatContent: string[]): TermsSection[] {
  return flatContent.map((text, index) => {
    const firstLine = text.split(/\r?\n/)[0].trim();
    const numMatch = firstLine.match(/^(\d+)\./);
    const id = numMatch ? `terms-${numMatch[1]}` : `terms-intro-${index}`;
    return { id, title: firstLine, content: text };
  });
}

interface TermsArticleProps {
  sections: TermsSection[];
  lastUpdated: string;
  description?: string;
}

export function TermsArticle({ sections, lastUpdated, description }: TermsArticleProps) {
  return (
    <main className="w-full max-w-3xl flex-1 break-words font-sans text-brand-charcoal/80">
      <PolicyDocumentHeader title="服务条款" lastUpdated={lastUpdated} description={description} />
      <div className="mt-10 space-y-10 md:mt-12 md:space-y-12">
        {sections.map((section, sIdx) => (
          <section key={section.id} id={section.id} className="scroll-mt-[100px] md:scroll-mt-32">
            <h2 className="mb-4 font-sans text-[19px] font-light tracking-[0.04em] text-brand-charcoal md:mb-5 md:text-2xl md:tracking-[0.03em]">
              {section.title}
            </h2>
            <div className="space-y-4">
              <ContentParagraph text={section.content} isFirst showHighlights />
            </div>

            {sIdx === 0 && (
              <div className="mt-6 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-4 md:p-5">
                <p className="text-[14px] leading-relaxed text-brand-charcoal/70">
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
      </div>
    </main>
  );
}
