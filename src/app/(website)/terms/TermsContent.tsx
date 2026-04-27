"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TermsPageContent, TermsTabId } from "@/types/page-content";

interface TermsContentProps {
  content: TermsPageContent;
}

/**
 * 服务条款页面内容组件 - 2024 重构版
 * 改为单页长滚动布局 + 侧边目录导航
 */
export function TermsContent({ content }: TermsContentProps) {
  const [activeSection, setActiveSection] = useState<string>("general");


  // 从 content 中获取数据
  const pageTitle = content.pageTitle || { en: "TERMS OF SERVICE", zh: "服务条款" };
  const description = content.description || "在使用我们的服务前，请仔细阅读以下条款";
  const _lastUpdated = content.lastUpdated || "2026年1月1日";
  const tabsContent = content.tabs;

  // 确保章节按逻辑顺序排列
  const sectionOrder: TermsTabId[] = ["general", "product", "responsibility", "dispute"];
  const sections = sectionOrder.map(id => ({
    id,
    title: tabsContent?.[id]?.title || id,
    content: tabsContent?.[id]?.content || [],
    index: sectionOrder.indexOf(id) + 1
  }));

  // 引用滚动容器
  const mainRef = useRef<HTMLElement>(null);

  // 处理滚动高亮
  const handleScroll = () => {
    if (!mainRef.current) return;

    const containerRect = mainRef.current.getBoundingClientRect();
    const triggerPoint = containerRect.top + 120; // 触发线：距离容器顶部 120px

    let currentId = sections[0].id;

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top <= triggerPoint) {
        currentId = section.id;
      } else {
        break;
      }
    }

    if (currentId !== activeSection) {
      setActiveSection(currentId);
    }
  };

  // 平滑滚动函数
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element && mainRef.current) {
      // 计算元素相对于容器的位置
      const top = element.offsetTop;
      mainRef.current.scrollTo({
        top: top,
        behavior: "smooth"
      });
    }
  };

  // 格式化文本：在中英文/数字之间添加空格
  const formatText = (text: string) => {
    return text
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="safe-area-content !pointer-events-none"
    >
      <div className="flex h-full flex-col items-center pointer-events-none">
        {/* 主内容卡片容器 */}
        <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl pointer-events-auto relative shadow-2xl shadow-black/5">

          <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
            {/* 顶栏 / Logo 区 */}
            <header className="flex-shrink-0 px-4 pt-1 pb-4 text-center sm:pt-2 sm:pb-6 lg:pt-4 lg:pb-8">
              {/* Logo 保持在顶端 */}
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <div className="relative h-[32px] w-[152px] sm:h-10 sm:w-[200px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="公司标志"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </m.div>
            </header>

            {/* 分割线 */}
            <div className="mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

            {/* 标题区 */}
            <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8">
              <h1 className="font-serif text-[26px] text-brand-charcoal sm:text-[32px]">
                {pageTitle.zh}
              </h1>
              <p className="mt-2 mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60">
                {description}
              </p>
            </div>

            {/* 布局：目录导航 + 条款内容 */}
            <div className="flex flex-1 overflow-hidden relative mx-auto w-full max-w-7xl">

              {/* 左侧导航 - 更加精致的排版 */}
              <aside className="hidden w-48 flex-shrink-0 border-r border-brand-charcoal/5 lg:flex flex-col items-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <nav className="space-y-6 w-full px-6 pt-4">
                  <div className="flex items-center gap-3 px-2 opacity-80">
                    <p className="text-sm font-bold text-brand-charcoal">
                      目录
                    </p>
                  </div>

                  <div className="flex flex-col space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={cn(
                          "group relative flex w-full items-center py-3 px-2 text-left transition-all duration-300 rounded-lg hover:bg-brand-charcoal/5",
                          activeSection === section.id
                            ? "text-brand-charcoal"
                            : "text-brand-charcoal/60"
                        )}
                      >
                        <span className={cn(
                          "text-sm tabular-nums transition-all duration-300 mr-2 font-medium",
                          activeSection === section.id ? "opacity-100 font-semibold" : "opacity-60 group-hover:opacity-100"
                        )}>
                          0{section.index}
                        </span>
                        <span className={cn(
                          "text-sm font-medium transition-all duration-300",
                          activeSection === section.id ? "font-bold translate-x-1" : "group-hover:translate-x-1"
                        )}>
                          {section.title}
                        </span>

                        {/* 激活状态指示点 - 调整位置 */}
                        {activeSection === section.id && (
                          <m.div
                            layoutId="active-dot"
                            className="absolute right-2 h-1 w-1 rounded-full bg-brand-gold"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </nav>
              </aside>

              {/* 右侧内容区域 - 极简主义排版 */}
              <main
                ref={mainRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                <div className="max-w-6xl px-6 lg:px-12">
                  <div className="space-y-24">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24 group relative"
                      >
                        {/* 章节内容 */}
                        <div className="space-y-4 pl-2 lg:pl-6">
                          {(!section.content || section.content.length === 0) ? (
                            <p className="text-sm text-gray-500 italic">内容更新中...</p>
                          ) : (
                            section.content.map((paragraph, pIdx) => {
                              const lines = paragraph.split(/\r?\n/);
                              return (
                                <div key={pIdx} className="space-y-2">
                                  {lines.map((line, lIdx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={lIdx} className="h-2" />;

                                    // 条款内标题 (一、二、...)
                                    if (/^[一二三四五六七八九十0-9]+[、.]/.test(trimmed)) {
                                      return (
                                        <h3 key={lIdx} className="pt-4 font-serif text-lg font-bold text-gray-900">
                                          {formatText(trimmed)}
                                        </h3>
                                      );
                                    }

                                    // 列表项 (•)
                                    if (trimmed.startsWith('•')) {
                                      return (
                                        <div key={lIdx} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold/60" />
                                          <p className="flex-1 opacity-90">{formatText(trimmed.substring(1).trim())}</p>
                                        </div>
                                      );
                                    }

                                    // 普通段落
                                    return (
                                      <p key={lIdx} className="text-sm leading-7 text-gray-700 opacity-90 text-justify">
                                        {formatText(trimmed)}
                                      </p>
                                    );
                                  })}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    ))}
                  </div>


                </div>
              </main>
            </div>

            {/* 底部版权信息 - 固定在卡片底部 */}
            <div className="mt-auto pt-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12">
              <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>

        {/* 返回上页按钮 */}
        <button
          onClick={() => typeof window !== "undefined" && window.history.back()}
          className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3 pointer-events-auto"
        >
          <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
          <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
        </button>
      </div>
    </m.div>
  );
}

