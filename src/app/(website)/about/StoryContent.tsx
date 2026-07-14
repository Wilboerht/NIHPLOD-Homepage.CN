"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

// 展开内容的 Section ID 类型
type SectionId = "story" | "mission" | "philosophy" | "awards";

// 导航项配置
const navItems: { id: SectionId; label: string }[] = [
  { id: "story", label: "品牌故事" },
  { id: "mission", label: "公司使命" },
  { id: "philosophy", label: "品牌哲学" },
  { id: "awards", label: "奖项报导" },
];

const Watermark = () => (
  <>
    {/* PC 端水印 */}
    <div
      className="absolute inset-0 z-0 pointer-events-none opacity-[0.035] select-none hidden md:block"
      style={{
        backgroundImage: 'url(/images/watermark.webp)',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '160% auto',
      }}
    />
  </>
);

const AWARDS_DATA = [
  { year: "2026", org: "胡润百富", title: "国际高端护肤品牌最佳表现", image: "/images/story/awards/pc/hurun.webp" },
  { year: "2025", org: "亚洲女性友好品牌", title: "时空逆转成就奖", image: "/images/story/awards/pc/best.webp" },
  { year: "2024", org: "Timout Magazine", title: "年度影响力高奢品牌", image: "/images/story/awards/pc/timeout.webp" },
  { year: "2023", org: "罗博报告", title: "优中优选奖", image: "/images/story/awards/pc/robb.webp" },
  { year: "2020", org: "LUX Magazine", title: "消费者满意奖", image: "/images/story/awards/pc/lux.webp" },
  { year: "2019", org: "Prestige Magazine", title: "最佳创新化妆品奖", image: "/images/story/awards/pc/prestige.webp" },
  { year: "2018", org: "Wellness & SPA Innovation", title: "最佳治疗产品", image: "/images/story/awards/pc/wellness.webp" },
  { year: "2017", org: "Pure Beauty Global Awards", title: "最佳新晋抗衰老产品", image: "/images/story/awards/pc/purebeauty.webp" },
];



/**
 * 品牌故事页面内容组件
 * 样式参考 about us.html，使用建筑风格布局
 * 保留展开/收起交互模式
 */


export function StoryContent() {
  // 展开状态: false=完全收起(只剩按钮), true=完全展开(底部导航隐藏)
  const [isExpanded, setIsExpanded] = useState(false);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [handleHeight, setHandleHeight] = useState(0);

  useLayoutEffect(() => {
    if (!handleRef.current || typeof ResizeObserver === "undefined") return;

    const updateHandleHeight = () => {
      setHandleHeight(handleRef.current?.offsetHeight ?? 0);
    };

    updateHandleHeight();
    const observer = new ResizeObserver(updateHandleHeight);
    observer.observe(handleRef.current);

    return () => observer.disconnect();
  }, []);

  const [activeSection, setActiveSection] = useState<SectionId>("story");
  const [currentAwardPage, setCurrentAwardPage] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const { isDrawerOpen, setDrawerOpen } = useLayout();

  // 监听 LayoutContext 中的 isDrawerOpen 变化，同步本地 isExpanded 状态
  // 解决：点击底部导航栏时，setDrawerOpen(true) 不会触发本地状态更新的问题
  useEffect(() => {
    if (isDrawerOpen && !isExpanded) {
      setIsExpanded(true);
    } else if (!isDrawerOpen && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDrawerOpen, isExpanded]);


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

      {/* 内容区域容器 - 使用 framer-motion 统一控制动画 */}
      <m.div
        className="safe-area-content !-top-[1px] !pointer-events-none"
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
          className="h-full pointer-events-none"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
            {/* 主内容区域 + 按钮一起移动 */}
            <m.div
              className="relative z-20 flex h-full w-full flex-col"
              style={{ willChange: "transform" }}
              initial={{
                transform: handleHeight
                  ? `translate3d(0, calc(-100% + ${handleHeight}px), 0)`
                  : "translate3d(0, -100%, 0)"
              }}
              animate={{
                transform: isExpanded
                  ? "translate3d(0, 0, 0)"
                  : handleHeight
                    ? `translate3d(0, calc(-100% + ${handleHeight}px), 0)`
                    : "translate3d(0, -100%, 0)"
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                delay: isExpanded ? 0.3 : 0
              }}
            >
              <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-b-2xl bg-[#FAF5EA] lg:rounded-b-3xl pointer-events-auto">
                {/* 矿物纹理覆盖层 */}
                <div className="texture-overlay absolute inset-0" />

                {/* 品牌故事和公司使命的水印背景 - 放置在此处可贯穿整个面板，不被上下导航遮挡 */}
                <AnimatePresence>
                  {(activeSection === "story" || activeSection === "mission" || activeSection === "philosophy") && (
                    <m.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
                    >
                      <Watermark />
                    </m.div>
                  )}
                </AnimatePresence>

              {/* 建筑风格装饰线条 - 渐变淡出 + 绘制动画 + 呼吸脉动 - 仅桌面端显示 */}
              <AnimatePresence>
                {isExpanded && (
                  <>



                  </>
                )}
              </AnimatePresence>

                <div
                  className={cn(
                    "relative z-10 flex h-full flex-col overflow-hidden pb-3 transition-opacity duration-300",
                    isExpanded ? "opacity-100 delay-300" : "opacity-0 pointer-events-none"
                  )}
                >
                {/* ========== 移动端布局 - 参考 About us 移动端.html ========== */}
                <div className="relative flex h-full flex-col overflow-hidden lg:hidden">
                  {/* Background Texture Overlay */}
                  <div
                    className="pointer-events-none fixed inset-0 z-[1] opacity-[0.04]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                    }}
                  />

                  {/* Header - Mobile */}
                  <div className="flex h-[88px] shrink-0 items-center justify-center relative z-50">
                    <Link href="/" className="flex items-center justify-center mt-1">
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

                  {/* Navigation - Mobile Tab Bar */}
                  <div className="px-4 relative z-40 shrink-0">
                    <nav className="flex h-[37px] items-center rounded-full bg-[#FFFFFF] p-[4px]">
                      {navItems.map((item) => {
                        const isActive = activeSection === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(item.id);
                              contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="relative flex flex-1 items-center justify-center"
                            style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                          >
                            <span
                              className={cn(
                                "text-[13px] font-normal leading-[20px] whitespace-nowrap transition-all duration-300",
                                isActive
                                  ? "rounded-full bg-white px-2 py-[3px] text-[#00263E] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                                  : "text-[#7B726C]/60 hover:text-[#7B726C]/80"
                              )}
                            >
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>

                  {/* 移动端内容区域 - 垂直滚动 */}
                  {/* 页面主标题 - SEO用，视觉上隐藏 */}
                  <h1 className="sr-only">关于 NIHPLOD 旎柏</h1>

                  {/* Main Content Area */}
                  <div ref={contentRef} className="flex-1 overflow-y-auto flex flex-col relative z-20 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* 移动端 Section 1: 品牌故事 */}
                    {activeSection === "story" && (
                      <section className="relative pt-7 pb-4">
                        <div className="flex flex-col items-center mb-7">
                          <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E] text-center" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                            品牌故事
                          </h2>
                          <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                        </div>

                        <div className="px-6">
                          {/* 第一个内容块 */}
                          <div className="mb-6">
                            <span className="block text-[18px] font-normal leading-snug tracking-wide text-[#00263e]">
                              来自大自然的神奇修复力
                            </span>
                            <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              海豚的肌肤拥有每两小时自我更新的神奇能力。这种「逆转时光」的动物本能，是旎柏成立的灵感来源。
                            </p>
                            <div className="relative mt-6 w-full overflow-hidden border border-[#00263e]/10">
                              <Image
                                src="/images/story/dolphin-ocean.webp"
                                alt="Dolphin Skin"
                                width={600}
                                height={400}
                                className="w-full grayscale-[20%] transition-transform duration-[1.2s] hover:scale-105"
                              />
                            </div>
                          </div>

                          {/* 第二个内容块 */}
                          <div className="mb-6">
                            <span className="mb-2.5 inline-flex items-center gap-1.5 text-[11px]">
                              <Image src="/images/quote-icon.svg" alt="" width={32} height={32} className="w-8 h-8 opacity-30" />
                              2008 | 摩纳哥 | 联合实验室公司
                            </span>
                            <span className="mt-4 block text-[18px] font-normal leading-snug tracking-wide text-[#00263e]">
                              前沿科技赋能精简护理
                            </span>
                            <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              创始人 Dr. Stefan 博士和他的团队将前沿技术与精选的天然活性成分相结合，为每一款产品融入了前沿的科技和配方，使护肤调理变得简单、高效且美好。
                            </p>
                            <div className="relative mt-6 w-full overflow-hidden border border-[#00263e]/10">
                              <Image
                                src="/images/story/lab-research.webp"
                                alt="Science"
                                width={600}
                                height={400}
                                className="w-full grayscale-[20%] transition-transform duration-[1.2s] hover:scale-105"
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* 移动端 Section 2: 公司使命 */}
                    {activeSection === "mission" && (
                      <section className="relative pt-7 pb-4">
                        <div className="flex flex-col items-center mb-7">
                          <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E] text-center" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                            公司使命
                          </h2>
                          <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                        </div>

                        <div className="flex flex-col px-6 gap-4">
                          <div className="relative w-full overflow-hidden border border-[#00263e]/10 shadow-sm bg-white/20">
                            <Image
                              src="/images/story/mission-image.webp?v=2"
                              alt="Mission"
                              width={600}
                              height={800}
                              className="w-full h-auto object-contain"
                            />
                          </div>

                          <div className="flex flex-col gap-2.5">
                            <p className="text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                            </p>
                            <p className="text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                              将逆转时光的不可能，慢慢变得「有可能」。
                            </p>
                          </div>

                          {/* CEO 签名 */}
                          <div className="flex flex-col items-end gap-2.5">
                            <span className="text-[10px] leading-[15px] text-[#00263e]/50" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                              首席执行官
                            </span>
                            <Image
                              src="/images/story/mission-decoration.svg"
                              alt="John Morrell"
                              width={85}
                              height={22}
                              className="opacity-80"
                            />
                          </div>
                        </div>
                      </section>
                    )}

                    {/* 移动端 Section 3: 品牌哲学 */}
                    {activeSection === "philosophy" && (
                      <section className="relative pt-7 pb-4">
                        <div className="flex flex-col items-center mb-7 shrink-0">
                          <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E] text-center" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                            品牌哲学
                          </h2>
                          <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                        </div>

                        <div className="flex flex-col justify-center pb-6 px-6">
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { num: "01", title: "更珍贵的产品", desc: "通过采集优质原材料，结合前沿科技力量，不断更新与进步。" },
                              { num: "02", title: "更优越的体验", desc: "严选供应渠道，极致专员服务，力求专业、舒适与满意。" },
                              { num: "03", title: "更积极的方式", desc: "倡导健康心态，通过合理的膳食及平衡心理面对每一天。" },
                              { num: "04", title: "更艰巨的责任", desc: "将产品销售额的 2% 捐赠给全球慈善及非营利组织。" },
                            ].map((item) => (
                              <div
                                key={item.num}
                                className="flex flex-col justify-start rounded-lg bg-[#FFFFFF] p-4 gap-2"
                              >
                                <span className="text-[10px] font-light text-[#00263e]/30">{item.num}</span>
                                <h3 className="text-[14px] font-normal leading-[21px] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>{item.title}</h3>
                                <p className="text-[14px] font-light leading-[21px] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                  {item.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    {/* 移动端 Section 4: 媒体获奖 */}
                    {activeSection === "awards" && (
                      <section className="relative pt-7 pb-4">
                        <div className="flex flex-col items-center mb-7">
                          <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E] text-center" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                            媒体及获奖
                          </h2>
                          <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                        </div>
                        <div className="mb-6 px-6">
                          {/* 奖项列表 */}
                          <div className="flex flex-col gap-4">
                            {AWARDS_DATA.map((award, idx) => (
                              <div
                                key={idx}
                                className="flex flex-col border-[1.5px] border-[#FFFFFF]"
                              >
                                {/* Award Image */}
                                <div className="relative w-full overflow-hidden">
                                  <Image
                                    src={award.image}
                                    alt={award.title}
                                    width={600}
                                    height={400}
                                    className="w-full h-auto object-contain"
                                  />
                                </div>

                                <div className="flex flex-col items-center p-6 gap-2 text-center">
                                  <span className="text-[14px] font-normal leading-[21px] text-[#00263e]/50" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                    {award.org}
                                  </span>
                                  <h3 className="text-[16px] font-normal leading-[24px] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                    {award.title}
                                  </h3>
                                  <span className="text-[14px] font-light leading-[21px] text-[#00263e]/50" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                    {award.year}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Mobile Footer Copyright */}
                  <div className="flex flex-col items-center justify-center pt-3 pb-1">
                    <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(123,114,108,0.3)]" style={{ fontFamily: "'Futura', sans-serif" }}>
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>
                </div>

                {/* ========== 桌面端布局 - 保持原有样式 ========== */}
                <div className="hidden h-full flex-col lg:flex">
                  {/* 顶部导航栏 */}
                  <AnimatePresence mode="wait">
                    {isExpanded && (
                      <m.nav
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative flex h-[100px] flex-shrink-0 items-center justify-between px-[8%]"
                      >
                        {/* 左侧：Logo */}
                        <Link href="/">
                          <div className="relative h-8 w-[160px]">
                            <Image
                              src="/images/NIHPLOD-logo.svg"
                              alt="Logo"
                              fill
                              className="object-contain opacity-90 transition-opacity hover:opacity-70"
                              priority
                            />
                          </div>
                        </Link>

                        {/* 中间：导航链接 */}
                        <div className="absolute left-1/2 flex -translate-x-1/2 gap-8 lg:gap-10">
                          {navItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActiveSection(item.id)}
                              className={cn(
                                "group relative px-1 py-1 text-[15px] font-medium transition-opacity duration-300",
                                activeSection === item.id
                                  ? "opacity-100 text-[#1a1a1a]"
                                  : "opacity-60 text-[#1a1a1a] hover:opacity-80"
                              )}
                            >
                              {item.label}
                              <span
                                className={cn(
                                  "absolute bottom-0 left-0 h-px bg-brand-gold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                  activeSection === item.id ? "w-full" : "w-0 group-hover:w-full"
                                )}
                              />
                            </button>
                          ))}
                        </div>

                        {/* 右侧：占位 */}
                        <div className="w-24" />

                        {/* 底部边线 - 顶部横线移入此处 */}
                        <m.div
                          initial={{ scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          exit={{ scaleX: 0, opacity: 0 }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                          className="pointer-events-none absolute bottom-0 left-0 right-0 h-px origin-center"
                          style={{
                            background: "linear-gradient(to right, transparent 0%, rgba(0,38,62,0.12) 20%, rgba(0,38,62,0.12) 80%, transparent 100%)"
                          }}
                        />
                      </m.nav>
                    )}
                  </AnimatePresence>

                  {/* 内容区域 - 各 Section */}
                  <div className="flex-1 overflow-y-auto px-10 py-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] lg:px-[8%] lg:py-12 xl:py-14">
                    <AnimatePresence mode="wait">
                      {/* Section 1: 品牌故事 */}
                      {activeSection === "story" && (
                        <m.div
                          key="story"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="relative grid h-full grid-cols-1 items-center gap-8 md:grid-cols-[1.1fr_1fr] md:gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-12 xl:gap-16"
                        >
                          {/* 左侧图片区域 */}
                          <div className="relative flex h-full flex-col justify-center gap-4">
                            <div className="relative h-44 w-[70%] self-start overflow-hidden bg-[#FAF5EA] md:h-56 lg:h-64">
                              <Image
                                src="/images/story/dolphin-ocean.webp"
                                alt="大自然"
                                fill
                                className="object-cover grayscale-[20%] transition-transform duration-[1.5s] hover:scale-105"
                              />
                            </div>
                            <div className="relative -mt-10 ml-auto h-64 w-[80%] overflow-hidden border-8 border-[#FAF5EA] bg-[#FAF5EA] lg:-mt-14 lg:h-80">
                              <Image
                                src="/images/story/lab-research.webp"
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
                            <h2 className="mb-6 text-3xl font-light leading-tight tracking-[6px] text-[#00263e] md:mb-8 md:text-4xl md:tracking-[8px] lg:text-[42px]">
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
                          className="relative flex h-full items-center justify-center -mt-4 lg:-mt-8"
                        >
                          <div className="relative flex w-full max-w-[1000px] items-center">
                            {/* 左侧大图 - 基准高度 580px */}
                            <div className="relative z-0 h-[450px] md:h-[520px] lg:h-[580px] flex-[1.1] overflow-hidden shadow-2xl">
                              <Image
                                src="/images/story/mission-image.webp?v=2"
                                alt="护肤专家"
                                fill
                                className="object-cover object-top"
                              />
                            </div>

                            {/* 右侧悬浮卡片 - 减小高度并叠层 */}
                            <div className="relative z-10 -ml-12 md:-ml-16 lg:-ml-24 flex h-[460px] md:h-[500px] flex-1 flex-col justify-between bg-[#FAF5EA] p-8 md:p-10 lg:p-14 shadow-[20px_20px_60px_rgba(0,0,0,0.1)]">
                              <div>
                                <span className="mb-3 block text-[12px] uppercase tracking-[4px] text-[#00263e]/60">
                                  公司使命
                                </span>
                                <h2 className="mb-4 text-[28px] md:text-[32px] lg:text-[36px] font-light leading-tight tracking-[4px] md:tracking-[6px] text-[#00263e]">
                                  化繁为简<br />逆转时光
                                </h2>
                                <p className="max-w-[420px] text-[15px] font-light leading-[2] tracking-wide text-[#00263e]/75">
                                  旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                                  <br /><br />
                                  将逆转时光的不可能，慢慢变得「有可能」。
                                </p>
                              </div>

                              <div className="w-full border-t border-[#00263e]/15 pt-6">
                                <span className="mb-1 block text-[10px] uppercase tracking-[3px] text-[#00263e]/50">CEO</span>
                                <div className="mt-1 text-left">
                                  <Image
                                    src="/images/story/mission-decoration.svg"
                                    alt="John Morrell"
                                    width={140}
                                    height={36}
                                    className="opacity-95"
                                  />
                                </div>
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
                          className="grid h-full w-full grid-cols-1 gap-px self-stretch bg-[#00263e]/10 md:grid-cols-2 md:grid-rows-2 lg:grid-cols-4 lg:grid-rows-1"
                        >
                          {[
                            { num: "01", title: "更珍贵的产品", desc: "我们通过采集这个世上优质的原材料，结合前沿及有效的科技力量，不断更新和进步。" },
                            { num: "02", title: "更优越的体验", desc: "通过严选的供应渠道，极致的专员服务，我们力求为你做到最满意、舒适及专业。" },
                            { num: "03", title: "更积极的方式", desc: "我们提倡以健康的心态去面对每一天，通过适量的运动、合理的膳食及平衡的心理。" },
                            { num: "04", title: "更艰巨的责任", desc: "我们将售出的每款产品的 2% 捐赠给全球的慈善组织和非营利组织，包括 UNF、SPF 等。" },
                          ].map((item, idx) => (
                            <div
                              key={idx}
                              className="flex h-full flex-col justify-between bg-[#FAF5EA] p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-[#FAF5EA] hover:shadow-lg lg:p-10"
                            >
                              <span className="text-6xl font-thin text-[#00263e]/10">{item.num}</span>
                              <div>
                                <h3 className="mb-3 text-lg tracking-[3px] text-[#00263e]">{item.title}</h3>
                                <p className="line-clamp-4 min-h-[104px] text-[13px] leading-[2] text-[#00263e]/80">{item.desc}</p>
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
                          className="flex h-full flex-col justify-center relative pb-20 lg:pb-24"
                        >
                          {/* 奖项网格 - 使用 16:9 比例自适应布局 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {AWARDS_DATA.slice(currentAwardPage * 6, (currentAwardPage + 1) * 6).map((award, idx) => (
                              <m.div
                                key={`${currentAwardPage}-${idx}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                                className="group relative flex aspect-[16/9] flex-col justify-center overflow-hidden border border-[#00263e]/15 bg-[#FAF5EA]/50 p-6 transition-all duration-500 hover:border-[#00263e]/40 lg:p-8 xl:p-10"
                              >
                                {/* 悬浮显示的背景图 */}
                                <div className="absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                                  <Image
                                    src={award.image}
                                    alt={award.title}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 bg-[#FAF5EA]/80 mix-blend-multiply" />
                                </div>

                                {/* 默认显示的文字内容 */}
                                <div className="relative z-10 flex flex-col items-start gap-2 transition-opacity duration-300 group-hover:opacity-0">
                                  <span className="text-sm font-medium uppercase tracking-wider text-[#00263e]/70 block">
                                    {award.org}
                                  </span>
                                  <span className="text-base font-normal leading-relaxed tracking-wide text-[#00263e] lg:text-lg text-left">
                                    {award.title}
                                  </span>
                                  <span className="text-xs font-medium tracking-[2px] text-[#00263e]/40 lg:text-sm">
                                    {award.year}
                                  </span>
                                </div>
                              </m.div>
                            ))}
                          </div>

                          {/* Pagination Controls */}
                          {AWARDS_DATA.length > 6 && (
                            <div className="absolute bottom-4 right-0 flex items-center gap-4 z-20">
                              <button
                                onClick={() => setCurrentAwardPage(p => Math.max(0, p - 1))}
                                disabled={currentAwardPage === 0}
                                className="p-2 rounded-full hover:bg-[#00263e]/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronLeft className="w-6 h-6 text-[#00263e]" />
                              </button>
                              <span className="text-sm font-light tracking-widest text-[#00263e]/60">
                                {currentAwardPage + 1} / {Math.ceil(AWARDS_DATA.length / 6)}
                              </span>
                              <button
                                onClick={() => setCurrentAwardPage(p => Math.min(Math.ceil(AWARDS_DATA.length / 6) - 1, p + 1))}
                                disabled={currentAwardPage >= Math.ceil(AWARDS_DATA.length / 6) - 1}
                                className="p-2 rounded-full hover:bg-[#00263e]/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronRight className="w-6 h-6 text-[#00263e]" />
                              </button>
                            </div>
                          )}
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Desktop Footer Copyright */}
                  <div className="shrink-0 flex flex-col items-center justify-center gap-2 pt-4 pb-2">
                    <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-center text-brand-charcoal/60">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>
                </div>

                </div>
              </div>

              {/* 展开/收起按钮 - 两阶段切换：收起↔展开 */}
              <button
                ref={handleRef}
                type="button"
                onClick={() => {
                  const newState = !isExpanded;
                  setIsExpanded(newState);
                  setDrawerOpen(newState);
                }}
                className="group -mt-[1px] relative z-30 flex w-[110px] self-center items-center justify-center rounded-b-2xl bg-[#FAF5EA] py-3 lg:py-3.5 overflow-hidden pointer-events-auto"
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
            </m.div>
          </div>
        </m.div >
      </m.div >

      {/* 动态背景图片 - 移至最底层 */}


      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
