"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import { ChevronLeft, ChevronRight, BookOpen, Compass, Lightbulb, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

// 展开内容的 Section ID 类型
type SectionId = "story" | "mission" | "philosophy" | "awards";

// 导航项配置
const navItems: { id: SectionId; label: string; pcLabel: string; icon: typeof BookOpen }[] = [
  { id: "story", label: "故事", pcLabel: "品牌故事", icon: BookOpen },
  { id: "mission", label: "使命", pcLabel: "公司使命", icon: Compass },
  { id: "philosophy", label: "哲学", pcLabel: "品牌哲学", icon: Lightbulb },
  { id: "awards", label: "奖项", pcLabel: "奖项报导", icon: Award },
];

const Watermark = () => (
  <>
    {/* PC 端水印 */}
    <div
      className="pointer-events-none absolute inset-0 z-0 hidden select-none opacity-[0.035] md:block"
      style={{
        backgroundImage: "url(/images/watermark.webp)",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "160% auto",
      }}
    />
  </>
);

const AWARDS_DATA = [
  {
    year: "2026",
    org: "胡润百富",
    title: "国际高端护肤品牌最佳表现",
    image: "/images/story/awards/pc/hurun.webp",
  },
  {
    year: "2025",
    org: "亚洲女性友好品牌",
    title: "时空逆转成就奖",
    image: "/images/story/awards/pc/best.webp",
  },
  {
    year: "2024",
    org: "Timout Magazine",
    title: "年度影响力高奢品牌",
    image: "/images/story/awards/pc/timeout.webp",
  },
  {
    year: "2023",
    org: "罗博报告",
    title: "优中优选奖",
    image: "/images/story/awards/pc/robb.webp",
  },
  {
    year: "2020",
    org: "LUX Magazine",
    title: "消费者满意奖",
    image: "/images/story/awards/pc/lux.webp",
  },
  {
    year: "2019",
    org: "Prestige Magazine",
    title: "最佳创新化妆品奖",
    image: "/images/story/awards/pc/prestige.webp",
  },
  {
    year: "2018",
    org: "Wellness & SPA Innovation",
    title: "最佳治疗产品",
    image: "/images/story/awards/pc/wellness.webp",
  },
  {
    year: "2017",
    org: "Pure Beauty Global Awards",
    title: "最佳新晋抗衰老产品",
    image: "/images/story/awards/pc/purebeauty.webp",
  },
];

/**
 * 品牌故事页面内容组件
 * 样式参考 about us.html，使用建筑风格布局
 * 保留展开/收起交互模式
 */

export function StoryContent() {
  const [activeSection, setActiveSection] = useState<SectionId>("story");
  const [currentAwardPage, setCurrentAwardPage] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const fadeMaskRef = useRef<HTMLDivElement>(null);
  const bottomFadeMaskRef = useRef<HTMLDivElement>(null);
  const aboutTabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const { isDrawerOpen } = useLayout();

  // 上下渐隐遮罩：顶部滚动后淕入、底部触底后淡出（ref 直操，无重渲染）
  useEffect(() => {
    const el = contentRef.current;
    const mask = fadeMaskRef.current;
    const bottomMask = bottomFadeMaskRef.current;
    if (!el || !mask || !bottomMask) return;
    const sync = () => {
      mask.style.opacity = el.scrollTop > 8 ? "1" : "0";
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      bottomMask.style.opacity = atBottom ? "0" : "1";
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, []);

  // 左右方向键切换 Tab 并移动焦点（WAI-ARIA Tabs 模式，与 /products 一致）
  const handleAboutTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    itemCount: number,
    activeIndex: number,
    select: (index: number) => void
  ) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextIndex = (activeIndex + (e.key === "ArrowRight" ? 1 : -1) + itemCount) % itemCount;
    select(nextIndex);
    aboutTabButtonsRef.current[nextIndex]?.focus();
    contentRef.current?.scrollTo({ top: 0 });
  };

  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

      <DrawerPageContainer>
        {/* 矿物纹理覆盖层 */}
        <div className="texture-overlay absolute inset-0" />

        {/* 品牌故事和公司使命的水印背景 - 放置在此处可贯穿整个面板，不被上下导航遮挡 */}
        <AnimatePresence>
          {(activeSection === "story" ||
            activeSection === "mission" ||
            activeSection === "philosophy") && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              <Watermark />
            </m.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            "relative z-10 flex h-full flex-col overflow-hidden transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* ========== 移动端布局 - 参考 About us 移动端.html ========== */}
          <div className="relative flex h-full flex-col overflow-hidden lg:hidden">
            {/* Background Texture Overlay */}
            <div
              className="pointer-events-none fixed inset-0 z-[1] opacity-[0.04]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              }}
            />

            {/* Header - Mobile - 与 Guide 顶部栏样式一致 */}
            <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm transition-all">
              <Link href="/" className="mt-1 flex items-center justify-center">
                <div className="relative h-[28px] w-[100px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>
              {/* Texture Overlay for Header to match body */}
              <div className="texture-overlay absolute inset-0 z-[-1]" />
            </div>

            {/* 顶部 Tab 栏 - 紧贴 Header 下方吸顶（与 /products 移动端胶囊 Tab 对齐） */}
            <div className="sticky top-[88px] z-40 shrink-0 bg-brand-cream/95 backdrop-blur-sm">
              <div
                className="flex items-center justify-center gap-2.5 px-3"
                role="tablist"
                aria-label="切换关于我们板块"
              >
                <LayoutGroup id="about-mobile-tab">
                  {navItems.map((item, index) => {
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        ref={(el) => {
                          aboutTabButtonsRef.current[index] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onKeyDown={(e) =>
                          handleAboutTabKeyDown(e, navItems.length, index, (i) => {
                            setActiveSection(navItems[i].id);
                            contentRef.current?.scrollTo({ top: 0 });
                          })
                        }
                        onClick={() => {
                          setActiveSection(item.id);
                          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={cn(
                          "relative rounded-full px-3.5 py-2.5 transition-colors",
                          isActive
                            ? "font-normal text-brand-primary"
                            : "font-light text-brand-charcoal/40"
                        )}
                      >
                        {isActive && (
                          <m.div
                            layoutId="about-tab-pill"
                            className="absolute inset-0 rounded-full border border-[#00263e]/[0.08] bg-[#00263e]/[0.04]"
                            transition={{ type: "spring", stiffness: 400, damping: 32 }}
                          />
                        )}
                        <span className="relative text-[12px] tracking-[0.06em]">
                          {item.pcLabel}
                        </span>
                      </button>
                    );
                  })}
                </LayoutGroup>
              </div>
            </div>

            {/* 页面主标题 - SEO用，视觉上隐藏 */}
            <h1 className="sr-only">关于 NIHPLOD 旎柏</h1>

            {/* Scroll Area Wrapper - 承载顶部渐隐遮罩 */}
            <div className="relative flex-1 overflow-hidden">
              {/* Top Fade Mask - 仅在滚动后显示 */}
              <div
                ref={fadeMaskRef}
                className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6 transition-opacity duration-300"
                style={{
                  background: "linear-gradient(to bottom, #FBF8F0, transparent)",
                  opacity: 0,
                }}
              />
              {/* Bottom Fade Mask - 未滚到底时显示，滚到底后淡出 */}
              <div
                ref={bottomFadeMaskRef}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-8 transition-opacity duration-300"
                style={{
                  background: "linear-gradient(to top, #FBF8F0, transparent)",
                  opacity: 1,
                }}
              />

              {/* Main Content Area */}
              <div
                ref={contentRef}
                className="relative z-20 flex h-full flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {/* 移动端 Section 1: 品牌故事 */}
                {activeSection === "story" && (
                  <section className="relative pt-7">
                    <div className="mb-8 flex flex-col items-center">
                      <h2 className="text-center text-[19px] font-normal tracking-[0.15em] text-brand-charcoal">
                        品牌故事
                      </h2>
                      <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
                    </div>

                    <div>
                      {/* 第一个内容块 */}
                      <div className="mb-6">
                        <span className="block text-[17px] font-normal leading-snug tracking-[0.08em] text-brand-primary">
                          来自大自然的神奇修复力
                        </span>
                        <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                          海豚的肌肤拥有每两小时自我更新的神奇能力。这种「逆转时光」的动物本能，是旎柏成立的灵感来源。
                        </p>
                        <div className="relative mt-6 w-full overflow-hidden border border-brand-charcoal/10">
                          <Image
                            src="/images/story/dolphin-ocean.webp"
                            alt="Dolphin Skin"
                            width={600}
                            height={400}
                            className="w-full transition-transform duration-[1.2s] hover:scale-105"
                          />
                        </div>
                      </div>

                      {/* 第二个内容块 */}
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-brand-charcoal/60">
                          <Image
                            src="/images/quote-icon.svg"
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 opacity-30"
                          />
                          2008 | 摩纳哥 | 联合实验室公司
                        </span>
                        <span className="mt-6 block text-[17px] font-normal leading-snug tracking-[0.08em] text-brand-primary">
                          前沿科技赋能精简护理
                        </span>
                        <p className="mt-6 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                          创始人 Dr. Stefan
                          博士和他的团队将前沿技术与精选的天然活性成分相结合，为每一款产品融入了前沿的科技和配方，使护肤调理变得简单、高效且美好。
                        </p>
                        <div className="relative mt-6 w-full overflow-hidden border border-brand-charcoal/10">
                          <Image
                            src="/images/story/lab-research.webp"
                            alt="Science"
                            width={600}
                            height={400}
                            className="w-full transition-transform duration-[1.2s] hover:scale-105"
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* 移动端 Section 2: 公司使命 */}
                {activeSection === "mission" && (
                  <section className="relative pt-7">
                    <div className="mb-8 flex flex-col items-center">
                      <h2 className="text-center text-[19px] font-normal tracking-[0.15em] text-brand-charcoal">
                        公司使命
                      </h2>
                      <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
                    </div>

                    <div className="flex flex-col gap-6">
                      <div className="relative w-full overflow-hidden border border-brand-charcoal/10 bg-white/20 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)]">
                        <Image
                          src="/images/story/mission-image.webp"
                          alt="NIHPLOD 品牌使命"
                          width={600}
                          height={800}
                          sizes="(max-width: 640px) calc(100vw - 48px), 600px"
                          className="h-auto w-full object-contain"
                        />
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <p className="text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                          旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                        </p>
                        <p className="text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                          将逆转时光的不可能，慢慢变得「有可能」。
                        </p>
                      </div>

                      {/* CEO 签名 */}
                      <div className="flex flex-col items-end gap-2.5">
                        <span className="text-[12px] leading-[18px] text-brand-charcoal/50">
                          CEO
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
                  <section className="relative pt-7">
                    <div className="mb-8 flex shrink-0 flex-col items-center">
                      <h2 className="text-center text-[19px] font-normal tracking-[0.15em] text-brand-charcoal">
                        品牌哲学
                      </h2>
                      <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          num: "01",
                          title: "更珍贵的产品",
                          desc: "通过采集优质原材料，结合前沿科技力量，不断更新与进步。",
                        },
                        {
                          num: "02",
                          title: "更优越的体验",
                          desc: "严选供应渠道，极致专员服务，力求专业、舒适与满意。",
                        },
                        {
                          num: "03",
                          title: "更积极的方式",
                          desc: "倡导健康心态，通过合理的膳食及平衡心理面对每一天。",
                        },
                        {
                          num: "04",
                          title: "更艰巨的责任",
                          desc: "将产品销售额的 2% 捐赠给全球慈善及非营利组织。",
                        },
                      ].map((item, idx) => (
                        <m.div
                          key={item.num}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-20px" }}
                          transition={{ duration: 0.4, delay: idx * 0.1, ease: "easeOut" }}
                          className="flex flex-col justify-start gap-2 rounded-lg border border-brand-charcoal/[0.05] bg-[#FFFDF9] p-5"
                        >
                          <span className="text-[16px] font-light tracking-[0.1em] text-brand-charcoal/35">
                            {item.num}
                          </span>
                          <h3 className="text-[14px] font-normal leading-[22px] text-brand-charcoal">
                            {item.title}
                          </h3>
                          <p className="text-[13px] font-light leading-[22px] text-brand-charcoal/70">
                            {item.desc}
                          </p>
                        </m.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 移动端 Section 4: 媒体获奖 */}
                {activeSection === "awards" && (
                  <section className="relative pt-7">
                    <div className="mb-8 flex flex-col items-center">
                      <h2 className="text-center text-[19px] font-normal tracking-[0.15em] text-brand-charcoal">
                        媒体及获奖
                      </h2>
                      <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
                    </div>
                    {/* 奖项列表 */}
                    <div className="flex flex-col gap-6">
                      {AWARDS_DATA.map((award, idx) => (
                        <m.div
                          key={award.image}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-40px" }}
                          transition={{ duration: 0.45, delay: (idx % 2) * 0.08, ease: "easeOut" }}
                          className="flex flex-col border border-brand-charcoal/[0.08] bg-[#FFFDF9]"
                        >
                          {/* Award Image */}
                          <div className="relative w-full overflow-hidden">
                            <Image
                              src={award.image}
                              alt={award.title}
                              width={600}
                              height={400}
                              sizes="(max-width: 640px) calc(100vw - 48px), 600px"
                              className="h-auto w-full object-contain"
                            />
                          </div>

                          <div className="flex flex-col items-center border-t border-brand-charcoal/[0.05] px-5 py-5 text-center">
                            <h3 className="text-[15px] font-normal leading-[24px] tracking-[0.08em] text-brand-primary">
                              {award.title}
                            </h3>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-light">
                              <span className="leading-[20px] tracking-[0.08em] text-brand-primary/60">
                                {award.org}
                              </span>
                              <span className="text-brand-charcoal/25">·</span>
                              <span className="leading-[20px] tracking-[0.08em] text-brand-charcoal/50">
                                {award.year}
                              </span>
                            </div>
                          </div>
                        </m.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Mobile Footer Copyright */}
                <div className="mt-auto flex flex-col items-center justify-center pb-4 pt-10">
                  <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ========== 桌面端布局 - 保持原有样式 ========== */}
          <div className="hidden h-full flex-col lg:flex">
            {/* 顶部导航栏 */}
            <AnimatePresence mode="wait">
              {isDrawerOpen && (
                <m.nav
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex h-[88px] flex-shrink-0 items-center justify-between border-b border-brand-charcoal/[0.05] px-10 xl:px-[8%]"
                >
                  {/* 左侧：Logo */}
                  <Link href="/">
                    <div className="relative h-9 w-[150px] opacity-90 transition-opacity hover:opacity-70">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD"
                        fill
                        className="object-contain object-left"
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
                          "group relative px-1 py-1 text-[15px] font-light tracking-[0.15em] transition-opacity duration-300",
                          activeSection === item.id
                            ? "text-brand-charcoal opacity-100"
                            : "text-brand-charcoal opacity-60 hover:opacity-80"
                        )}
                      >
                        {item.pcLabel}
                      </button>
                    ))}
                  </div>
                </m.nav>
              )}
            </AnimatePresence>

            {/* 内容区域 - 各 Section */}
            <div className="flex-1 overflow-y-auto px-10 py-8 [-ms-overflow-style:none] [scrollbar-width:none] lg:px-10 lg:py-12 xl:px-[8%] xl:py-14 [&::-webkit-scrollbar]:hidden">
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
                      <div className="relative h-44 w-[70%] self-start overflow-hidden bg-[#FBF8F0] md:h-56 lg:h-64">
                        <Image
                          src="/images/story/dolphin-ocean.webp"
                          alt="大自然"
                          fill
                          className="object-cover transition-transform duration-[1.5s] hover:scale-105"
                        />
                      </div>
                      <div className="relative -mt-10 ml-auto h-64 w-[80%] overflow-hidden border-8 border-[#FBF8F0] bg-[#FBF8F0] lg:-mt-14 lg:h-80">
                        <Image
                          src="/images/story/lab-research.webp"
                          alt="科技"
                          fill
                          className="object-cover transition-transform duration-[1.5s] hover:scale-105"
                        />
                      </div>
                    </div>

                    {/* 右侧文字区域 */}
                    <div className="pl-0 lg:pl-10">
                      <span className="mb-4 block text-sm font-light tracking-[0.15em] text-brand-charcoal/60">
                        Since 2008 | Monaco
                      </span>
                      <h2 className="mb-8 mt-8 font-sans text-2xl font-light !leading-[1.3] tracking-[0.12em] text-brand-charcoal md:mb-10 md:mt-10 md:text-3xl md:tracking-[0.15em] lg:text-[36px]">
                        来自大自然的
                        <br />
                        神奇修复力
                      </h2>
                      <p className="max-w-[420px] text-[16px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                        海豚的肌肤拥有每两小时自我更新的神奇能力。这种「逆转时光」的动物本能，是旎柏成立的灵感来源。所以我们将「DOLPHIN」这个单词逆转，这就是
                        NIHPLOD。
                      </p>
                      <p className="mt-6 max-w-[420px] text-[16px] font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                        创始人 Dr. Stefan
                        和他的团队，将前沿技术与精选的天然活性成分相结合，为每一款产品融入了前沿的科技和配方，使护肤调理变得简单、高效且美好。
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
                    className="relative flex h-full items-center justify-center"
                  >
                    <div className="relative flex w-[80%] items-center">
                      {/* 左侧大图 - 基准高度 580px */}
                      <div className="relative z-0 h-[450px] w-[52%] shrink-0 overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,38,62,0.2)] md:h-[520px] lg:h-[580px]">
                        <Image
                          src="/images/story/mission-image.webp"
                          alt="护肤专家"
                          fill
                          className="object-cover object-top"
                        />
                      </div>

                      {/* 右侧悬浮卡片 */}
                      <div className="relative z-10 -ml-12 flex h-[460px] flex-1 flex-col justify-between bg-[#FCF9F2] p-8 shadow-[0_8px_30px_-8px_rgba(0,38,62,0.12)] md:-ml-16 md:h-[500px] md:p-10 lg:-ml-24 lg:p-14">
                        <div>
                          <span className="mb-4 block text-[12px] font-light tracking-[0.15em] text-brand-charcoal/60">
                            公司使命
                          </span>
                          <h2 className="mb-6 font-sans text-2xl font-light !leading-[1.3] tracking-[0.12em] text-brand-charcoal md:mb-8 md:text-3xl md:tracking-[0.15em] lg:text-[36px]">
                            化繁为简
                            <br />
                            逆转时光
                          </h2>
                          <p className="max-w-[420px] text-[16px] font-light leading-[1.8] tracking-[0.05em] text-brand-charcoal/80">
                            旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                          </p>
                          <p className="mt-6 max-w-[420px] text-[16px] font-light leading-[1.8] tracking-[0.05em] text-brand-charcoal/80">
                            将逆转时光的不可能，慢慢变得「有可能」。
                          </p>
                        </div>

                        <div className="mt-6 flex w-full flex-col gap-1">
                          <span className="block text-[10px] font-light tracking-[0.12em] text-brand-charcoal/50">
                            CEO
                          </span>
                          <div className="text-left">
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
                    className="grid h-full w-full grid-cols-1 gap-px self-stretch bg-brand-charcoal/10 md:grid-cols-2 md:grid-rows-2 lg:grid-cols-4 lg:grid-rows-1"
                  >
                    {[
                      {
                        num: "01",
                        title: "更珍贵的产品",
                        desc: "我们通过采集这个世上优质的原材料，结合前沿及有效的科技力量，不断更新和进步。",
                      },
                      {
                        num: "02",
                        title: "更优越的体验",
                        desc: "通过严选的供应渠道，极致的专员服务，我们力求为你做到最满意、舒适及专业。",
                      },
                      {
                        num: "03",
                        title: "更积极的方式",
                        desc: "我们提倡以健康的心态去面对每一天，通过适量的运动、合理的膳食及平衡的心理。",
                      },
                      {
                        num: "04",
                        title: "更艰巨的责任",
                        desc: "我们将售出的每款产品的 2% 捐赠给全球的慈善组织和非营利组织，包括 UNF、SPF 等。",
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="flex h-full flex-col justify-between bg-[#FBF8F0] p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(0,38,62,0.12)] lg:p-10"
                      >
                        <span className="text-6xl font-thin text-brand-charcoal/10">
                          {item.num}
                        </span>
                        <div>
                          <h3 className="mb-3 text-lg font-light tracking-[0.15em] text-brand-charcoal">
                            {item.title}
                          </h3>
                          <p className="line-clamp-4 min-h-[112px] text-sm font-light leading-[1.8] tracking-[0.08em] text-brand-charcoal/80">
                            {item.desc}
                          </p>
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
                    className="relative flex h-full flex-col justify-center"
                  >
                    {/* 奖项网格 */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {AWARDS_DATA.slice(currentAwardPage * 6, (currentAwardPage + 1) * 6).map(
                        (award, idx) => (
                          <m.div
                            key={`${currentAwardPage}-${idx}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.5,
                              delay: idx * 0.1,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="group relative flex aspect-[16/9] flex-col justify-center overflow-hidden border border-brand-charcoal/25 bg-[#FCF9F2] p-6 transition-all duration-500 hover:border-brand-charcoal/50 lg:p-8 xl:p-10"
                          >
                            {/* 悬浮显示的背景图 */}
                            <div className="absolute inset-0 z-0 opacity-[0.03] transition-opacity duration-500 group-hover:opacity-100">
                              <Image
                                src={award.image}
                                alt={award.title}
                                fill
                                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                                className="object-cover transition-all duration-500"
                              />
                              <div className="absolute inset-0 bg-[#FBF8F0]/80 mix-blend-multiply" />
                            </div>

                            {/* 默认显示的文字内容 */}
                            <div className="relative z-10 flex flex-col items-start gap-2 transition-opacity duration-300 group-hover:opacity-0">
                              <span className="block text-sm font-light tracking-[0.12em] text-brand-charcoal/60">
                                {award.org}
                              </span>
                              <span className="text-left text-base font-light leading-relaxed tracking-[0.12em] text-brand-charcoal lg:text-lg">
                                {award.title}
                              </span>
                              <span className="text-xs font-light tracking-[0.12em] text-brand-charcoal/60 lg:text-sm">
                                {award.year}
                              </span>
                            </div>
                          </m.div>
                        )
                      )}
                    </div>

                    {/* 左右浮动箭头 */}
                    {AWARDS_DATA.length > 6 && (
                      <>
                        <button
                          onClick={() => setCurrentAwardPage((p) => Math.max(0, p - 1))}
                          disabled={currentAwardPage === 0}
                          className="absolute -left-12 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0 lg:-left-16"
                        >
                          <ChevronLeft className="h-5 w-5 text-brand-charcoal" />
                        </button>
                        <button
                          onClick={() =>
                            setCurrentAwardPage((p) =>
                              Math.min(Math.ceil(AWARDS_DATA.length / 6) - 1, p + 1)
                            )
                          }
                          disabled={currentAwardPage >= Math.ceil(AWARDS_DATA.length / 6) - 1}
                          className="absolute -right-12 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0 lg:-right-16"
                        >
                          <ChevronRight className="h-5 w-5 text-brand-charcoal" />
                        </button>
                      </>
                    )}
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop Footer Copyright */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 py-4">
              <p className="text-center text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </DrawerPageContainer>

      {/* 动态背景图片 - 移至最底层 */}

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
