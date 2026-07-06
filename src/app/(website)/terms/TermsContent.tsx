import TableOfContents from "@/components/ui/TableOfContents";
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

function ContentParagraph({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);

  return (
    <>
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // 特殊：大标题转换
        if (trimmed === "《服务条款》摘要") {
          return (
            <h3
              key={lIdx}
              className="text-xl font-medium text-zinc-900 mt-10 mb-2 font-sans tracking-wide"
            >
              中国消费者服务条款
            </h3>
          );
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
  const tabsContent = content.tabs;

  // 确保章节按逻辑顺序排列
  const sectionOrder: TermsTabId[] = [
    "general",
    "product",
    "responsibility",
    "dispute",
  ];
  const allSections = sectionOrder.map((id, index) => ({
    id,
    title: `${index + 1}. ${tabsContent?.[id]?.title || id}`,
    rawTitle: tabsContent?.[id]?.title || id,
    content: tabsContent?.[id]?.content || [],
  }));

  // 只显示有内容的章节
  const sections = allSections.filter((s) => s.content.length > 0);

  return (
    <div className="bg-white min-h-screen pt-24 pb-20">
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

          {/* Sticky Sidebar Navigation - 多个章节时显示 */}
          {sections.length > 1 && (
            <aside className="hidden lg:block w-72 shrink-0">
              <div className="sticky top-32">
                <nav className="flex flex-col space-y-1" aria-label="服务条款目录导航">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="group flex flex-col py-3 px-4 border-l border-zinc-200 hover:border-[#00263E] transition-all duration-200"
                    >
                      <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-900 transition-colors">
                        {section.title}
                      </span>
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}

          {/* Main Content */}
          <main className="flex-1 max-w-4xl text-zinc-800 leading-relaxed space-y-16 font-songti">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-32"
              >
                <h2 className="text-2xl font-medium text-zinc-900 mb-8 font-sans tracking-wide">
                  {section.rawTitle}
                </h2>
                <div className="space-y-6">
                  {section.content.map((paragraph, pIdx) => (
                    <ContentParagraph key={pIdx} text={paragraph} />
                  ))}
                </div>

                {/* 隐私政策引用 - 仅在 general 章节 */}
                {section.id === "general" && (
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

            {/* Footer */}
            <footer className="pb-20 pt-8 border-t border-zinc-100">
              <p className="text-xs text-zinc-400">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
