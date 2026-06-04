"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";

// 隐私政策内容数据
interface SectionContent {
  title: string;
  content: string[];
}

const privacyData: Record<string, SectionContent> = {
  summary: {
    title: "摘要",
    content: [
      "《隐私政策》摘要\n\n• 待补充\n• 待补充\n• 待补充\n• 待补充\n• 待补充\n• 待补充\n• 待补充\n• 待补充",
    ],
  },
  ch1: {
    title: "一、个人信息处理者信息",
    content: [
      "一、个人信息处理者信息\n\n待补充",
    ],
  },
  ch2: {
    title: "二、本隐私政策范围",
    content: [
      "二、本隐私政策范围\n\n待补充",
    ],
  },
  ch3: {
    title: "三、我们处理个人信息的法律依据",
    content: [
      "三、我们处理个人信息的法律依据\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
    ],
  },
  ch4: {
    title: "四、我们如何收集您的个人信息",
    content: [
      "四、我们如何收集您的个人信息\n\n待补充",
    ],
  },
  ch5: {
    title: "五、按场景列示的信息收集与使用",
    content: [
      "五、按场景列示的信息收集与使用\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
      "（七）待补充\n\n待补充",
      "（八）待补充\n\n待补充",
      "（九）待补充\n\n待补充",
    ],
  },
  ch6: {
    title: "六、敏感个人信息处理规则",
    content: [
      "六、敏感个人信息处理规则\n\n待补充",
    ],
  },
  ch7: {
    title: "七、儿童个人信息保护",
    content: [
      "七、儿童个人信息保护\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
    ],
  },
  ch8: {
    title: "八、设备权限管理",
    content: [
      "八、设备权限管理\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
    ],
  },
  ch9: {
    title: "九、共享与披露",
    content: [
      "九、共享与披露\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
      "（七）待补充\n\n待补充",
      "（八）待补充\n\n待补充",
    ],
  },
  ch10: {
    title: "十、Cookies 与广告",
    content: [
      "十、Cookies 与广告\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
    ],
  },
  ch11: {
    title: "十一、信息保护",
    content: [
      "十一、信息保护\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
    ],
  },
  ch12: {
    title: "十二、您的权利",
    content: [
      "十二、您的权利\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
    ],
  },
  ch13: {
    title: "十三、联系我们",
    content: [
      "十三、联系我们\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
    ],
  },
};

export function PrivacyContent() {
  const [activeSection, setActiveSection] = useState<string>("summary");
  const mainRef = useRef<HTMLElement>(null);

  const pageTitle = { en: "PRIVACY POLICY", zh: "隐私政策" };
  const description = "我们重视并尊重您的隐私，了解我们如何收集、使用和保护您的个人信息";
  const _lastUpdated = "2026年5月31日";

  const sectionOrder = ["summary", "ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch9", "ch10", "ch11", "ch12", "ch13"];
  const sections = sectionOrder.map((id, index) => ({
    id,
    title: privacyData[id].title,
    content: privacyData[id].content,
    index: index + 1
  }));

  // 格式化文本：在中英文/数字之间添加空格
  const formatText = (text: string) => {
    return text
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  };

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

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="safe-area-content !pointer-events-none max-lg:!inset-0"
    >
      <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
        {/* 主内容卡片容器 */}
        <div className="w-full flex-1 overflow-hidden rounded-none lg:rounded-3xl bg-[#F0EDE1] lg:bg-[#F8F7F3] pointer-events-auto relative">
          {/* 手机端背景水印 */}
          <div className="lg:hidden absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <Image
              src="/images/watermark-mobile.png"
              alt=""
              fill
              className="object-cover opacity-75 blur-[7.5px]"
              priority
            />
          </div>

          <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
            {/* 顶栏 / Logo 区 */}
            <header className="flex-shrink-0 text-center sm:px-4 sm:pt-2 sm:pb-6 lg:pt-4 lg:pb-8">
              {/* 手机端顶部栏 */}
              <div className="lg:hidden relative flex-shrink-0 h-[88px] w-full flex items-center justify-center pointer-events-auto">
                <button
                  onClick={() => typeof window !== "undefined" && window.history.back()}
                  className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                </button>
                <Link href="/" className="flex items-center justify-center py-[30px]">
                  <div className="relative h-[28px] w-[100px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD Logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </Link>
              </div>
              {/* Logo - 桌面端 */}
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="hidden lg:flex justify-center"
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

            {/* 分割线 - 仅桌面端 */}
            <div className="hidden lg:block mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

            {/* 标题区 */}
            <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8 max-lg:px-0 max-lg:pt-[6px] max-lg:pb-4">
              <div>
                <h1 className="font-serif text-[26px] text-brand-charcoal sm:text-[32px] lg:text-brand-charcoal max-lg:text-[24px] max-lg:font-medium max-lg:tracking-[0.2em] max-lg:text-[#00263E]">
                  {pageTitle.zh}
                </h1>
                {/* 装饰短横线 - 仅移动端 */}
                <div className="lg:hidden mx-auto w-[70px] h-[1.5px] bg-[#00263E] max-lg:mt-2" />
                <p className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[14px] max-lg:font-light max-lg:leading-[1.8] max-lg:tracking-wide max-lg:text-[#00263E]/90 max-lg:mt-[34px]">
                  <span className="hidden lg:inline">{description}</span>
                  <span className="lg:hidden">我们重视并尊重您的隐私，<br />了解我们如何收集、使用和保护您的个人信息</span>
                </p>
              </div>
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
                  <div className="space-y-7">
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
                                    if (/^[一二三四五六七八九十0-9]+[、.]/.test(trimmed) || trimmed === '《隐私政策》摘要') {
                                      return (
                                        <h3 key={lIdx} className="pt-4 font-serif text-lg font-bold text-gray-900 break-words">
                                          {formatText(trimmed)}
                                        </h3>
                                      );
                                    }

                                    // 列表项 (•)
                                    if (trimmed.startsWith('•')) {
                                      return (
                                        <div key={lIdx} className="flex gap-3 text-sm leading-relaxed text-gray-700 min-w-0">
                                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold/60" />
                                          <p className="flex-1 opacity-90 break-words min-w-0">{formatText(trimmed.substring(1).trim())}</p>
                                        </div>
                                      );
                                    }

                                    // 普通段落
                                    return (
                                      <p key={lIdx} className="text-sm leading-7 text-gray-700 opacity-90 lg:text-justify break-words">
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
            <div className="mt-auto pt-4 pb-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12 max-lg:border-0 max-lg:pt-4">
              <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[#7B726C]/30 max-lg:tracking-[0.12em] max-lg:font-medium">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>

        {/* 返回上页按钮 - 仅桌面端 */}
        <button
          onClick={() => typeof window !== "undefined" && window.history.back()}
          className="hidden lg:flex group items-center justify-center gap-2 rounded-b-2xl bg-[#F8F7F3] px-10 py-2.5 lg:px-14 lg:py-3 pointer-events-auto"
        >
          <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
          <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
        </button>
      </div>
    </m.div>
  );
}
