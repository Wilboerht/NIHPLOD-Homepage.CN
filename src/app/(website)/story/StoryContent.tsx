"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, Leaf, Globe, Heart, ChevronDown, ShoppingBag, BookMarked, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置 - 与 ProductsContent 一致
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShoppingBag },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: Sparkles },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: Phone },
];

// 品牌理念
const philosophies = [
  {
    icon: Sparkles,
    title: "极致追求",
    titleEn: "EXCELLENCE",
    description: "对每一个配方、每一道工序的严苛把控，只为呈现最完美的护肤体验",
  },
  {
    icon: Leaf,
    title: "自然之力",
    titleEn: "NATURE",
    description: "甄选全球珍稀植物精粹，以自然的力量唤醒肌肤本真之美",
  },
  {
    icon: Globe,
    title: "东西融合",
    titleEn: "FUSION",
    description: "源自摩纳哥的奢华基因，融入东方护肤智慧，创造独特的护肤哲学",
  },
  {
    icon: Heart,
    title: "仪式感",
    titleEn: "RITUAL",
    description: "每一次护肤都是与自己对话的珍贵时光，值得被温柔以待",
  },
];

// 品牌时间线
const timeline = [
  {
    year: "2018",
    title: "品牌诞生",
    description: "在摩纳哥的一间实验室里，NIHPLOD 旎柏正式创立，怀揣着对高端护肤的极致追求。",
  },
  {
    year: "2019",
    title: "首款产品",
    description: "历经数百次配方调整，第一款明星产品「焕活精华」问世，获得业内专家高度评价。",
  },
  {
    year: "2020",
    title: "进入中国",
    description: "NIHPLOD 旎柏正式进入中国市场，在上海设立亚太区总部，开启东方之旅。",
  },
  {
    year: "2022",
    title: "产品系列",
    description: "完成全系列护肤产品线布局，涵盖洁面、精华、面霜、防晒等核心品类。",
  },
  {
    year: "2024",
    title: "数字化升级",
    description: "推出 AI 护肤顾问服务，以科技赋能个性化护肤体验，开创智能护肤新时代。",
  },
];

// 品牌故事段落
const storyParagraphs = [
  {
    title: "起源",
    content:
      "NIHPLOD 旎柏，诞生于地中海畔的摩纳哥。这片被阳光眷顾的土地，孕育了无数关于美的传说。我们的创始人深受这里优雅生活方式的启发，立志创造一个能够传递纯粹美学理念的护肤品牌。",
  },
  {
    title: "理念",
    content:
      "我们相信，真正的美源于内心的平静与肌肤的健康。NIHPLOD 旎柏不仅仅是一个护肤品牌，更是一种生活态度的诠释。每一款产品都承载着我们对品质的执着追求，以及对使用者的深切关怀。",
  },
  {
    title: "承诺",
    content:
      "我们承诺只使用最优质的原料，坚持可持续发展理念，拒绝任何可能伤害肌肤或环境的成分。每一瓶 NIHPLOD 旎柏产品，都是我们对美好生活的诚挚献礼。",
  },
];

/**
 * 品牌故事页面内容组件
 * 样式参考 ProductsContent，使用独立的导航栏
 * 主内容区域使用 bg-brand-gold/10 backdrop-blur-md 样式
 */
export function StoryContent() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <>
      {/* 全屏背景容器 - 展开时延伸到底部 */}
      <div className={cn(
        "fixed inset-0 transition-all duration-300",
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
          transition={{ duration: 0.4 }}
          className={cn(
            "absolute left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6",
            isExpanded ? "bottom-4 lg:bottom-6" : ""
          )}
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 bg-brand-gold/10 样式 */}
            <div className={cn(
              "w-full overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl",
              "transition-all duration-300",
              isExpanded ? "flex-1" : ""
            )}>
              <div className={cn(
                "px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6",
                isExpanded ? "h-full overflow-y-auto scrollbar-hide" : ""
              )}>
                {/* 页面标题 */}
                <div className={cn("text-center", isExpanded ? "mb-6" : "")}>
                  <p className="text-xs uppercase tracking-widest text-brand-gold">
                    OUR STORY
                  </p>
                  <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
                    关于旎柏
                  </h1>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-brand-charcoal/70">
                    源自摩纳哥的高端护肤品牌，将地中海的优雅与东方的智慧完美融合
                  </p>
                </div>

                {/* 展开后显示的内容 */}
                <AnimatePresence>
                  {isExpanded && (
                    <m.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* 品牌 Logo 展示 */}
                      <m.div
                        className="mb-8 flex justify-center"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                      >
                        <div className="relative h-20 w-40">
                          <Image
                            src="/images/logo.png"
                            alt="NIHPLOD Logo"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </m.div>

                      {/* 品牌故事段落 */}
                      <div className="mb-10 space-y-5">
                        {storyParagraphs.map((para, index) => (
                          <m.div
                            key={para.title}
                            className="rounded-xl border border-brand-beige bg-white/80 p-5 backdrop-blur-sm"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
                          >
                            <h2 className="mb-2 font-serif text-lg text-brand-gold">
                              {para.title}
                            </h2>
                            <p className="text-sm leading-relaxed text-brand-charcoal/80">
                              {para.content}
                            </p>
                          </m.div>
                        ))}
                      </div>

                      {/* 品牌理念 */}
                      <m.div
                        className="mb-10"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                      >
                        <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">
                          品牌理念
                        </h2>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          {philosophies.map((item, index) => (
                            <m.div
                              key={item.title}
                              className="rounded-xl border border-brand-beige bg-white/80 p-4 text-center backdrop-blur-sm"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                            >
                              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10">
                                <item.icon className="h-6 w-6 text-brand-gold" />
                              </div>
                              <h3 className="font-serif text-base text-brand-charcoal">
                                {item.title}
                              </h3>
                              <p className="text-xs uppercase tracking-wider text-brand-gold">
                                {item.titleEn}
                              </p>
                              <p className="mt-2 text-xs leading-relaxed text-brand-charcoal/60">
                                {item.description}
                              </p>
                            </m.div>
                          ))}
                        </div>
                      </m.div>

                      {/* 品牌时间线 */}
                      <m.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.6 }}
                      >
                        <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">
                          发展历程
                        </h2>
                        <div className="relative">
                          {/* 时间线中轴 */}
                          <div className="absolute left-5 top-0 h-full w-0.5 bg-brand-beige md:left-1/2 md:-translate-x-1/2" />

                          {/* 时间点 */}
                          <div className="space-y-6">
                            {timeline.map((item, index) => (
                              <m.div
                                key={item.year}
                                className="relative pl-14 md:pl-0"
                                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
                              >
                                {/* 时间点标记 */}
                                <div className="absolute left-2.5 top-1 h-6 w-6 rounded-full border-2 border-brand-gold bg-white md:left-1/2 md:-translate-x-1/2" />

                                {/* 内容卡片 */}
                                <div
                                  className={cn(
                                    "rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm md:w-5/12",
                                    index % 2 === 0 ? "md:mr-auto md:pr-8" : "md:ml-auto md:pl-8"
                                  )}
                                >
                                  <span className="font-serif text-lg text-brand-gold">
                                    {item.year}
                                  </span>
                                  <h3 className="mt-1 font-medium text-brand-charcoal">
                                    {item.title}
                                  </h3>
                                  <p className="mt-1 text-sm leading-relaxed text-brand-charcoal/70">
                                    {item.description}
                                  </p>
                                </div>
                              </m.div>
                            ))}
                          </div>
                        </div>
                      </m.div>

                      {/* 底部间距 */}
                      <div className="h-8" />
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
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}

