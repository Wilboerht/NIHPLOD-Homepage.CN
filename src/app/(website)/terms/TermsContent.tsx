"use client";

import { useState } from "react";
import ScrollSpySidebar from "@/components/ui/ScrollSpySidebar";
import { StandaloneNav } from "@/components/ui/StandaloneNav";
import { TermsArticle, buildTermsSections } from "@/components/ui/TermsArticle";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
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
  const flatContent = content.tabs?.general?.content || [];
  const [tocOpen, setTocOpen] = useState(false);

  // 章节拆分逻辑与正文渲染已抽取至 @/components/ui/TermsArticle（/terms/embed 嵌入页复用）
  const sections = buildTermsSections(flatContent);

  return (
    <div className="mb-[-7rem] flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] pt-[100px] md:pt-32 lg:mb-[-6rem]">
      <StandaloneNav
        title="服务条款"
        links={[
          { href: "/contact", label: "联系我们" },
          { href: "/privacy", label: "隐私政策" },
        ]}
        leftButton={{ label: "章节目录", onClick: () => setTocOpen(true) }}
      />

      <div className="container mx-auto px-6 md:px-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-24">
          {/* Sticky Sidebar Navigation */}
          <ScrollSpySidebar sections={sections} label="服务条款目录导航" />

          {/* Main Content */}
          <TermsArticle sections={sections} />
        </div>
      </div>

      {/* Page Footer */}
      <footer className="mt-12 md:mt-24 md:border-t md:border-brand-charcoal/10">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 md:py-10 lg:px-12 xl:px-16">
          <p className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
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

      {/* 移动端章节目录模态框 */}
      <AnimatePresence>
        {tocOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex flex-col bg-[#fefcf8] md:hidden"
          >
            {/* Header */}
            <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-brand-charcoal/[0.06] px-6">
              <span className="text-[15px] font-normal tracking-[0.1em] text-brand-charcoal">
                章节目录
              </span>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭目录"
              >
                <X className="h-4 w-4 text-brand-charcoal/50" strokeWidth={1.5} />
              </button>
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setTocOpen(false);
                      setTimeout(() => {
                        const el = document.getElementById(section.id);
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }, 300);
                    }}
                    className="rounded-lg px-4 py-3 text-left text-[14px] font-light leading-[1.6] tracking-[0.04em] text-brand-charcoal/70 transition-colors active:bg-brand-charcoal/[0.03]"
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
