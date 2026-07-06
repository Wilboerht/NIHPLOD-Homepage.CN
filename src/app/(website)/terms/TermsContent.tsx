import TableOfContents from "@/components/ui/TableOfContents";
import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import Link from "next/link";
import type { TermsPageContent, TermsTabId } from "@/types/page-content";

interface TermsContentProps {
  content: TermsPageContent;
}

// ============================================
// 工具函数
// ============================================

/** 在中英文/数字之间添加空格 */
function formatText(text: string) {
  return text
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2");
}

/** 判断是否为子编号标题 (4.1, 5.2 等) */
function isSubNumberedHeading(text: string): boolean {
  return /^\d+\.\d+\s/.test(text);
}

/** 判断是否为章节标题 (1. 2. 一、二、...) */
function isSectionHeading(text: string): boolean {
  return /^[一二三四五六七八九十0-9]+[、.\s]/.test(text);
}

/** 判断是否为子标题 ((一) (二) 等，仅中文数字) */
function isSubHeading(text: string): boolean {
  return /^[（(][一二三四五六七八九十]+[）)]/.test(text);
}

/** 判断是否为重要提示框 */
function isHighlight(text: string): boolean {
  return text.startsWith("【重要提示】");
}

// ============================================
// 内容段落渲染
// ============================================

function ContentParagraph({ text, isFirst = false }: { text: string; isFirst?: boolean }) {
  const lines = text.split(/\r?\n/);

  return (
    <>
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // 跳过首个段落中的重复章节标题（已由外层 h2 渲染）
        if (isFirst && lIdx === 0 && isSectionHeading(trimmed)) {
          return null;
        }

        // 重要提示框
        if (isHighlight(trimmed)) {
          return (
            <div
              key={lIdx}
              className="text-sm bg-zinc-50 p-4 rounded-lg border border-zinc-100 text-zinc-600 leading-7"
            >
              <strong className="font-bold text-zinc-900">重要提示：</strong>
              <span>{trimmed.replace("【重要提示】", "")}</span>
            </div>
          );
        }

        // 子编号标题 (4.1, 5.2 等)
        if (isSubNumberedHeading(trimmed)) {
          return (
            <h4
              key={lIdx}
              className="text-base font-medium text-zinc-800 mt-8 mb-0 font-sans"
            >
              {formatText(trimmed)}
            </h4>
          );
        }

        // 章节标题
        if (isSectionHeading(trimmed)) {
          return (
            <h3
              key={lIdx}
              className="text-xl font-medium text-zinc-900 mt-10 mb-2 font-sans tracking-wide"
            >
              {formatText(trimmed)}
            </h3>
          );
        }

        // 子标题
        if (isSubHeading(trimmed)) {
          return (
            <h4
              key={lIdx}
              className="text-base font-medium text-zinc-800 mt-8 mb-0 font-sans"
            >
              {formatText(trimmed)}
            </h4>
          );
        }

        // 子列表项 ((1) (2) • -)
        if (
          /^[（(][0-9]+[）)]/.test(trimmed) ||
          trimmed.startsWith("•") ||
          /^\-[\s]/.test(trimmed)
        ) {
          return (
            <p
              key={lIdx}
              className="text-sm leading-8 text-zinc-600"
            >
              {formatText(trimmed)}
            </p>
          );
        }

        // 普通段落
        return (
          <p key={lIdx} className="text-zinc-600 leading-8">
            {formatText(trimmed)}
          </p>
        );
      })}
    </>
  );
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
  const sections = flatContent.map((text, index) => {
    const firstLine = text.split(/\r?\n/)[0].trim();
    // 提取编号作为 ID：1. 隐私权 → terms-1，24. AI 测肤顾问 → terms-24
    const numMatch = firstLine.match(/^(\d+)\./);
    const id = numMatch ? `terms-${numMatch[1]}` : `terms-intro`;
    return { id, title: firstLine, content: text };
  });

  return (
    <div className="bg-white min-h-screen pt-24 pb-0">
      {/* Header Section */}
      <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16 mb-16">
        <div className="max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-normal text-zinc-900 mb-6">
            {pageTitle.zh}
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500">
            <p>生效日期：{lastUpdated}</p>
            <span
              className="hidden sm:block w-1 h-1 rounded-full bg-zinc-300"
              aria-hidden="true"
            />
            <p>最后更新：{lastUpdated}</p>
          </div>
          <p className="mt-6 text-zinc-500 leading-relaxed max-w-2xl">
            {content.description ||
              "在使用我们的服务前，请仔细阅读以下条款。"}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          {/* Mobile TOC - Dropdown */}
          <div className="lg:hidden mb-4">
            <TableOfContents sections={sections} />
          </div>

          {/* Sticky Sidebar Navigation */}
          <ScrollSpySidebar sections={sections} label="服务条款目录导航" />

          {/* Main Content */}
          <main className="flex-1 max-w-4xl text-zinc-800 leading-relaxed space-y-16 font-songti">
            {sections.map((section, sIdx) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-32"
              >
                <h2 className="text-2xl font-medium text-zinc-900 mb-8 font-sans tracking-wide">
                  {section.title}
                </h2>
                <div className="space-y-6">
                  <ContentParagraph text={section.content} isFirst />
                </div>

                {/* 隐私政策引用 - 仅在第一个章节 */}
                {sIdx === 1 && (
                  <div className="mt-8 p-5 bg-zinc-50 rounded-xl border border-zinc-100">
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      有关我们如何收集、使用和保护您的个人信息的详细说明，请参阅我们的{" "}
                      <Link
                        href="/privacy"
                        className="text-[#00263E] underline decoration-zinc-300 underline-offset-4 hover:decoration-[#00263E] transition-all font-medium"
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
      <footer className="mt-24 border-t border-zinc-100">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16 py-8">
          <p className="text-xs text-zinc-400">
            &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司版权所有。
          </p>
        </div>
      </footer>
    </div>
  );
}
