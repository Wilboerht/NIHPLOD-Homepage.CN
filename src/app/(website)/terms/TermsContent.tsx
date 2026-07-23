import TableOfContents from "@/components/ui/TableOfContents";
import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import { StandaloneNav } from "@/components/ui/StandaloneNav";
import { ContentParagraph } from "@/components/ui/PolicyContentRenderer";
import Link from "next/link";
import Image from "next/image";
import type { TermsPageContent } from "@/types/page-content";

interface TermsContentProps {
  content: TermsPageContent;
}

// ============================================
// 主页面组件 (服务端组件)
// ============================================

export function TermsContent({ content }: TermsContentProps) {
  const lastUpdated = content.lastUpdated || "";
  const flatContent = content.tabs?.general?.content || [];

  // 将平铺内容拆分为独立章节（每条内容的第一行为标题）
  const sections = flatContent.map((text) => {
    const firstLine = text.split(/\r?\n/)[0].trim();
    // 提取编号作为 ID：1. 隐私权 → terms-1，24. AI 素颜测肤 → terms-24
    const numMatch = firstLine.match(/^(\d+)\./);
    const id = numMatch ? `terms-${numMatch[1]}` : `terms-intro`;
    return { id, title: firstLine, content: text };
  });

  return (
    <div className="flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] pt-[120px] md:pt-32 mb-[-7rem] lg:mb-[-6rem]">
      <StandaloneNav title="服务条款" links={[
        { href: "/contact", label: "联系我们" },
        { href: "/privacy", label: "隐私政策" },
      ]} />

      <div className="container mx-auto px-6 md:px-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-24">
          {/* Mobile TOC - Dropdown */}
          <div className="mb-4 lg:hidden">
            <TableOfContents sections={sections} />
          </div>

          {/* Sticky Sidebar Navigation */}
          <ScrollSpySidebar sections={sections} label="服务条款目录导航" />

          {/* Main Content */}
          <main className="max-w-4xl flex-1 space-y-16 font-songti leading-relaxed text-brand-charcoal/80">
            {sections.map((section, sIdx) => (
              <section key={section.id} id={section.id} className="scroll-mt-[120px] md:scroll-mt-32">
                <h2 className="mb-8 font-sans text-2xl font-light tracking-[0.12em] text-brand-charcoal">
                  {section.title}
                </h2>
                <div className="space-y-6">
                  <ContentParagraph text={section.content} isFirst showHighlights />
                </div>

                {/* 隐私政策引用 - 仅在第一个章节 */}
                {sIdx === 1 && (
                  <div className="mt-8 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-5">
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
        </div>
      </div>

      {/* Page Footer */}
<footer className="mt-16 border-t border-brand-charcoal/10 md:mt-24">
      <div className="container mx-auto px-6 py-10 text-center md:px-8 lg:px-12 xl:px-16">
        <p className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
          &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司 版权所有
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-light text-brand-charcoal/[0.48]">
            <Link
              href="https://beian.miit.gov.cn/"
              target="_blank"
              className="transition-colors hover:text-brand-charcoal"
            >
              沪ICP备2026014764号-1
            </Link>
            <span className="text-brand-charcoal/15">|</span>
            <Link
              href="http://www.beian.gov.cn/portal/registerSystemInfo"
              target="_blank"
              className="inline-flex items-center gap-1 transition-colors hover:text-brand-charcoal"
            >
              <Image
                src="/images/beian.webp"
                alt="公安备案"
                width={12}
                height={12}
                className="opacity-60"
              />
              <span>沪公网安备31010702010178号</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
