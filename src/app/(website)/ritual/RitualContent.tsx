"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ShoppingBag, BookMarked, Phone, Sun, Moon, Heart, ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShoppingBag },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: BookMarked },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: Phone },
];

// 自定义图标组件
const SunIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const HeartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

// 标签页配置
type TabId = "morning" | "evening" | "couple";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: "morning", label: "晨间仪式", icon: SunIcon },
  { id: "evening", label: "晚间仪式", icon: MoonIcon },
  { id: "couple", label: "双人SPA", icon: HeartIcon },
];

// 护肤步骤类型
interface RitualStep {
  order: number;
  name: string;
  nameEn: string;
  description: string;
  duration: string;
  productSlug: string | null;
}

// 各标签页内容
interface TabContent {
  title: string;
  titleEn: string;
  description: string;
  steps: RitualStep[];
}

const tabContents: Record<TabId, TabContent> = {
  morning: {
    title: "晨间仪式",
    titleEn: "MORNING RITUAL",
    description: "清晨护肤，唤醒肌肤活力，为新的一天注入能量",
    steps: [
      {
        order: 1,
        name: "洁面",
        nameEn: "CLEANSE",
        description: "用温水轻柔唤醒肌肤，云朵洁面慕斯打出绵密泡沫，轻轻按摩全脸后冲洗干净。",
        duration: "1-2分钟",
        productSlug: "foam-cleanser",
      },
      {
        order: 2,
        name: "精华",
        nameEn: "SERUM",
        description: "取适量修护紧致精华于掌心温热，轻拍于面部，由内向外、由下向上轻柔按压至吸收。",
        duration: "30秒",
        productSlug: "serum",
      },
      {
        order: 3,
        name: "面霜",
        nameEn: "CREAM",
        description: "取黄豆大小逆龄面霜，均匀涂抹于面部，配合提拉手法按摩，锁住水分与营养。",
        duration: "1分钟",
        productSlug: "face-cream",
      },
      {
        order: 4,
        name: "防晒",
        nameEn: "SUNSCREEN",
        description: "最后一步，涂抹足量轻透防晒霜，为肌肤撑起保护伞，开启元气满满的一天。",
        duration: "30秒",
        productSlug: "sunscreen",
      },
    ],
  },
  evening: {
    title: "晚间仪式",
    titleEn: "EVENING RITUAL",
    description: "夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新",
    steps: [
      {
        order: 1,
        name: "洁面",
        nameEn: "CLEANSE",
        description: "云朵洁面慕斯温和清洁，洗去一天的疲惫与污垢，为后续护肤做好准备。",
        duration: "1-2分钟",
        productSlug: "foam-cleanser",
      },
      {
        order: 2,
        name: "精华",
        nameEn: "SERUM",
        description: "夜间是肌肤修护的黄金时段，修护紧致精华帮助深层滋养，修复日间损伤。",
        duration: "30秒",
        productSlug: "serum",
      },
      {
        order: 3,
        name: "护理油",
        nameEn: "OIL",
        description: "臻萃护理油加强滋养，轻柔按摩促进吸收，为肌肤注入奢润能量（可选步骤）。",
        duration: "30秒",
        productSlug: "treatment-oil",
      },
      {
        order: 4,
        name: "面霜",
        nameEn: "CREAM",
        description: "逆龄面霜质地滋润，配合轻柔按摩，让营养在睡眠中持续渗透，次日醒来容光焕发。",
        duration: "1分钟",
        productSlug: "face-cream",
      },
    ],
  },
  couple: {
    title: "双人SPA",
    titleEn: "COUPLE SPA",
    description: "与伴侣一起，享受护肤的亲密时光，在彼此的呵护中，感受爱与美的交融",
    steps: [],
  },
};

/**
 * 护肤仪式页面内容组件
 * 样式参考 StoryContent，使用独立的导航栏
 * 主内容区域使用 bg-brand-gold/10 backdrop-blur-md 样式
 */
export function RitualContent() {
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
            src="/images/ritual-bg.jpg"
            alt="护肤仪式"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 主内容区域 + 展开按钮一体化 */}
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
                {/* 页面标题 - 没有选中标签时显示 */}
                {!activeTab && (
                  <div className={cn(
                    "text-center",
                    isExpanded ? "mb-6 sm:mb-8" : ""
                  )}>
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      SKINCARE RITUAL
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      护肤仪式
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      每一次护肤，都是与自己对话的珍贵时光
                    </p>
                  </div>
                )}

                {/* 展开后显示的内容 */}
                <AnimatePresence mode="wait">
                  {isExpanded && !activeTab && (
                    <m.div
                      key="tabs"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex flex-col items-center"
                    >
                      {/* 品牌 Logo 展示 */}
                      <m.div
                        className="mb-8 flex justify-center sm:mb-10"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
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

                      {/* 3个大标签按钮 */}
                      <div className="flex w-full max-w-3xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 transition-all duration-300 sm:gap-4 sm:px-8 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
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
                      exit={{ opacity: 0, x: 20 }}
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
                        {/* 描述 */}
                        <m.p
                          className="mb-6 text-center text-sm text-brand-charcoal/70 sm:text-base"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
                        >
                          {tabContents[activeTab].description}
                        </m.p>

                        {/* 晨间/晚间仪式步骤 */}
                        {activeTab !== "couple" && tabContents[activeTab].steps.length > 0 && (
                          <div className="space-y-4">
                            {tabContents[activeTab].steps.map((step, index) => (
                              <m.div
                                key={step.order}
                                className="rounded-xl border border-brand-beige bg-white p-4 shadow-sm"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: 0.15 + index * 0.08 }}
                              >
                                <div className="flex items-start gap-4">
                                  {/* 步骤序号 */}
                                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold text-sm font-medium text-white">
                                    {step.order}
                                  </div>

                                  {/* 步骤内容 */}
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-serif text-lg text-brand-charcoal">
                                        {step.name}
                                      </h3>
                                      <span className="text-xs uppercase tracking-wider text-brand-gold">
                                        {step.nameEn}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-sm leading-relaxed text-brand-charcoal/70">
                                      {step.description}
                                    </p>
                                    <div className="mt-2 flex items-center justify-between">
                                      <span className="text-xs text-brand-charcoal/50">
                                        ⏱ {step.duration}
                                      </span>
                                      {step.productSlug && (
                                        <Link
                                          href={`/products/${step.productSlug}`}
                                          className="flex items-center gap-1 text-xs text-brand-gold hover:underline"
                                        >
                                          <span>查看推荐产品</span>
                                          <ChevronRight className="h-3 w-3" />
                                        </Link>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </m.div>
                            ))}
                          </div>
                        )}

                        {/* 双人SPA内容 */}
                        {activeTab === "couple" && (
                          <div className="space-y-4">
                            <m.div
                              className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.15 }}
                            >
                              <h3 className="font-serif text-lg text-brand-charcoal">
                                💑 面对面护肤
                              </h3>
                              <p className="mt-2 text-sm text-brand-charcoal/70">
                                相对而坐，为彼此涂抹护肤品。用指尖传递温柔，在每一次触碰中加深情感连接。
                              </p>
                            </m.div>

                            <m.div
                              className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.23 }}
                            >
                              <h3 className="font-serif text-lg text-brand-charcoal">
                                🧴 互相按摩
                              </h3>
                              <p className="mt-2 text-sm text-brand-charcoal/70">
                                轮流为对方进行面部按摩，配合舒缓的音乐与香氛，创造属于你们的私密SPA时光。
                              </p>
                            </m.div>

                            <m.div
                              className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.31 }}
                            >
                              <h3 className="font-serif text-lg text-brand-charcoal">
                                🕯️ 仪式感布置
                              </h3>
                              <p className="mt-2 text-sm text-brand-charcoal/70">
                                点上香薰蜡烛，播放轻柔音乐，准备好柔软的毛巾和温热的花茶，让护肤成为一场浪漫约会。
                              </p>
                            </m.div>

                            {/* 产品推荐 */}
                            <m.div
                              className="mt-6 rounded-xl bg-brand-gold/10 p-4"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.39 }}
                            >
                              <p className="text-center text-sm text-brand-charcoal">
                                探索适合双人护肤的产品组合
                              </p>
                              <Link
                                href="/products"
                                className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand-gold py-2.5 text-sm text-white transition-colors hover:bg-brand-gold/90"
                              >
                                <span>查看产品系列</span>
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </m.div>
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

      {/* 底部导航栏 - 展开时隐藏 */}
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
              aria-label="护肤仪式页导航"
            >
              {/* 左侧主导航 - 护肤仪式 */}
              <Link
                href="/ritual"
                className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4"
              >
                {/* 图标容器 */}
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <Sun className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">
                    护肤仪式
                  </span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">
                    Ritual
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

