"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, ContactIcon, HomeIcon, RitualIcon } from "@/components/website";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShopIcon },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: ContactIcon },
];

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 自定义图标组件 - 支持 hover 状态
const SunIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M12 18.5C15.5898 18.5 18.5 15.5898 18.5 12C18.5 8.41015 15.5898 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5898 8.41015 18.5 12 18.5Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M12 3C12.6904 3 13.25 2.44036 13.25 1.75C13.25 1.05964 12.6904 0.5 12 0.5C11.3097 0.5 10.75 1.05964 10.75 1.75C10.75 2.44036 11.3097 3 12 3Z" fill={color}/>
      <path d="M19.25 6C19.9404 6 20.5 5.44035 20.5 4.75C20.5 4.05964 19.9404 3.5 19.25 3.5C18.5597 3.5 18 4.05964 18 4.75C18 5.44035 18.5597 6 19.25 6Z" fill={color}/>
      <path d="M22.25 13.25C22.9404 13.25 23.5 12.6904 23.5 12C23.5 11.3097 22.9404 10.75 22.25 10.75C21.5597 10.75 21 11.3097 21 12C21 12.6904 21.5597 13.25 22.25 13.25Z" fill={color}/>
      <path d="M19.25 20.5C19.9404 20.5 20.5 19.9404 20.5 19.25C20.5 18.5597 19.9404 18 19.25 18C18.5597 18 18 18.5597 18 19.25C18 19.9404 18.5597 20.5 19.25 20.5Z" fill={color}/>
      <path d="M12 23.5C12.6904 23.5 13.25 22.9404 13.25 22.25C13.25 21.5597 12.6904 21 12 21C11.3097 21 10.75 21.5597 10.75 22.25C10.75 22.9404 11.3097 23.5 12 23.5Z" fill={color}/>
      <path d="M4.75 20.5C5.44035 20.5 6 19.9404 6 19.25C6 18.5597 5.44035 18 4.75 18C4.05964 18 3.5 18.5597 3.5 19.25C3.5 19.9404 4.05964 20.5 4.75 20.5Z" fill={color}/>
      <path d="M1.75 13.25C2.44036 13.25 3 12.6904 3 12C3 11.3097 2.44036 10.75 1.75 10.75C1.05964 10.75 0.5 11.3097 0.5 12C0.5 12.6904 1.05964 13.25 1.75 13.25Z" fill={color}/>
      <path d="M4.75 6C5.44035 6 6 5.44035 6 4.75C6 4.05964 5.44035 3.5 4.75 3.5C4.05964 3.5 3.5 4.05964 3.5 4.75C3.5 5.44035 4.05964 6 4.75 6Z" fill={color}/>
    </svg>
  );
};

const MoonIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M13.8237 3.18488C11.3623 3.82663 9.54547 6.06477 9.54547 8.72728C9.54547 11.8904 12.1096 14.4545 15.2727 14.4545C17.9352 14.4545 20.1734 12.6377 20.8151 10.1763C20.9363 10.7652 21 11.3752 21 12C21 16.9706 16.9706 21 12 21C7.02943 21 3 16.9706 3 12C3 7.02943 7.02943 3 12 3C12.6248 3 13.2348 3.06367 13.8237 3.18488Z" fill={color} stroke={color} strokeWidth="1.44" strokeLinejoin="round"/>
    </svg>
  );
};

const HeartIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7.49983 4.00195C4.46222 4.00195 1.99976 6.46443 1.99976 9.50202C1.99976 15.0021 8.49984 20.0022 11.9999 21.1653C15.4999 20.0022 22 15.0021 22 9.50202C22 6.46443 19.5375 4.00195 16.4999 4.00195C14.6398 4.00195 12.9952 4.92542 11.9999 6.33888C11.0045 4.92542 9.36 4.00195 7.49983 4.00195Z" fill={color} stroke={color} strokeWidth="1.60002" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// 标签页配置
type TabId = "morning" | "evening" | "couple";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string; isHovered?: boolean }>;
}

const tabs: TabConfig[] = [
  { id: "morning", label: "晨间仪式", icon: SunIcon },
  { id: "evening", label: "晚间仪式", icon: MoonIcon },
  { id: "couple", label: "双人SPA", icon: HeartIcon },
];

// Tab 按钮组件 - 支持 hover 状态
const TabButton = ({
  tab,
  index,
  isLast,
  onClick
}: {
  tab: TabConfig;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <m.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 transition-all duration-300 sm:gap-4 sm:px-8 sm:py-8 md:py-10",
        !isLast && "border-r border-brand-charcoal/20"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 + index * 0.06, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* 大图标 */}
      <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28">
        <Icon className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24" isHovered={isHovered} />
      </div>
      {/* 标签文字 */}
      <span className={cn(
        "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
        isHovered ? "text-brand-charcoal" : "text-brand-charcoal/70"
      )}>
        {tab.label}
      </span>
    </m.button>
  );
};

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
 * 主内容区域使用 bg-[#EBE8DB] 不透明样式
 */
export function RitualContent() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // 监听滚动，添加毛玻璃效果
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* 全屏背景图片 - 始终全屏显示，不受展开/收起影响 */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.png"
          alt="护肤仪式"
          fill
          priority
          quality={100}
          className="object-cover"
          sizes="100vw"
        />
        {/* 毛玻璃遮罩层 - 滚动时显示 */}
        <div
          className={cn(
            "absolute inset-0 bg-white/30 backdrop-blur-md transition-opacity duration-300",
            isScrolled || isExpanded ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* 内容区域容器 - 使用 framer-motion 统一控制动画 */}
      <m.div
        className="fixed inset-x-0 top-0 z-10"
        animate={{
          bottom: isExpanded ? 0 : 112 // bottom-28 = 7rem = 112px
        }}
        transition={{
          duration: 0.5,
          ease: [0.32, 0.72, 0, 1]
        }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1,
            bottom: isExpanded ? 16 : 0 // bottom-4 = 1rem = 16px
          }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="absolute left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 bg-[#EBE8DB] 不透明样式 */}
            <m.div
              className="w-full overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl"
              animate={{
                flexGrow: isExpanded ? 1 : 0
              }}
              transition={{
                duration: 0.5,
                ease: [0.32, 0.72, 0, 1]
              }}
            >
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""
              )}>
                {/* 页面标题 - 收起时始终显示，展开时仅在没有选中标签时显示 */}
                <AnimatePresence mode="popLayout">
                  {(!isExpanded || !activeTab) && (
                    <m.div
                      key="title"
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={cn(
                        "text-center",
                        isExpanded ? "mb-6 sm:mb-8" : ""
                      )}
                    >
                      <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                        SKINCARE RITUAL
                      </p>
                      <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                        护肤仪式
                      </h1>
                      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                        每一次护肤，都是与自己对话的珍贵时光
                      </p>
                    </m.div>
                  )}
                </AnimatePresence>

                {/* 展开后显示的内容 */}
                <AnimatePresence mode="popLayout">
                  {isExpanded && !activeTab && (
                    <m.div
                      key="tabs"
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex flex-col items-center"
                    >
                      {/* 品牌 Logo 展示 */}
                      <m.div
                        className="mb-8 flex justify-center sm:mb-10"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
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
                        {tabs.map((tab, index) => (
                          <TabButton
                            key={tab.id}
                            tab={tab}
                            index={index}
                            isLast={index === tabs.length - 1}
                            onClick={() => setActiveTab(tab.id)}
                          />
                        ))}
                      </div>
                    </m.div>
                  )}

                  {/* 选中标签后显示的内容 */}
                  {isExpanded && activeTab && (
                    <m.div
                      key={activeTab}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex h-full flex-col"
                    >
                      {/* 返回按钮和标题 */}
                      <div className="mb-4 flex items-center justify-between sm:mb-6">
                        <m.button
                          type="button"
                          onClick={() => setActiveTab(null)}
                          className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                        >
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="text-sm sm:text-base">返回</span>
                        </m.button>
                        <m.h2
                          className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl"
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: 0.06, ease: [0.32, 0.72, 0, 1] }}
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

                        {/* 双人SPA内容 - 从 steps 读取 */}
                        {activeTab === "couple" && (
                          <div className="space-y-4">
                            {tabContents[activeTab].steps.map((step, index) => (
                              <m.div
                                key={step.order}
                                className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: 0.15 + index * 0.08 }}
                              >
                                <h3 className="font-serif text-lg text-brand-charcoal">
                                  {step.name}
                                </h3>
                                <p className="mt-2 text-sm text-brand-charcoal/70">
                                  {step.description}
                                </p>
                              </m.div>
                            ))}

                            {/* 产品推荐 */}
                            <m.div
                              className="mt-6 rounded-xl bg-brand-gold/10 p-4"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.15 + tabContents[activeTab].steps.length * 0.08 }}
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
            </m.div>

            {/* 展开/收起按钮 - 无缝连接 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
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

      {/* 底部导航栏 - 展开时隐藏 */}
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
              aria-label="护肤仪式页导航"
            >
              {/* 左侧主导航 - 护肤仪式 */}
              <Link
                href="/ritual"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <RitualIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    护肤仪式
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Ritual
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

