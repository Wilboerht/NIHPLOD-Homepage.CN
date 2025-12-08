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
const StoryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 3.49906C7.11519 0.805619 4.84294 4.31506 4.00002 5.49925C1.16778 6.10825 2 6.99749 3.50005 7.49925C4.10696 7.70225 5.57284 8.1607 6.50004 8.499C6.70234 10.1231 7.33149 11.5761 7.50004 11.999C7.50004 11.593 8.16279 9.6767 8.49994 9C12.9998 9.501 17.4999 11.999 17.9999 16.9991C17.393 18.2171 15.7529 20.6532 15.5 21.499L18.5 19.9991L22 20.9991C22 19.375 19.9273 17.6758 19 16.9991C19.4047 10.5029 16.3545 6.5987 14.5 5.49905C14.7023 4.68704 15.0786 3.33741 15.5 2.99906C13.8816 2.18704 12.5901 3.07614 12 3.49906Z" />
  </svg>
);

const MissionIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6.5 9H3.5V21H6.5V9Z" />
    <path d="M13.5 3H10.5V21H13.5V3Z" />
    <path d="M20.5 13H17.5V21H20.5V13Z" />
  </svg>
);

const PhilosophyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* 奖杯主体 */}
    <path d="M12 14.8039C14.4853 14.8039 16.5 12.9526 16.5 9.80388V2.70703H7.5V9.80388C7.5 12.9526 9.51472 14.8039 12 14.8039Z" />
    {/* 左把手 */}
    <path d="M7.5 4.1V10.7C5.3 10.5 3.7 8.8 3.5 6.1C3.4 5.3 4 4.7 4.7 4.7H6.7V4.1H7.5Z" />
    {/* 右把手 */}
    <path d="M16.5 4.1V10.7C18.7 10.5 20.3 8.8 20.5 6.1C20.6 5.3 20 4.7 19.3 4.7H17.3V4.1H16.5Z" />
    {/* 底座支撑 */}
    <rect x="11.2" y="14.5" width="1.6" height="4.5" />
    {/* 底座 */}
    <rect x="8" y="19.2" width="8" height="1.6" rx="0.8" />
  </svg>
);

const MediaIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.9999 10.0501C13.8755 10.0501 15.3961 8.5296 15.3961 6.65396C15.3961 4.77832 13.8755 3.25781 11.9999 3.25781C10.1243 3.25781 8.60376 4.77832 8.60376 6.65396C8.60376 8.5296 10.1243 10.0501 11.9999 10.0501Z" />
    <path d="M3.26245 18.0001V20.0756H20.7377V18.0001C20.7377 17.6475 20.6484 17.2952 20.4127 17.033C19.4463 15.9578 16.8734 14.2676 12.0001 14.2676C7.12675 14.2676 4.55386 15.9578 3.58744 17.033C3.35175 17.2952 3.26245 17.6475 3.26245 18.0001Z" />
  </svg>
);

const AwardsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.4951 1.88281C11.8093 1.62635 12.2725 1.64454 12.5654 1.9375L15.1807 4.55273H18.6484C19.0902 4.55277 19.4482 4.91073 19.4482 5.35254V8.82031L22.0635 11.4355C22.3758 11.748 22.3759 12.254 22.0635 12.5664L19.4482 15.1816V18.6494C19.4482 19.0912 19.0902 19.4492 18.6484 19.4492H15.1807L12.5654 22.0645C12.253 22.3768 11.747 22.3768 11.4346 22.0645L8.81934 19.4492H5.35156C4.90977 19.4492 4.55181 19.0912 4.55176 18.6494V15.1816L1.93652 12.5664C1.62411 12.254 1.62412 11.748 1.93652 11.4355L4.55176 8.82031V5.35254C4.55176 4.91071 4.90973 4.55273 5.35156 4.55273H8.81934L11.4346 1.9375L11.4951 1.88281ZM16.1064 9.07422C15.794 8.76185 15.287 8.76181 14.9746 9.07422L10.8193 13.2295L9.02441 11.4346C8.71201 11.1223 8.20594 11.1223 7.89355 11.4346C7.58132 11.747 7.58131 12.253 7.89355 12.5654L10.2539 14.9268C10.4038 15.0766 10.6074 15.161 10.8193 15.1611C11.0313 15.1611 11.2348 15.0764 11.3848 14.9268L16.1064 10.2051C16.4185 9.89272 16.4185 9.38658 16.1064 9.07422Z" />
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
  { id: "story", label: "品牌故事", icon: StoryIcon },
  { id: "mission", label: "公司使命", icon: MissionIcon },
  { id: "philosophy", label: "经营理念", icon: PhilosophyIcon },
  { id: "media", label: "媒体报道", icon: MediaIcon },
  { id: "awards", label: "荣获奖项", icon: AwardsIcon },
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

