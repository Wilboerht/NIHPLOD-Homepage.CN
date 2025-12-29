"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, RitualIcon, ContactIcon, HomeIcon, UserButton } from "@/components/website";

/**
 * 底部导航项配置 - 与 ProductsContent 一致
 */
const bottomNavItems = [
  { href: "/products", label: "了解产品", labelEn: "Products", icon: ShopIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
  { href: "/advisor", label: "护肤顾问", labelEn: "Consultant", icon: ContactIcon },
];

// 左侧导航图标 - 书本
const StoryNavIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M4.84204 17.4737C4.84204 14.2302 4.84204 6.52632 4.84204 6.52632C4.84204 5.13107 5.97311 4 7.36836 4H16.6315V14.9474C16.6315 14.9474 9.57156 14.9474 7.36836 14.9474C5.97888 14.9474 4.84204 16.0776 4.84204 17.4737Z" fill="#C3BC9F" stroke="#C3BC9F" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M16.6315 14.9471C16.6315 14.9471 7.85413 14.9471 7.36836 14.9471C5.97311 14.9471 4.84204 16.0781 4.84204 17.4734C4.84204 18.8686 5.97311 19.9997 7.36836 19.9997C8.2985 19.9997 12.7897 19.9997 19.1578 19.9997V4.8418" stroke="#C3BC9F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.78955 17.4746H16.2106" stroke="#C3BC9F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 展开内容的 Section ID 类型
type SectionId = "story" | "mission" | "philosophy" | "awards";

// 导航项配置
const navItems: { id: SectionId; label: string }[] = [
  { id: "story", label: "品牌故事" },
  { id: "mission", label: "公司使命" },
  { id: "philosophy", label: "品牌哲学" },
  { id: "awards", label: "媒体及获奖" },
];

// 背景文字映射
const bgTextMap: Record<SectionId, string> = {
  story: "STORY",
  mission: "MISSION",
  philosophy: "VALUES",
  awards: "AWARDS",
};

interface StoryContentProps {
  backgroundImage?: string;
}

/**
 * 品牌故事页面内容组件
 * 样式参考 about us.html，使用建筑风格布局
 * 保留展开/收起交互模式
 */
export function StoryContent({ backgroundImage }: StoryContentProps = {}) {
  // 展开状态: false=完全收起(只剩按钮), true=完全展开(底部导航隐藏)
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("story");
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [bgTextOffset, setBgTextOffset] = useState({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);

  // 监听滚动，添加毛玻璃效果
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 视差效果 - 鼠标移动时背景文字跟随
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 30;
      const y = (e.clientY / window.innerHeight) * 30;
      setBgTextOffset({ x, y });
    };

    if (isExpanded) {
      window.addEventListener("mousemove", handleMouseMove);
    }
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isExpanded]);

  return (
    <>
      {/* 底层暗金色背景 */}
      <div className="fullscreen-bg-base" />

      {/* 全屏背景图片 - 带边距和圆角 */}
      <div className="fullscreen-bg">
        <Image
          src={backgroundImage || "/images/bg.png"}
          alt="品牌故事"
          fill
          priority
          quality={75}
          className="object-cover"
          sizes="100vw"
        />
        {/* 毛玻璃遮罩层 - 展开时显示 */}
        <div
          className={cn(
            "absolute inset-0 bg-white/30 backdrop-blur-md transition-opacity duration-300",
            isScrolled || isExpanded ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

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
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: !isExpanded ? 0 : "auto"
              }}
              transition={{
                duration: 1,
                ease: [0.22, 1, 0.36, 1]
              }}
            >
              {/* 建筑风格装饰线条 - 渐变淡出 + 绘制动画 + 呼吸脉动 */}
              <AnimatePresence>
                {isExpanded && (
                  <>
                    {/* 左侧竖线 - 渐变从中间向两端淡出 */}
                    <m.div
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      exit={{ scaleY: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute left-4 top-0 bottom-0 w-px origin-center animate-[breathe_4s_ease-in-out_infinite] sm:left-10 lg:left-20"
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
                      className="pointer-events-none absolute right-4 top-0 bottom-0 w-px origin-center animate-[breathe_4s_ease-in-out_infinite_0.5s] sm:right-10 lg:right-20"
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
                      className="pointer-events-none absolute left-0 right-0 top-14 h-px origin-center animate-[breathe_4s_ease-in-out_infinite_1s] sm:top-16 lg:top-20"
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
                      className="pointer-events-none absolute left-0 right-0 bottom-14 h-px origin-center animate-[breathe_4s_ease-in-out_infinite_1.5s] sm:bottom-16 lg:bottom-20"
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
                  "relative z-10 flex h-full flex-col overflow-hidden",
                  !isExpanded && "hidden"
                )}
              >
                {/* 顶部导航栏 */}
                <AnimatePresence mode="wait">
                  {isExpanded && (
                    <m.nav
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="flex h-14 items-center justify-between px-4 sm:h-16 sm:px-10 lg:h-20 lg:px-20"
                    >
                      {/* 左侧：Logo */}
                      <div className="relative h-6 w-20 sm:h-8 sm:w-24">
                        <Image
                          src="/images/logo.png"
                          alt="NIHPLOD Logo"
                          fill
                          className="object-contain brightness-[0.2]"
                        />
                      </div>

                      {/* 中间：导航链接 */}
                      <div className="absolute left-1/2 flex -translate-x-1/2 gap-5 sm:gap-8 lg:gap-10">
                        {navItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveSection(item.id)}
                            className={cn(
                              "relative px-1 py-1 text-[10px] uppercase tracking-[1px] transition-opacity duration-300 sm:text-xs sm:tracking-[2px] lg:text-[13px]",
                              activeSection === item.id
                                ? "font-medium text-[#00263e] opacity-100"
                                : "text-[#00263e] opacity-60 hover:opacity-80"
                            )}
                          >
                            {item.label}
                            {/* 下划线指示器 */}
                            <span
                              className={cn(
                                "absolute bottom-0 left-0 h-px bg-[#00263e] transition-all duration-500",
                                activeSection === item.id ? "w-full" : "w-0"
                              )}
                            />
                          </button>
                        ))}
                      </div>

                      {/* 右侧：用户登录状态 */}
                      <UserButton />
                    </m.nav>
                  )}
                </AnimatePresence>

                {/* 内容区域 - 各 Section */}
                <div className="flex-1 overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-10 sm:py-8 lg:px-20 lg:py-12 xl:py-14">
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
                        <div className="relative flex h-full flex-col justify-center gap-4 pl-4 sm:pl-6 lg:pl-8">
                          <div className="relative h-40 w-[70%] self-start overflow-hidden bg-[#e5e2d5] sm:h-52 lg:h-64">
                            <Image
                              src="/images/story/dolphin-ocean.png"
                              alt="大自然"
                              fill
                              className="object-cover grayscale-[20%] transition-transform duration-[1.5s] hover:scale-105"
                            />
                          </div>
                          <div className="relative -mt-10 ml-auto h-52 w-[80%] overflow-hidden border-8 border-[#F0EDE1] bg-[#e5e2d5] sm:h-64 lg:-mt-14 lg:h-80">
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
                          <span className="mb-3 block text-xs uppercase tracking-[5px] text-[#00263e]/60 sm:text-sm">
                            Since 2008 | Monaco
                          </span>
                          <h2 className="mb-6 text-3xl font-light leading-tight tracking-[8px] text-[#00263e] sm:mb-8 sm:text-4xl lg:text-[42px]">
                            来自大自然的<br />神奇修复力
                          </h2>
                          <p className="max-w-md text-sm leading-[2] tracking-wide text-[#00263e]/75 sm:text-[15px]">
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
                              src="/images/story/mission-image.png"
                              alt="护肤专家"
                              fill
                              className="object-cover"
                            />
                          </div>
                          {/* 右侧文字卡片 */}
                          <div className="z-10 flex flex-1 flex-col items-start justify-center bg-[#DDD9C9] p-8 shadow-[0_4px_20px_rgba(0,38,62,0.04),0_20px_60px_rgba(0,0,0,0.06)] sm:p-12 lg:-ml-16 lg:my-10 lg:p-16">
                            <span className="mb-2 text-xs uppercase tracking-[4px] text-[#00263e]/70 sm:text-sm">
                              Our Mission
                            </span>
                            <h2 className="mb-6 text-3xl font-light leading-tight tracking-[8px] text-[#00263e] sm:mb-8 sm:text-4xl lg:text-[42px]">
                              化繁为简<br />逆转时光
                            </h2>
                            <p className="max-w-md text-sm leading-[1.8] text-[#00263e]/80 sm:text-[15px]">
                              旎柏始终坚持正确且积极的科学理念。通过化繁为简的居家修护及高效舒适的院线调理，尽可能的帮助人们解决并预防各类肌肤问题。
                              <br /><br />
                              将逆转时光的不可能，慢慢变得「有可能」。
                            </p>
                            <div className="mt-8 w-full border-t border-[#00263e]/30 pt-4 sm:mt-10">
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
                        className="mx-2 grid h-[calc(100%-2rem)] grid-cols-2 gap-px self-center bg-[#00263e]/10 sm:mx-4 sm:h-[calc(100%-3rem)] lg:mx-6 lg:h-[calc(100%-4rem)] lg:grid-cols-4"
                      >
                        {[
                          { num: "01", title: "更珍贵的产品", desc: "我们通过采集这个世上优质的原材料，结合前沿及有效的科技力量，不断更新和进步。" },
                          { num: "02", title: "更优越的体验", desc: "通过严选的供应渠道，极致的专员服务，我们力求为你做到最满意、舒适及专业。" },
                          { num: "03", title: "更积极的方式", desc: "我们提倡以健康的心态去面对每一天，通过适量的运动、合理的膳食及平衡的心理。" },
                          { num: "04", title: "更艰巨的责任", desc: "我们将售出的每款产品的 2% 捐赠给全球的慈善组织和非营利组织，包括 UNF、SPF 等。" },
                        ].map((item, idx) => (
                          <div
                            key={idx}
                            className="flex flex-col justify-between bg-[#F0EDE1] p-6 transition-all duration-300 hover:-translate-y-1 hover:bg-[#f7f5ef] hover:shadow-lg sm:p-8 lg:p-10"
                          >
                            <span className="text-5xl font-thin text-[#00263e]/10 sm:text-6xl">{item.num}</span>
                            <div className="mt-auto">
                              <h3 className="mb-3 text-base tracking-[3px] text-[#00263e] sm:mb-5 sm:text-lg">{item.title}</h3>
                              <p className="text-xs leading-[2] text-[#00263e]/80 sm:text-[13px]">{item.desc}</p>
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
                        className="flex h-full flex-col px-4 pb-14 pt-4 sm:px-5 sm:pb-16 sm:pt-5 lg:px-6 lg:pb-20 lg:pt-6"
                      >
                        {/* 3x2 网格卡片布局 - 铺满容器 */}
                        <div className="grid h-full grid-cols-2 grid-rows-3 gap-3 sm:grid-cols-3 sm:grid-rows-2 sm:gap-4 lg:gap-5">
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
                              className="group flex flex-col justify-center border border-[#00263e]/15 bg-[#F0EDE1]/50 p-4 transition-all duration-500 hover:border-[#00263e]/40 hover:bg-white/30 sm:p-6 lg:p-8"
                            >
                              <span className="mb-2 text-[11px] tracking-[2px] text-[#00263e]/50 sm:mb-3 sm:text-xs lg:text-sm">
                                {award.year}
                              </span>
                              <span className="text-sm font-normal leading-relaxed tracking-wide text-[#00263e] sm:text-base lg:text-lg">
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
            </m.div>

            {/* 展开/收起按钮 - 两阶段切换：收起↔展开 */}
            <button
              type="button"
              onClick={() => {
                if (isExpanded) {
                  // 展开 -> 收起
                  setIsExpanded(false);
                } else {
                  // 收起 -> 展开
                  setIsExpanded(true);
                }
              }}
              className="group flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              <m.div
                className="flex flex-col items-center"
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
        </m.div>
      </m.div>

      {/* 移动端菜单遮罩层 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
            onClick={() => setIsNavMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 移动端弹出菜单 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-20 right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
          >
            <div className="flex flex-col gap-1">
              {/* 首页 */}
              <Link
                href="/"
                onClick={() => setIsNavMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                  <HomeIcon className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-brand-charcoal">首页</span>
                  <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">Home</span>
                </div>
              </Link>
              {/* 其他导航项 */}
              {bottomNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsNavMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-brand-charcoal">{item.label}</span>
                      <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">{item.labelEn}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 底部导航栏 - 收起时显示 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              duration: 0.35,
              ease: [0.32, 0.72, 0, 1]
            }}
            className="fixed bottom-2 left-3 right-3 z-50 sm:bottom-4 sm:left-6 sm:right-6 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                "sm:px-5 sm:py-4 lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="品牌故事页导航"
            >
              {/* 左侧主导航 - 关于旎柏 */}
              <Link
                href="/story"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <StoryNavIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    关于旎柏
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Story
                  </span>
                </div>
              </Link>

              {/* 移动端：菜单按钮 */}
              <button
                type="button"
                onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-beige/30 transition-colors active:bg-brand-beige/50 sm:hidden"
                aria-label={isNavMenuOpen ? "关闭菜单" : "打开菜单"}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isNavMenuOpen ? (
                    <m.div
                      key="close"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  ) : (
                    <m.div
                      key="menu"
                      initial={{ opacity: 0, rotate: 90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: -90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  )}
                </AnimatePresence>
              </button>

              {/* 平板/桌面端：直接显示导航图标 */}
              <div className="hidden items-center gap-5 sm:flex lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                        <Icon className="h-8 w-8 lg:h-9 lg:w-9" />
                      </div>
                      <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                        {item.label}
                      </span>
                      <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                    <HomeIcon className="h-8 w-8 lg:h-9 lg:w-9" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                    首页
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                    Home
                  </span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}

