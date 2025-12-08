"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ShoppingBag, Sparkles, BookMarked, Phone, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置 - 与 ProductsContent 一致
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShoppingBag },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: Sparkles },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: Phone },
];

// 自定义图标组件
const DolphinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 10c0 0 1-4 6-4c2 0 3.5 1.5 5 2.5c1.5 1 3 1.5 5 1.5c1 0 2-0.5 2-0.5s-1 4-5 4c-1.5 0-2.5-0.5-3.5-1" />
    <path d="M12 12c-2 2-4 5-4 7" />
    <path d="M7 6c-1-1-2-2-4-2" />
    <circle cx="15" cy="8" r="0.5" fill="currentColor" />
  </svg>
);

const ClipboardCheckIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 12l2 2l4-4" />
  </svg>
);

const BusinessPersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="6" r="3" />
    <path d="M12 9v6" />
    <path d="M8 15l4 6l4-6" />
    <path d="M7 12h10" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="12" width="5" height="9" />
    <rect x="10" y="6" width="5" height="15" />
    <rect x="17" y="3" width="5" height="18" />
  </svg>
);

const TrophyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 3h12v6c0 3.3-2.7 6-6 6s-6-2.7-6-6V3z" />
    <path d="M6 5H3v2c0 1.7 1.3 3 3 3" />
    <path d="M18 5h3v2c0 1.7-1.3 3-3 3" />
    <path d="M12 15v3" />
    <path d="M8 21h8" />
    <path d="M12 18l-2 3h4l-2-3z" />
  </svg>
);

// 标签页配置
type TabId = "story" | "mission" | "philosophy" | "media" | "awards";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

interface StorySection {
  type: "hero" | "section";
  title?: string;
  paragraphs?: string[];
  image: string;
  imageAlt: string;
  imagePosition?: "right" | "bottom";
}

interface TabContent {
  title: string;
  content: string[];
  isRichContent?: boolean;
  sections?: StorySection[];
}

const tabs: TabConfig[] = [
  { id: "story", label: "品牌故事", icon: DolphinIcon },
  { id: "mission", label: "公司使命", icon: ClipboardCheckIcon },
  { id: "philosophy", label: "经营理念", icon: BusinessPersonIcon },
  { id: "media", label: "媒体报道", icon: ChartIcon },
  { id: "awards", label: "荣获奖项", icon: TrophyIcon },
];

// 各标签页内容
const tabContents: Record<TabId, TabContent> = {
  story: {
    title: "品牌故事",
    isRichContent: true,
    sections: [
      {
        type: "hero",
        image: "/images/story/hero-products.jpg",
        imageAlt: "NIHPLOD 产品系列展示",
      },
      {
        type: "section",
        title: "灵感来源：来自大自然的神奇修复力",
        paragraphs: [
          "海豚的皮肤拥有惊人的\n自我修复与再生能力，\n近乎「刀枪不入」的存在。\n以及极高的愈合速度。",
          "每次交配后，海豚皮肤上的伤口在数周内\n就会愈合，远超同类。",
        ],
        image: "/images/story/dolphins.jpg",
        imageAlt: "海豚在海洋中游泳",
      },
      {
        type: "section",
        title: "「前沿科技」媲比医美的微蒸体技术",
        paragraphs: [
          "灵感来自海豚皮肤强大的自我修复功能。\n经过多年研究，我们从海豚皮肤中提取Coating\n发现了其中的关键成分，\n结合现代生物科技，\n研发出了独特的微蒸体护肤系统。",
          "我们运用一颗「芝麻大小」的微囊，\n凝聚百万级别的「婴儿肌肤」精华。\n「珍珠」般包裹活性成分，精准释放。",
        ],
        image: "/images/story/technology.jpg",
        imageAlt: "微蒸体技术示意图",
      },
      {
        type: "section",
        title: "超肤体技术",
        paragraphs: [
          "超肤体如同肌肤的「快递员」，精准将活性成分送达真皮层，实现深层渗透。通过先进的纳米包裹技术，将营养成分包裹在超小微粒中，有效穿透肌肤屏障，直达肌肤深层。",
        ],
        image: "/images/story/skin-layers.jpg",
        imageAlt: "皮肤层结构示意图",
        imagePosition: "bottom",
      },
    ],
    content: [],
  },
  mission: {
    title: "公司使命",
    content: [
      "以科技创新引领护肤行业发展，为每一位追求美丽的人提供专业、安全、高效的护肤解决方案。",
      "我们致力于融合东西方护肤智慧，将源自摩纳哥的奢华理念与东方传统养肤哲学完美结合，创造独特的护肤体验。",
      "通过持续的研发投入和技术创新，让更多人享受到高品质护肤带来的美好与自信。",
    ],
  },
  philosophy: {
    title: "经营理念",
    content: [
      "品质为本：对每一个配方、每一道工序严苛把控，只为呈现最完美的护肤体验。",
      "科技驱动：借助 AI 等前沿技术，为用户提供个性化的护肤方案和服务。",
      "可持续发展：坚持环保理念，采用可持续原料和包装，为地球环境贡献力量。",
      "以人为本：倾听用户声音，不断优化产品和服务，让每位用户感受到真诚的关怀。",
    ],
  },
  media: {
    title: "媒体报道",
    content: [
      "《时尚芭莎》：「NIHPLOD 旎柏以其独特的品牌理念和卓越的产品品质，正在重新定义高端护肤的标准。」",
      "《ELLE》：「这个来自摩纳哥的护肤品牌，将地中海的优雅与科技创新完美融合，值得关注。」",
      "《Vogue》：「NIHPLOD 的 AI 护肤顾问服务开创了智能护肤的新时代，为消费者提供前所未有的个性化体验。」",
    ],
  },
  awards: {
    title: "荣获奖项",
    content: [
      "2023 年度最佳创新护肤品牌 - 中国美容博览会",
      "2023 年度可持续发展企业奖 - 绿色美妆联盟",
      "2024 年度最受消费者喜爱护肤品牌 - 天猫金妆奖",
      "2024 年度科技创新奖 - 中国化妆品创新大会",
    ],
  },
};

/**
 * 品牌故事页面内容组件
 * 样式参考 ProductsContent，使用独立的导航栏
 * 主内容区域使用 bg-brand-gold/10 backdrop-blur-md 样式
 */
export function StoryContent() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  return (
    <>
      {/* 全屏背景容器 - 展开时延伸到底部 */}
      <div className={cn(
        "fixed inset-0 transition-all duration-500 ease-out",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/story-bg.jpg"
            alt="品牌故事"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 主内容区域 + 展开按钮一体化 - 参考 ProductsContent 分类栏样式 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "absolute left-6 right-6 top-4 z-20 transition-all duration-500 ease-out sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6",
            isExpanded ? "bottom-4 lg:bottom-6" : ""
          )}
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 bg-brand-gold/10 样式 */}
            <div className={cn(
              "w-full overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl",
              "transition-all duration-500 ease-out",
              isExpanded ? "flex-1" : ""
            )}>
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""
              )}>
                {/* 页面标题 - 收起时始终显示，展开时仅在没有选中标签时显示 */}
                <AnimatePresence mode="wait">
                  {(!isExpanded || !activeTab) && (
                    <m.div
                      key="title"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className={cn(
                        "text-center",
                        isExpanded ? "mb-6 sm:mb-8" : ""
                      )}
                    >
                      <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                        OUR STORY
                      </p>
                      <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                        关于旎柏
                      </h1>
                      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                        源自摩纳哥的高端护肤品牌，将地中海的优雅与东方的智慧完美融合
                      </p>
                    </m.div>
                  )}
                </AnimatePresence>

                {/* 展开后显示的内容 */}
                <AnimatePresence mode="wait">
                  {isExpanded && !activeTab && (
                    <m.div
                      key="tabs"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20, transition: { duration: 0.25 } }}
                      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                      className="flex flex-col items-center"
                    >

                      {/* 品牌 Logo 展示 */}
                      <m.div
                        className="mb-8 flex justify-center sm:mb-10"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
                      >
                        <div className="relative h-16 w-32 sm:h-20 sm:w-40 md:h-24 md:w-48">
                          <Image
                            src="/images/logo.png"
                            alt="NIHPLOD Logo"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </m.div>

                      {/* 5个大标签按钮 */}
                      <div className="flex w-full max-w-5xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.2 + index * 0.06, ease: "easeOut" }}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              {/* 大图标 */}
                              <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28">
                                <Icon className="h-12 w-12 text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24" />
                              </div>
                              {/* 标签文字 */}
                              <span className="text-xs font-medium text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm md:text-base lg:text-lg">
                                {tab.label}
                              </span>
                            </m.button>
                          );
                        })}
                      </div>
                    </m.div>
                  )}

                  {/* 选中标签后显示的内容 */}
                  {isExpanded && activeTab && (
                    <m.div
                      key={activeTab}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex h-full flex-col"
                    >
                      {/* 返回按钮和标题 */}
                      <div className="mb-4 flex items-center justify-between sm:mb-6">
                        <m.button
                          type="button"
                          onClick={() => setActiveTab(null)}
                          className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="text-sm sm:text-base">返回</span>
                        </m.button>
                        <m.h2
                          className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
                        >
                          {tabContents[activeTab].title}
                        </m.h2>
                        <div className="w-16 sm:w-20" /> {/* 占位保持标题居中 */}
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm transition-all duration-300 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        {/* 富内容：品牌故事 */}
                        {tabContents[activeTab].isRichContent && tabContents[activeTab].sections ? (
                          <div className="space-y-12 sm:space-y-16 md:space-y-20">
                            {tabContents[activeTab].sections.map((section, sectionIndex) => (
                              <m.div
                                key={sectionIndex}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 + sectionIndex * 0.1, ease: "easeOut" }}
                              >
                                {/* Hero 图片区域 */}
                                {section.type === "hero" && (
                                  <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-beige/40 to-brand-beige/20 shadow-sm">
                                    <div className="absolute inset-0 flex items-center justify-center text-brand-charcoal/30">
                                      <div className="text-center">
                                        <svg className="mx-auto h-16 w-16 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <p className="mt-3 text-sm font-medium">{section.imageAlt}</p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* 内容区块 */}
                                {section.type === "section" && (
                                  <div className="space-y-8">
                                    {/* 标题 - 更突出 */}
                                    <h3 className="text-center font-serif text-xl font-semibold tracking-wide text-brand-charcoal sm:text-2xl md:text-3xl">
                                      {section.title}
                                    </h3>

                                    {/* 垂直布局：文字在上，图片在下，全部居中 */}
                                    <div className="space-y-8">
                                      {/* 文字段落 - 居中对齐 */}
                                      <div className="mx-auto max-w-2xl space-y-5 text-center">
                                        {section.paragraphs?.map((paragraph, pIndex) => (
                                          <p
                                            key={pIndex}
                                            className="whitespace-pre-line text-sm leading-loose text-brand-charcoal/70 sm:text-base md:text-lg"
                                          >
                                            {paragraph}
                                          </p>
                                        ))}
                                      </div>
                                      {/* 图片 - 居中显示 */}
                                      <div className="relative mx-auto aspect-[4/3] max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-brand-beige/40 to-brand-beige/20 shadow-sm">
                                        <div className="absolute inset-0 flex items-center justify-center text-brand-charcoal/30">
                                          <div className="text-center">
                                            <svg className="mx-auto h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="mt-2 text-xs font-medium">{section.imageAlt}</p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </m.div>
                            ))}
                          </div>
                        ) : (
                          // 普通文本内容
                          <div className="space-y-4 sm:space-y-5 md:space-y-6">
                            {tabContents[activeTab].content.map((text, index) => (
                              <m.p
                                key={index}
                                className="text-sm leading-relaxed text-brand-charcoal/80 sm:text-base md:text-lg"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.1 + index * 0.06, ease: "easeOut" }}
                              >
                                {text}
                              </m.p>
                            ))}
                          </div>
                        )}
                      </div>
                    </m.div>
                  )}


                </AnimatePresence>
              </div>
            </div>

            {/* 展开/收起按钮 - 无缝连接 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </div>

      {/* 底部导航栏 - 展开时隐藏，与 ProductsContent 样式一致 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-4 left-6 right-6 z-50 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                "rounded-2xl bg-white/95 px-5 py-4 shadow-lg backdrop-blur-md",
                "lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="品牌故事页导航"
            >
              {/* 左侧主导航 - 关于旎柏 */}
              <Link
                href="/story"
                className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4"
              >
                {/* 图标容器 */}
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <BookMarked className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">
                    关于旎柏
                  </span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">
                    Story
                  </span>
                </div>
              </Link>

              {/* 右侧导航图标 */}
              <div className="flex items-center gap-3 sm:gap-5 lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                        <Icon className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                      </div>
                      <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">
                        {item.label}
                      </span>
                      <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                    <Home className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">
                    首页
                  </span>
                  <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">
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

