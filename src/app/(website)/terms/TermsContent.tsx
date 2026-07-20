import TableOfContents from "@/components/ui/TableOfContents";
import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import { BackToHome } from "@/components/ui/BackToHome";
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
  const pageTitle = content.pageTitle || {
    en: "TERMS OF SERVICE",
    zh: "服务条款",
  };
  const lastUpdated = content.lastUpdated || "2022年08月11日";
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
    <div className="min-h-screen animate-fade-in bg-[#fefcf8] pb-0 pt-16 md:pt-24">
      {/* Header Section */}
      <div className="container mx-auto mb-8 px-6 md:mb-16 md:px-8 lg:px-12 xl:px-16">
        <div className="max-w-4xl">
          <h1 className="mb-6 text-4xl font-normal text-zinc-900 md:text-5xl">{pageTitle.zh}</h1>
        </div>
      </div>

      <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-24">
          {/* Mobile TOC - Dropdown */}
          <div className="mb-4 lg:hidden">
            <TableOfContents sections={sections} />
          </div>

          {/* Sticky Sidebar Navigation */}
          <ScrollSpySidebar sections={sections} label="服务条款目录导航" />

          {/* Main Content */}
          <main className="max-w-4xl flex-1 space-y-16 font-songti leading-relaxed text-zinc-800">
            {sections.map((section, sIdx) => (
              <section key={section.id} id={section.id} className="scroll-mt-32">
                <h2 className="mb-8 font-sans text-2xl font-medium tracking-wide text-zinc-900">
                  {section.title}
                </h2>
                <div className="space-y-6">
                  <ContentParagraph text={section.content} isFirst showHighlights />
                </div>

                {/* 隐私政策引用 - 仅在第一个章节 */}
                {sIdx === 1 && (
                  <div className="mt-8 rounded-xl border border-[#00263E]/30 bg-zinc-50 p-5">
                    <p className="text-sm leading-relaxed text-zinc-500">
                      有关我们如何收集、使用和保护您的个人信息的详细说明，请参阅我们的{" "}
                      <Link
                        href="/privacy"
                        className="font-medium text-[#00263E] underline decoration-zinc-300 underline-offset-4 transition-all hover:decoration-[#00263E]"
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
      <footer className="mt-16 border-t border-zinc-200 md:mt-24">
        <div className="container mx-auto px-6 py-10 text-center md:px-8 lg:px-12 xl:px-16">
          <p className="text-xs tracking-wide text-zinc-500">
            &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司 版权所有
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <Link
              href="https://beian.miit.gov.cn/"
              target="_blank"
              className="transition-colors hover:text-zinc-600"
            >
              沪ICP备2026014764号-1
            </Link>
            <span className="text-zinc-300">|</span>
            <Link
              href="http://www.beian.gov.cn/portal/registerSystemInfo"
              target="_blank"
              className="inline-flex items-center gap-1 transition-colors hover:text-zinc-600"
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
            <span className="text-zinc-300">|</span>
            <Link
              href="https://wap.scjgj.sh.gov.cn/businessCheck/verifKey.do?showType=extShow&serial=YOUR_SERIAL&signData=YOUR_SIGN_DATA"
              target="_blank"
              className="inline-flex items-center gap-1 transition-colors hover:text-zinc-600"
            >
              <Image
                src="/images/aic_icon.png"
                alt="电子营业执照"
                width={12}
                height={12}
                className="opacity-50"
              />
              <span>电子营业执照</span>
            </Link>
          </div>
        </div>
      </footer>

      <BackToHome />
    </div>
  );
}
