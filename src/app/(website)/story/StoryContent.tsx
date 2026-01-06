"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

// 展开内容的 Section ID 类型
type SectionId = "story" | "mission" | "philosophy" | "awards";

// 导航项配置
const navItems: { id: SectionId; label: string }[] = [
  { id: "story", label: "品牌故事" },
  { id: "mission", label: "公司使命" },
  { id: "philosophy", label: "品牌哲学" },
  { id: "awards", label: "媒体及获奖" },
];



/**
 * 品牌故事页面内容组件
 * 样式参考 about us.html，使用建筑风格布局
 * 保留展开/收起交互模式
 */
export function StoryContent() {
  // 展开状态: false=完全收起(只剩按钮), true=完全展开(底部导航隐藏)
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("story");

  const contentRef = useRef<HTMLDivElement>(null);
  const { setDrawerOpen } = useLayout();


  // 组件加载后自动展开，实现"抽屉下拉"动画
  useEffect(() => {
    // 稍微延迟以展示"下拉"动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

      {/* 内容区域容器 - 紧贴顶部，使用 framer-motion 统一控制动画 */}
      <m.div
        className="safe-area-content !top-0"
        transition={{
          duration: 0.8,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 about us.html 风格 */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              style={{ willChange: "flex-grow" }}
              initial={{ flexGrow: 0, flexBasis: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                flexBasis: 0
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                // 展开时延迟0.4s等待导航栏收起（大幅重叠以消除视觉间隔）；收起时不延迟
                delay: isExpanded ? 0.3 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />

              {/* 建筑风格装饰线条 - 渐变淡出 + 绘制动画 + 呼吸脉动 - 仅桌面端显示 */}
              <AnimatePresence>
                {isExpanded && (
                  <>
                    {/* 左侧竖线 - 渐变从中间向两端淡出 */}
                    <m.div
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      exit={{ scaleY: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute top-0 bottom-0 hidden w-px origin-center animate-[breathe_4s_ease-in-out_infinite] sm:left-10 sm:block lg:left-20"
                      style={{
                        background: "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.12) 30%, rgba(0,38,62,0.12) 70%, transparent 100%)"
                      }}
                    />
                    {/* 右侧竖线 */}
                    <m.div
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      exit={{ scaleY: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                      className="pointer-events-none absolute top-0 bottom-0 hidden w-px origin-center animate-[breathe_4s_ease-in-out_infinite_0.5s] sm:right-10 sm:block lg:right-20"
                      style={{
                        background: "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.12) 30%, rgba(0,38,62,0.12) 70%, transparent 100%)"
                      }}
                    />
                    {/* 顶部横线 - 渐变从中间向两端淡出 */}
                    <m.div
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      exit={{ scaleX: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                      className="pointer-events-none absolute left-0 right-0 hidden h-px origin-center animate-[breathe_4s_ease-in-out_infinite_1s] sm:top-16 sm:block lg:top-20"
                      style={{
                        background: "linear-gradient(to right, transparent 0%, rgba(0,38,62,0.12) 20%, rgba(0,38,62,0.12) 80%, transparent 100%)"
                      }}
                    />
                    {/* 底部横线 */}
                    <m.div
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      exit={{ scaleX: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                      className="pointer-events-none absolute left-0 right-0 hidden h-px origin-center animate-[breathe_4s_ease-in-out_infinite_1.5s] sm:bottom-16 sm:block lg:bottom-20"
                      style={{
                        background: "linear-gradient(to right, transparent 0%, rgba(0,38,62,0.12) 20%, rgba(0,38,62,0.12) 80%, transparent 100%)"
                      }}
                    />
                  </>
                )}
              </AnimatePresence>

              <div
                ref={contentRef}
                className={cn(
                  "relative z-10 flex h-full flex-col overflow-hidden pb-3",
                  !isExpanded && "hidden"
                )}
              >
                {/* ========== 移动端布局 - 参考 About us 移动端.html ========== */}
                <div className="relative flex h-full flex-col overflow-y-auto font-sans sm:hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {/* Background Texture Overlay */}
                  <div
                    className="pointer-events-none fixed inset-0 z-[1] opacity-[0.04]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                    }}
                  />



                  {/* Header - Sticky Top */}
                  <header className="sticky top-0 z-50 flex justify-center border-b border-[#00263e]/15 bg-[#F0EDE1] py-10 pb-5">
                    <div className="relative h-8 w-32">
                      <Image
                        src="/images/logo.png"
                        alt="NIHPLOD Logo"
                        fill
                        className="object-contain brightness-[0.2]"
                      />
                    </div>
                  </header>

                  {/* Navigation - Sticky below Header */}
                  <nav className="sticky top-[92px] z-40 flex justify-around border-b border-[#00263e]/15 bg-[#F0EDE1] px-[5%] py-3">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className="relative"
                      >
                        <span
                          className={cn(
                            "text-[13px] font-semibold uppercase tracking-[0.15em] transition-all duration-600",
                            activeSection === item.id ? "text-[#00263e] opacity-100" : "text-[#00263e] opacity-50"
                          )}
                        >
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </nav>

                  {/* 移动端内容区域 - 垂直滚动 */}
                  {/* Main Content Area */}
                  <div className="relative z-20 px-[8%] pb-10 pt-[40px]">
                    <AnimatePresence mode="wait">
                      {/* 移动端 Section 1: 品牌故事 */}
                      {activeSection === "story" && (
                        <m.section
                          key="story-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        >
                          <h2 className="relative mb-10 inline-block font-sans text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-0 after:h-px after:w-[80%] after:bg-gradient-to-r after:from-[#00263e] after:to-transparent">
                            Brand Story
                          </h2>

                          {/* 第一个内容块 */}

                          <div className="mb-6">
                            <span className="block text-[18px] font-normal leading-snug tracking-wide text-[#00263e]">
                              来自大自然的神奇修复力
                            </span>
                            <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              海豚的肌肤拥有每两小时自我更新的神奇能力。这种「逆转时光」的动物本能，是旎柏成立的灵感来源。
                            </p>
                            <div className="relative mt-6 w-full overflow-hidden border border-[#00263e]/15">
                              <Image
                                src="/images/story/dolphin-ocean.png"
                                alt="Dolphin Skin"
                                width={600}
                                height={400}
                                className="w-full grayscale-[20%] transition-transform duration-[1.2s] hover:scale-105"
                              />
                            </div>
                          </div>

                          {/* 第二个内容块 */}
                          <div className="mb-12">
                            <span className="mb-2.5 inline-block border border-[#00263e] px-2 py-0.5 text-[10px]">
                              2008 | 摩纳哥 | 联合实验室公司
                            </span>
                            <span className="mt-4 block text-[18px] font-normal leading-snug tracking-wide text-[#00263e]">
                              前沿科技赋能精简护理
                            </span>
                            <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              创始人 Dr. Stefan 博士和他的团队将前沿技术与精选的天然活性成分相结合，为每一款产品融入了前沿的科技和配方，使护肤调理变得简单、高效且美好。
                            </p>
                            <div className="relative mt-6 w-full overflow-hidden border border-[#00263e]/15">
                              <Image
                                src="/images/story/lab-research.png"
                                alt="Science"
                                width={600}
                                height={400}
                                className="w-full grayscale-[20%] transition-transform duration-[1.2s] hover:scale-105"
                              />
                            </div>
                          </div>
                        </m.section>
                      )}

                      {/* 移动端 Section 2: 公司使命 */}
                      {activeSection === "mission" && (
                        <m.section
                          key="mission-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        >
                          <h2 className="relative mb-10 inline-block font-sans text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-0 after:h-px after:w-[80%] after:bg-gradient-to-r after:from-[#00263e] after:to-transparent">
                            Our Mission
                          </h2>

                          <div className="mb-12">
                            <div className="relative my-5 h-[450px] w-full overflow-hidden border border-[#00263e]/15">
                              <Image
                                src="/images/story/mission-image.png?v=2"
                                alt="Mission"
                                fill
                                className="object-cover object-top"
                              />
                            </div>
                            <p className="mt-10 text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                            </p>
                            <span className="mt-8 block text-[18px] font-normal leading-[1.6] tracking-wide text-[#00263e]">
                              将逆转时光的不可能，<br />慢慢变得「有可能」。
                            </span>

                            {/* CEO 签名 */}
                            <div className="mt-16 text-right">
                              <span className="mb-2 block text-[10px] uppercase tracking-[0.15em] opacity-50">
                                CHIEF EXECUTIVE OFFICER
                              </span>
                              <div className="flex justify-end mt-2">
                                <Image
                                  src="/images/story/mission-decoration.svg"
                                  alt="John Morrell"
                                  width={120}
                                  height={32}
                                  className="opacity-90"
                                />
                              </div>
                            </div>
                          </div>
                        </m.section>
                      )}

                      {/* 移动端 Section 3: 品牌哲学 */}
                      {activeSection === "philosophy" && (
                        <m.section
                          key="philosophy-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        >
                          <h2 className="relative mb-10 inline-block font-sans text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-0 after:h-px after:w-[80%] after:bg-gradient-to-r after:from-[#00263e] after:to-transparent">
                            Philosophy
                          </h2>

                          <div className="mb-12 flex flex-col">
                            {[
                              { num: "01", title: "更珍贵的产品", desc: "我们通过采集这个世上优质的原材料，结合前沿及有效的科技力量，不断更新和进步。" },
                              { num: "02", title: "更优越的体验", desc: "通过严选的供应渠道，极致的专员服务，我们力求为你做到最满意、舒适及专业。" },
                              { num: "03", title: "更积极的方式", desc: "我们提倡以健康的心态去面对每一天。通过适量的运动，合理的膳食及平衡的心理。" },
                              { num: "04", title: "更艰巨的责任", desc: "我们将售出的每款产品的 2% 捐赠给全球的慈善组织和非营利组织，包括 UNF、SPF 等。" },
                            ].map((item, index, arr) => (
                              <div
                                key={item.num}
                                className={cn(
                                  "group relative py-8",
                                  index !== arr.length - 1 && "border-b border-[#00263e]/10"
                                )}
                              >
                                {/* Watermark Number */}
                                <span className="absolute top-6 right-0 z-0 font-serif text-[60px] italic leading-none text-[#00263e]/5 select-none">
                                  {item.num}
                                </span>

                                {/* Content */}
                                <div className="relative z-10 pl-2 pt-4">
                                  <span className="mb-4 block text-[16px] font-semibold tracking-[0.1em] text-[#00263e]">
                                    {item.title}
                                  </span>
                                  <p className="text-[14px] font-light leading-[1.8] text-[#00263e]/80 text-justify">
                                    {item.desc}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </m.section>
                      )}

                      {/* 移动端 Section 4: 媒体获奖 */}
                      {activeSection === "awards" && (
                        <m.section
                          key="awards-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        >
                          <h2 className="relative mb-10 inline-block font-sans text-[24px] font-normal uppercase tracking-[0.2em] text-[#00263e] after:absolute after:-bottom-2.5 after:left-0 after:h-px after:w-[80%] after:bg-gradient-to-r after:from-[#00263e] after:to-transparent">
                            Recognition
                          </h2>
                          <div className="mb-12">
                            {/* 奖项列表 */}
                            <ul className="list-none">
                              {[
                                { year: "2023", title: "VOGUE BEAUTY AWARDS", image: "/images/story/award-1.png" },
                                { year: "2022", title: "ELLE SKINCARE INNOVATION", image: "/images/story/award-2.png" },
                                { year: "2022", title: "BAZAAR BEST FORMULA", image: "/images/story/award-3.png" },
                                { year: "2021", title: "GLOBAL COSMETIC DESIGN", image: "/images/story/award-1.png" },
                              ].map((award, idx) => (
                                <li
                                  key={idx}
                                  className="border-b border-[#00263e]/15 py-8"
                                >
                                  {/* Award Image */}
                                  <div className="relative mb-6 h-[200px] w-full overflow-hidden bg-[#F0EDE1]">
                                    <Image
                                      src={award.image}
                                      alt={award.title}
                                      fill
                                      className="object-contain object-center"
                                    />
                                  </div>

                                  <div className="flex flex-col items-center gap-2 text-center">
                                    <span className="text-[16px] font-medium uppercase tracking-wide text-[#00263e]">
                                      {award.title}
                                    </span>
                                    <span className="text-[12px] font-light tracking-wider text-[#00263e]/60">
                                      {award.year}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>


                          </div>
                        </m.section>
                      )}
                    </AnimatePresence>


                  </div>
                </div>

                {/* ========== 桌面端布局 - 保持原有样式 ========== */}
                <div className="hidden h-full flex-col sm:flex">
                  {/* 顶部导航栏 */}
                  <AnimatePresence mode="wait">
                    {isExpanded && (
                      <m.nav
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="flex h-16 items-center justify-between px-10 lg:h-20 lg:px-20"
                      >
                        {/* 左侧：Logo */}
                        <div className="relative h-8 w-24">
                          <Image
                            src="/images/logo.png"
                            alt="NIHPLOD Logo"
                            fill
                            className="object-contain brightness-[0.2]"
                          />
                        </div>

                        {/* 中间：导航链接 */}
                        <div className="absolute left-1/2 flex -translate-x-1/2 gap-8 lg:gap-10">
                          {navItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActiveSection(item.id)}
                              className={cn(
                                "relative px-1 py-1 text-xs uppercase tracking-[2px] transition-opacity duration-300 lg:text-[13px]",
                                activeSection === item.id
                                  ? "font-medium text-[#00263e] opacity-100"
                                  : "text-[#00263e] opacity-60 hover:opacity-80"
                              )}
                            >
                              {item.label}
                              {/* 下划线指示器 */}
                              {activeSection === item.id && (
                                <m.div
                                  layout
                                  layoutId="activeTabIndicator"
                                  className="absolute bottom-0 left-0 h-px w-full bg-[#00263e]"
                                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* 右侧：占位 */}
                        <div className="w-24" />
                      </m.nav>
                    )}
                  </AnimatePresence>

                  {/* 内容区域 - 各 Section */}
                  <div className="flex-1 overflow-y-auto px-10 py-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] lg:px-20 lg:py-12 xl:py-14">
                    <AnimatePresence mode="wait">
                      {/* Section 1: 品牌故事 */}
                      {activeSection === "story" && (
                        <m.div
                          key="story"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="grid h-full grid-cols-1 items-center gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12 xl:gap-16"
                        >
                          {/* 左侧图片区域 */}
                          <div className="relative flex h-full flex-col justify-center gap-4 pl-6 lg:pl-8">
                            <div className="relative h-52 w-[70%] self-start overflow-hidden bg-[#e5e2d5] lg:h-64">
                              <Image
                                src="/images/story/dolphin-ocean.png"
                                alt="大自然"
                                fill
                                className="object-cover grayscale-[20%] transition-transform duration-[1.5s] hover:scale-105"
                              />
                            </div>
                            <div className="relative -mt-10 ml-auto h-64 w-[80%] overflow-hidden border-8 border-[#F0EDE1] bg-[#e5e2d5] lg:-mt-14 lg:h-80">
                              <Image
                                src="/images/story/lab-research.png"
                                alt="科技"
                                fill
                                className="object-cover grayscale-[20%] transition-transform duration-[1.5s] hover:scale-105"
                              />
                            </div>
                          </div>

                          {/* 右侧文字区域 */}
                          <div className="pl-0 lg:pl-10">
                            <span className="mb-3 block text-sm uppercase tracking-[5px] text-[#00263e]/60">
                              Since 2008 | Monaco
                            </span>
                            <h2 className="mb-8 text-4xl font-light leading-tight tracking-[8px] text-[#00263e] lg:text-[42px]">
                              来自大自然的<br />神奇修复力
                            </h2>
                            <p className="max-w-md text-[15px] leading-[2] tracking-wide text-[#00263e]/75">
                              海豚的肌肤拥有每两小时自我更新的神奇能力。这种「逆转时光」的动物本能，是旎柏成立的灵感来源。所以我们将「DOLPHIN」这个单词逆转，这就是 NIHPLOD。
                              <br /><br />
                              创始人 Dr. Stefan 博士和他的团队，将前沿技术与精选的天然活性成分相结合，为每一款产品融入了前沿的科技和配方，使护肤调理变得简单、高效且美好。
                            </p>
                          </div>
                        </m.div>
                      )}

                      {/* Section 2: 公司使命 */}
                      {activeSection === "mission" && (
                        <m.div
                          key="mission"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="flex h-full items-center justify-center pb-16 lg:pb-24"
                        >
                          <div className="relative flex w-full max-w-5xl flex-col lg:flex-row">
                            {/* 左侧图片 */}
                            <div className="relative h-64 w-full overflow-hidden lg:h-auto lg:flex-[1.2]">
                              <Image
                                src="/images/story/mission-image.png?v=2"
                                alt="护肤专家"
                                fill
                                className="object-cover object-top"
                              />
                            </div>
                            {/* 右侧文字卡片 */}
                            <div className="z-10 flex flex-1 flex-col items-start justify-center bg-[#DDD9C9] p-12 shadow-[0_4px_20px_rgba(0,38,62,0.04),0_20px_60px_rgba(0,0,0,0.06)] lg:-ml-16 lg:my-10 lg:p-16">
                              <span className="mb-2 text-sm uppercase tracking-[4px] text-[#00263e]/70">
                                Our Mission
                              </span>
                              <h2 className="mb-8 text-4xl font-light leading-tight tracking-[8px] text-[#00263e] lg:text-[42px]">
                                化繁为简<br />逆转时光
                              </h2>
                              <p className="max-w-md text-[15px] leading-[1.8] text-[#00263e]/80">
                                旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                                <br /><br />
                                将逆转时光的不可能，慢慢变得「有可能」。
                              </p>
                              <div className="mt-10 w-full border-t border-[#00263e]/30 pt-4">
                                <span className="block text-xs uppercase tracking-[4px] text-[#00263e]/70">CEO</span>
                                <Image
                                  src="/images/story/mission-decoration.svg"
                                  alt="John Morrell"
                                  width={150}
                                  height={40}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          </div>
                        </m.div>
                      )}

                      {/* Section 3: 品牌哲学 */}
                      {activeSection === "philosophy" && (
                        <m.div
                          key="philosophy"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="mx-4 grid h-[calc(100%-3rem)] grid-cols-2 gap-px self-center bg-[#00263e]/10 lg:mx-6 lg:h-[calc(100%-4rem)] lg:grid-cols-4"
                        >
                          {[
                            { num: "01", title: "更珍贵的产品", desc: "我们通过采集这个世上优质的原材料，结合前沿及有效的科技力量，不断更新和进步。" },
                            { num: "02", title: "更优越的体验", desc: "通过严选的供应渠道，极致的专员服务，我们力求为你做到最满意、舒适及专业。" },
                            { num: "03", title: "更积极的方式", desc: "我们提倡以健康的心态去面对每一天，通过适量的运动、合理的膳食及平衡的心理。" },
                            { num: "04", title: "更艰巨的责任", desc: "我们将售出的每款产品的 2% 捐赠给全球的慈善组织和非营利组织，包括 UNF、SPF 等。" },
                          ].map((item, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col justify-between bg-[#F0EDE1] p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-[#f7f5ef] hover:shadow-lg lg:p-10"
                            >
                              <span className="text-6xl font-thin text-[#00263e]/10">{item.num}</span>
                              <div className="mt-auto">
                                <h3 className="mb-5 text-lg tracking-[3px] text-[#00263e]">{item.title}</h3>
                                <p className="text-[13px] leading-[2] text-[#00263e]/80">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </m.div>
                      )}

                      {/* Section 4: 媒体及获奖 - 参考 ref media1.html 样式 */}
                      {activeSection === "awards" && (
                        <m.div
                          key="awards"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="flex h-full flex-col px-5 pb-16 pt-5 lg:px-6 lg:pb-20 lg:pt-6"
                        >
                          {/* 3x2 网格卡片布局 - 铺满容器 */}
                          <div className="grid h-full grid-cols-3 grid-rows-2 gap-4 lg:gap-5">
                            {[
                              { year: "2023", title: "VOGUE BEAUTY AWARDS - 年度突破奖" },
                              { year: "2022", title: "ELLE 护肤科技金奖" },
                              { year: "2022", title: "年度最具影响力可持续品牌" },
                              { year: "2021", title: "BAZAAR 极致修护精华大奖" },
                              { year: "2020", title: "Monaco Bio-Tech Innovation Lab Partner" },
                              { year: "2019", title: "GLOBAL CHARITY PARTNER: UNF" },
                            ].map((award, idx) => (
                              <m.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                                className="group flex flex-col justify-center border border-[#00263e]/15 bg-[#F0EDE1]/50 p-6 transition-all duration-500 hover:border-[#00263e]/40 hover:bg-white/30 lg:p-8"
                              >
                                <span className="mb-3 text-xs tracking-[2px] text-[#00263e]/50 lg:text-sm">
                                  {award.year}
                                </span>
                                <span className="text-base font-normal leading-relaxed tracking-wide text-[#00263e] lg:text-lg">
                                  {award.title}
                                </span>
                              </m.div>
                            ))}
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

              </div>
            </m.div>

            {/* 展开/收起按钮 - 两阶段切换：收起↔展开 */}
            <button
              type="button"
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div >
      </m.div >

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
