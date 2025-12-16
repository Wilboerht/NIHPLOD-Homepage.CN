"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, RitualIcon, ContactIcon, HomeIcon } from "@/components/website";

/**
 * 底部导航项配置 - 与 ProductsContent 一致
 */
const bottomNavItems = [
  { href: "/products", label: "了解产品", labelEn: "Products", icon: ShopIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
  { href: "/advisor", label: "护肤顾问", labelEn: "Consultant", icon: ContactIcon },
];

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 左侧导航图标 - 书本
const StoryNavIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M4.84204 17.4737C4.84204 14.2302 4.84204 6.52632 4.84204 6.52632C4.84204 5.13107 5.97311 4 7.36836 4H16.6315V14.9474C16.6315 14.9474 9.57156 14.9474 7.36836 14.9474C5.97888 14.9474 4.84204 16.0776 4.84204 17.4737Z" fill="#C3BC9F" stroke="#C3BC9F" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M16.6315 14.9471C16.6315 14.9471 7.85413 14.9471 7.36836 14.9471C5.97311 14.9471 4.84204 16.0781 4.84204 17.4734C4.84204 18.8686 5.97311 19.9997 7.36836 19.9997C8.2985 19.9997 12.7897 19.9997 19.1578 19.9997V4.8418" stroke="#C3BC9F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.78955 17.4746H16.2106" stroke="#C3BC9F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 自定义图标组件 - 支持 hover 状态
const StoryTabIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M12 3.49906C7.11519 0.805619 4.84294 4.31506 4.00002 5.49925C1.16778 6.10825 2 6.99749 3.50005 7.49925C4.10696 7.70225 5.57284 8.1607 6.50004 8.499C6.70234 10.1231 7.33149 11.5761 7.50004 11.999C7.50004 11.593 8.16279 9.6767 8.49994 9C12.9998 9.501 17.4999 11.999 17.9999 16.9991C17.393 18.2171 15.7529 20.6532 15.5 21.499L18.5 19.9991L22 20.9991C22 19.375 19.9273 17.6758 19 16.9991C19.4047 10.5029 16.3545 6.5987 14.5 5.49905C14.7023 4.68704 15.0786 3.33741 15.5 2.99906C13.8816 2.18704 12.5901 3.07614 12 3.49906Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const MissionIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M6.5 9H3.5V21H6.5V9Z" fill={color} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.5 3H10.5V21H13.5V3Z" fill={color} stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M20.5 13H17.5V21H20.5V13Z" fill={color} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const PhilosophyIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M12 14.8039C14.4853 14.8039 16.5 12.9526 16.5 9.80388V2.70703H7.5V9.80388C7.5 12.9526 9.51472 14.8039 12 14.8039Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M16.5 10.7305V4.89258H19.5C20.0523 4.89258 20.5064 5.34202 20.4533 5.89175C20.1416 9.11758 18.3208 10.7305 16.5 10.7305Z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 10.7305V4.89258H4.5C3.94772 4.89258 3.49361 5.34202 3.54672 5.89175C3.85836 9.11758 5.67918 10.7305 7.5 10.7305Z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 15V19" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 20H8" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const MediaIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M11.9999 10.0501C13.8755 10.0501 15.3961 8.5296 15.3961 6.65396C15.3961 4.77832 13.8755 3.25781 11.9999 3.25781C10.1243 3.25781 8.60376 4.77832 8.60376 6.65396C8.60376 8.5296 10.1243 10.0501 11.9999 10.0501Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.26245 18.0001V20.0756H20.7377V18.0001C20.7377 17.6475 20.6484 17.2952 20.4127 17.033C19.4463 15.9578 16.8734 14.2676 12.0001 14.2676C7.12675 14.2676 4.55386 15.9578 3.58744 17.033C3.35175 17.2952 3.26245 17.6475 3.26245 18.0001Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const AwardsIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M11.4954 1.88086C11.8096 1.6244 12.2727 1.64259 12.5657 1.93555L15.1809 4.55078H18.6487C19.0905 4.55084 19.4485 4.90879 19.4485 5.35059V8.81836L22.0637 11.4336C22.376 11.746 22.3761 12.2521 22.0637 12.5645L19.4485 15.1797V18.6475C19.4484 19.0892 19.0904 19.4472 18.6487 19.4473H15.1809L12.5657 22.0625C12.2533 22.3749 11.7472 22.3748 11.4348 22.0625L8.81958 19.4473H5.35181C4.91002 19.4473 4.55207 19.0892 4.552 18.6475V15.1797L1.93677 12.5645C1.62435 12.252 1.62436 11.746 1.93677 11.4336L4.552 8.81836V5.35059C4.552 4.90876 4.90998 4.55078 5.35181 4.55078H8.81958L11.4348 1.93555L11.4954 1.88086ZM16.1067 9.07227C15.7943 8.75985 15.2873 8.75985 14.9749 9.07227L10.8196 13.2275L9.02466 11.4326C8.71226 11.1203 8.2062 11.1203 7.8938 11.4326C7.58154 11.745 7.58151 12.2511 7.8938 12.5635L10.2542 14.9248C10.4041 15.0746 10.6076 15.1591 10.8196 15.1592C11.0315 15.1592 11.235 15.0745 11.385 14.9248L16.1067 10.2031C16.4188 9.89077 16.4188 9.38462 16.1067 9.07227Z" fill={color}/>
    </svg>
  );
};

// 标签页配置
type TabId = "story" | "media" | "awards";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string; isHovered?: boolean }>;
}

interface StorySection {
  type: "hero" | "section" | "mission-intro" | "mission-card" | "philosophy-item" | "mission-text" | "media-image";
  title?: string;
  subtitle?: string;
  paragraphs?: string[];
  image?: string;
  imageAlt?: string;
  imagePosition?: "right" | "bottom";
  icon?: "innovation" | "fusion" | "quality" | "sustainable";
}

interface TabContent {
  title: string;
  content: string[];
  isRichContent?: boolean;
  layout?: "default" | "cards" | "philosophy" | "mission-centered" | "media-images" | "awards-images";
  subtitle?: string;
  slogan?: string;
  sections?: StorySection[];
}

const tabs: TabConfig[] = [
  { id: "story", label: "品牌故事", icon: StoryTabIcon },
  { id: "media", label: "媒体报道", icon: MediaIcon },
  { id: "awards", label: "荣获奖项", icon: AwardsIcon },
];

// Tab 按钮组件 - 支持 hover 状态
const TabButton = ({
  tab,
  index,
  isLastInRow,
  isLastInDesktop,
  onClick,
  className
}: {
  tab: TabConfig;
  index: number;
  isLastInRow: boolean; // 移动端当前行最后一个
  isLastInDesktop: boolean; // 桌面端最后一个
  onClick: () => void;
  className?: string;
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
        "group relative flex flex-col items-center justify-center gap-3 px-3 py-6 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
        "transition-colors duration-300",
        className
      )}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.12 + index * 0.05, ease: [0.32, 0.72, 0, 1] }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
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
        title: "「前沿科技」堪比医美的脂质体技术",
        subtitle: "2008年 | 摩纳哥 | 联合实验室公司",
        paragraphs: [
          "Dr. Stefan 博士和他的团队\n潜心研发了特有的纳米乳液配方\n并通过与 Nexstar Pharmaceuticals 的合作\n加入了最先进的脂质体技术\n将真正能抵达真皮层的护肤体验展现于世",
          "旎柏让每一个产品都无与伦比\n将逆转时光的不可能，慢慢变得「有可能」",
        ],
        image: "/images/story/lab-research.png",
        imageAlt: "实验室研发场景",
      },
      {
        type: "section",
        title: "「灵感来源」来自大自然的神奇修复力",
        subtitle: "REVERSE TIME 逆转时光",
        paragraphs: [
          "海豚的肌肤拥有\n每两小时自我更新的神奇能力\n这种「逆转时光」的动物本能\n是旎柏成立的灵感来源",
          "所以旎柏将「DOLPHIN」这个单词逆转\n于是就有了 NIHPLOD",
        ],
        image: "/images/story/dolphin-ocean.png",
        imageAlt: "海豚在海洋中游泳",
      },
      {
        type: "section",
        title: "「公司使命」逆转时光的承诺",
        subtitle: "OUR MISSION",
        paragraphs: [
          "NIHPLOD 将脂质体技术与精选的天然活性成分相结合\n通过大量临床实验和调研使日常护肤变得美好",
          "通过最前沿的生物科技和配方\n我们在护肤上将尽最大的可能\n帮助人们「逆转时光」",
          "这是我们一直继续前行的最大动力",
        ],
        image: "/images/story/mission-image.png",
        imageAlt: "公司使命",
      },
      {
        type: "section",
        title: "「经营理念」顶奢体验 · 护肤艺术",
        subtitle: "OUR PHILOSOPHY",
        paragraphs: [
          "更珍贵的产品\n我们通过采集这个世上最好的原材料\n结合最前沿及有效的科技力量\n不断更新和进步",
          "更优越的体验\n通过严选的供应渠道，极致的专员服务\n我们力求为你做到最满意、舒适及专业",
          "更积极的方式\n我们提倡以健康的心态去面对每一天\n通过适量的运动\n合理的膳食及平衡的心理",
          "更艰巨的责任\n我们将售出的每款产品的2%捐赠给\n全球的慈善组织和非营利组织\n包括 UNF、SPF 等",
        ],
        image: "/images/story/philosophy-image.png",
        imageAlt: "经营理念",
      },
    ],
    content: [],
  },
  media: {
    title: "媒体报道",
    isRichContent: true,
    layout: "media-images",
    subtitle: " PRESS",
    sections: [
      // 左侧三张杂志
      {
        type: "media-image",
        image: "/images/story/media-1.png",
        imageAlt: "媒体报道合作杂志",
        title: "NIHPLOD x SpaChina",
      },
      // 右侧四张杂志封面
      {
        type: "media-image",
        image: "/images/story/media-2.png",
        imageAlt: "媒体报道杂志封面",
        title: "国际时尚杂志报道",
      },
    ],
    content: [],
  },
  awards: {
    title: "荣获奖项",
    isRichContent: true,
    layout: "awards-images",
    sections: [
      {
        type: "media-image",
        image: "/images/story/award-2.png",
        imageAlt: "Robb Report 优中优选",
        title: "全球精英奢侈品杂志《Robb Report》入选「优中优选」",
        subtitle: "被评价为最有效的「护肤体验」",
      },
      {
        type: "media-image",
        image: "/images/story/award-1.png",
        imageAlt: "TimeOut 影响力高奢品牌",
        title: "TimeOut 2024年度",
        subtitle: "影响力高奢品牌",
      },
      {
        type: "media-image",
        image: "/images/story/award-3.png",
        imageAlt: "多项国际大奖",
        paragraphs: [
          "瑞士声望奖  ·  最佳创新化妆品奖",
          "LUX杂志评选  ·  消费者满意奖",
          "健康与水疗创新奖  ·  最佳治疗产品",
          "最佳新晋抗衰老产品  ·  全球美容大奖",
        ],
      },
    ],
    content: [],
  },
};

interface StoryContentProps {
  backgroundImage?: string;
}

/**
 * 品牌故事页面内容组件
 * 样式参考 ProductsContent，使用独立的导航栏
 * 主内容区域使用 bg-[#EBE8DB] 不透明样式
 */
export function StoryContent({ backgroundImage }: StoryContentProps = {}) {
  // 初始状态为收起，这样可以看到导航栏收起 + 内容展开的动画
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // 页面加载后自动展开，触发导航栏收起 + 内容展开的动画
  useEffect(() => {
    // 延迟后自动展开，让用户能先看到导航栏再看到收起动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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
      {/* 全屏背景图片 - 延伸到安全区域外，覆盖状态栏 */}
      <div className="fullscreen-bg">
        <Image
          src={backgroundImage || "/images/bg.png"}
          alt="品牌故事"
          fill
          priority
          quality={100}
          className="object-cover"
          sizes="100vw"
        />
        {/* 毛玻璃遮罩层 - 滚动或展开时显示 */}
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
          duration: 0.5,
          ease: [0.32, 0.72, 0, 1]
        }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 使用 bg-[#EBE8DB] 不透明样式，收起时完全隐藏 */}
            <m.div
              className="w-full overflow-hidden rounded-b-2xl bg-[#EBE8DB] lg:rounded-b-3xl"
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: isExpanded ? "auto" : 0
              }}
              transition={{
                duration: 0.7,
                ease: [0.4, 0, 0.2, 1]
              }}
            >
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : "hidden"
              )}>
                {/* 页面标题 - 仅在展开且没有选中标签时显示 */}
                <AnimatePresence mode="popLayout">
                  {isExpanded && !activeTab && (
                    <m.div
                      key="title"
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="mb-6 text-center sm:mb-8"
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

                      {/* 3个大标签按钮 - 居中对齐 */}
                      <div className="flex w-full max-w-4xl items-stretch justify-center gap-3 sm:gap-4 md:gap-6">
                        {tabs.map((tab, index) => (
                          <TabButton
                            key={tab.id}
                            tab={tab}
                            index={index}
                            isLastInRow={index === tabs.length - 1}
                            isLastInDesktop={index === tabs.length - 1}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex-1"
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
                      <div className="flex-1 overflow-y-auto rounded-xl p-4 transition-all duration-300 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        {/* 卡片布局：公司使命 */}
                        {tabContents[activeTab].isRichContent && tabContents[activeTab].layout === "cards" && tabContents[activeTab].sections ? (
                          <div className="space-y-8 sm:space-y-10">
                            {/* 顶部介绍区域 */}
                            {tabContents[activeTab].sections.filter(s => s.type === "mission-intro").map((section, idx) => (
                              <m.div
                                key={idx}
                                className="text-center"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              >
                                <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm">
                                  {section.subtitle}
                                </p>
                                <h3 className="mt-2 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                                  {section.title}
                                </h3>
                                {section.paragraphs?.map((p, pIdx) => (
                                  <p key={pIdx} className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:text-base">
                                    {p}
                                  </p>
                                ))}
                              </m.div>
                            ))}

                            {/* 卡片网格 */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                              {tabContents[activeTab].sections.filter(s => s.type === "mission-card").map((section, cardIndex) => (
                                <m.div
                                  key={cardIndex}
                                  className="group rounded-2xl border border-brand-beige/50 bg-gradient-to-br from-brand-cream to-white p-5 transition-colors duration-300 hover:border-brand-gold/30 hover:shadow-md sm:p-6"
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.4, delay: 0.1 + cardIndex * 0.06, ease: [0.32, 0.72, 0, 1] }}
                                >
                                  {/* 图标 */}
                                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gold/10 transition-colors group-hover:bg-brand-gold/20 sm:h-14 sm:w-14">
                                    {section.icon === "innovation" && (
                                      <svg className="h-6 w-6 text-brand-gold sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                      </svg>
                                    )}
                                    {section.icon === "fusion" && (
                                      <svg className="h-6 w-6 text-brand-gold sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                      </svg>
                                    )}
                                    {section.icon === "quality" && (
                                      <svg className="h-6 w-6 text-brand-gold sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                                      </svg>
                                    )}
                                    {section.icon === "sustainable" && (
                                      <svg className="h-6 w-6 text-brand-gold sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                    )}
                                  </div>
                                  {/* 标题 */}
                                  <h4 className="mb-2 font-serif text-lg font-medium text-brand-charcoal sm:text-xl">
                                    {section.title}
                                  </h4>
                                  {/* 描述 */}
                                  {section.paragraphs?.map((p, pIdx) => (
                                    <p key={pIdx} className="text-sm leading-relaxed text-brand-charcoal/70">
                                      {p}
                                    </p>
                                  ))}
                                </m.div>
                              ))}
                            </div>
                          </div>
                        ) : tabContents[activeTab].isRichContent && tabContents[activeTab].layout === "mission-centered" && tabContents[activeTab].sections ? (
                          /* 公司使命：居中文字布局 */
                          <div className="flex min-h-[300px] flex-col items-center justify-center py-8 sm:py-12">
                            <m.div
                              className="text-center"
                              initial={{ opacity: 0, scale: 0.97 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                            >
                              <p className="mb-6 text-xs font-light uppercase tracking-[0.3em] text-brand-gold sm:mb-8 sm:text-sm">
                                {tabContents[activeTab].subtitle}
                              </p>
                              {tabContents[activeTab].sections.filter(s => s.type === "mission-text").map((section, idx) => (
                                <div key={idx} className="space-y-3 sm:space-y-4">
                                  {section.paragraphs?.map((line, lineIdx) => (
                                    <m.p
                                      key={lineIdx}
                                      className="font-serif text-base leading-relaxed text-brand-charcoal sm:text-lg md:text-xl"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      transition={{ duration: 0.4, delay: 0.1 + lineIdx * 0.05, ease: [0.32, 0.72, 0, 1] }}
                                    >
                                      {line}
                                    </m.p>
                                  ))}
                                </div>
                              ))}
                              {/* 使命图片 */}
                              <m.div
                                className="mt-8 sm:mt-10"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
                              >
                                <img
                                  src="/images/story/mission-image.png"
                                  alt="公司使命"
                                  className="mx-auto h-auto w-full max-w-md rounded-lg sm:max-w-lg md:max-w-xl"
                                />
                              </m.div>
                              {/* 装饰图片 */}
                              <m.div
                                className="mt-6 sm:mt-8"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
                              >
                                <img
                                  src="/images/story/mission-decoration.svg"
                                  alt="装饰图案"
                                  className="mx-auto h-16 w-auto opacity-60 sm:h-20 md:h-24"
                                />
                              </m.div>
                            </m.div>
                          </div>
                        ) : tabContents[activeTab].isRichContent && tabContents[activeTab].layout === "philosophy" && tabContents[activeTab].sections ? (
                          /* 经营理念布局：带序号的横向布局，垂直居中 */
                          <div className="flex min-h-full flex-col items-center justify-center py-6 sm:py-10">
                            {/* 顶部标题 */}
                            <m.div
                              className="mb-16 text-center sm:mb-20"
                              initial={{ opacity: 0, scale: 0.97 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                            >
                              <p className="text-xs font-light uppercase tracking-[0.3em] text-brand-gold sm:text-sm">
                                {tabContents[activeTab].subtitle}
                              </p>
                              <p className="mt-4 font-serif text-2xl text-brand-charcoal/80 sm:text-3xl md:text-4xl lg:text-5xl">
                                {tabContents[activeTab].slogan}
                              </p>
                            </m.div>

                            {/* 四个理念：横向排列带序号 */}
                            <div className="grid grid-cols-2 gap-4 sm:gap-8 md:gap-10 lg:grid-cols-4 lg:gap-12">
                              {tabContents[activeTab].sections.filter(s => s.type === "philosophy-item").map((section, idx) => (
                                <m.div
                                  key={idx}
                                  className="group relative"
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.4, delay: 0.08 + idx * 0.06, ease: [0.32, 0.72, 0, 1] }}
                                >
                                  {/* 序号 */}
                                  <div className="mb-3 flex items-center justify-center sm:mb-4 md:mb-5">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-gold/30 font-serif text-sm text-brand-gold sm:h-10 sm:w-10 sm:text-base md:h-12 md:w-12 md:text-lg">
                                      {String(idx + 1).padStart(2, '0')}
                                    </span>
                                  </div>
                                  {/* 标题 */}
                                  <h4 className="mb-2 text-center font-serif text-base font-medium text-brand-charcoal sm:mb-3 sm:text-lg md:mb-4 md:text-xl lg:text-2xl">
                                    {section.title}
                                  </h4>
                                  {/* 内容 */}
                                  <div className="space-y-0.5 text-center sm:space-y-1">
                                    {section.paragraphs?.map((line, lineIdx) => (
                                      <p key={lineIdx} className="text-xs leading-relaxed text-brand-charcoal/70 sm:text-sm md:text-base lg:text-lg">
                                        {line}
                                      </p>
                                    ))}
                                  </div>
                                </m.div>
                              ))}
                            </div>
                          </div>
                        ) : tabContents[activeTab].isRichContent && tabContents[activeTab].layout === "media-images" && tabContents[activeTab].sections ? (
                          /* 媒体报道：全新排版 */
                          <div className="flex h-full w-full flex-col items-center justify-center px-4 py-8">
                            {/* 顶部标题 */}
                            <m.div
                              className="mb-8 text-center sm:mb-12"
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                            >
                              <h2 className="font-serif text-4xl font-light italic tracking-[0.3em] text-gray-300 sm:text-5xl md:text-6xl lg:text-7xl">
                                PRESS
                              </h2>
                            </m.div>

                            {/* 两张图片并排显示 */}
                            <div className="flex w-full max-w-5xl flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-center sm:gap-8">
                              {/* 左侧图片 */}
                              <m.div
                                className="w-full sm:w-[55%]"
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
                              >
                                {tabContents[activeTab].sections[1] && (
                                  <Image
                                    src={tabContents[activeTab].sections[1].image || ""}
                                    alt={tabContents[activeTab].sections[1].imageAlt || ""}
                                    width={800}
                                    height={600}
                                    className="h-auto w-full"
                                    sizes="(max-width: 640px) 100vw, 55vw"
                                  />
                                )}
                              </m.div>

                              {/* 右侧图片 */}
                              <m.div
                                className="w-full sm:w-[40%]"
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.18, ease: [0.32, 0.72, 0, 1] }}
                              >
                                {tabContents[activeTab].sections[0] && (
                                  <Image
                                    src={tabContents[activeTab].sections[0].image || ""}
                                    alt={tabContents[activeTab].sections[0].imageAlt || ""}
                                    width={600}
                                    height={720}
                                    className="h-auto w-full"
                                    sizes="(max-width: 640px) 100vw, 40vw"
                                  />
                                )}
                              </m.div>
                            </div>
                          </div>
                        ) : tabContents[activeTab].isRichContent && tabContents[activeTab].layout === "awards-images" && tabContents[activeTab].sections ? (
                          /* 荣誉奖项：图片垂直居中展示 */
                          <div className="flex h-full w-full flex-col items-center overflow-y-auto px-4 py-6 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {/* 图片列表 - 垂直排列居中 */}
                            <div className="flex w-full max-w-2xl flex-col items-center gap-10 sm:gap-12">
                              {tabContents[activeTab].sections.map((section, index) => (
                                <m.div
                                  key={index}
                                  className="flex w-full flex-col items-center text-center"
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.5, delay: 0.06 + index * 0.08, ease: [0.32, 0.72, 0, 1] }}
                                >
                                  {/* 图片 */}
                                  <div className="mb-4 w-full max-w-md sm:max-w-lg">
                                    <Image
                                      src={section.image || ""}
                                      alt={section.imageAlt || ""}
                                      width={500}
                                      height={400}
                                      className="h-auto w-full"
                                      sizes="(max-width: 640px) 100vw, 500px"
                                    />
                                  </div>
                                  {/* 文字描述 */}
                                  {section.title && (
                                    <h3 className="whitespace-pre-line font-serif text-lg font-medium text-brand-charcoal sm:text-xl md:text-2xl">
                                      {section.title}
                                    </h3>
                                  )}
                                  {section.subtitle && (
                                    <p className="mt-1 font-serif text-sm text-brand-charcoal/70 sm:text-base">
                                      {section.subtitle}
                                    </p>
                                  )}
                                  {/* 奖项卡片 - 4个一行 */}
                                  {section.paragraphs && section.paragraphs.length > 0 && (
                                    <div className="mt-1 grid w-full max-w-2xl grid-cols-2 gap-0 sm:grid-cols-4 sm:gap-0">
                                      {section.paragraphs.map((line, lineIndex) => (
                                        <div
                                          key={lineIndex}
                                          className="flex flex-col items-center justify-center border-l border-brand-charcoal/20 px-3 py-2 text-center first:border-l-0 sm:px-4"
                                        >
                                          {line.split("  ·  ").map((award, awardIndex) => (
                                            <p
                                              key={awardIndex}
                                              className="font-serif text-xs leading-relaxed text-brand-charcoal/80 sm:text-sm"
                                            >
                                              {award}
                                            </p>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </m.div>
                              ))}
                            </div>
                          </div>
                        ) : tabContents[activeTab].isRichContent && tabContents[activeTab].sections ? (
                          /* 富内容：品牌故事 */
                          <div className="space-y-12 sm:space-y-16 md:space-y-20">
                            {tabContents[activeTab].sections.map((section, sectionIndex) => (
                              <m.div
                                key={sectionIndex}
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.06 + sectionIndex * 0.06, ease: [0.32, 0.72, 0, 1] }}
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
                                      {section.image && (
                                        <div className="relative mx-auto aspect-[4/3] max-w-md overflow-hidden rounded-2xl shadow-sm">
                                          <Image
                                            src={section.image}
                                            alt={section.imageAlt || ""}
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 768px) 100vw, 448px"
                                          />
                                        </div>
                                      )}
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
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.06 + index * 0.04, ease: [0.32, 0.72, 0, 1] }}
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
            </m.div>

            {/* 展开/收起按钮 - 始终只有底部圆角 */}
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
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
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
            exit={{ opacity: 0, scale: 0.95, y: 40 }}
            transition={{
              duration: 0.6,
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

