"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, ContactIcon, HomeIcon, RitualIcon } from "@/components/website";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "了解产品", labelEn: "Products", icon: ShopIcon },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/advisor", label: "护肤顾问", labelEn: "Consultant", icon: ContactIcon },
];

// 模块配置 - 5个护肤仪式模块
type ModuleId = "morning" | "evening" | "spa" | "travel" | "professional";

interface ModuleConfig {
  id: ModuleId;
  number: string;
  label: string;
  description: string;
}

const modules: ModuleConfig[] = [
  { id: "morning", number: "01", label: "优雅日间", description: "在晨光熹微中唤醒肌肤呼吸，建立全天候的丝缎防护屏障。" },
  { id: "evening", number: "02", label: "睡前仪式", description: "深度修护与静谧愈合，利用黄金睡眠期重塑轮廓线条。" },
  { id: "spa", number: "03", label: "居家SPA", description: "沉浸式的五感体验，将浴室转化为私人的愈疗空间。" },
  { id: "travel", number: "04", label: "轻悦旅行", description: "对抗机舱干燥与温差压力，维持动态的肌肤生理平衡。" },
  { id: "professional", number: "05", label: "专业水疗", description: "高浓度活性萃取配合精准手法，实现极致的肤质蜕变。" },
];

// 护肤步骤类型
interface RitualStep {
  title: string;
  description: string;
}

// 方案类型
interface Scheme {
  id: string;
  name: string;
  tag: string;
  desc: string;
  steps: RitualStep[];
}

// 模块数据类型
type ModuleData = Record<ModuleId, Scheme[]>;

// 默认模块数据 - 参照 ref a1.html
const defaultModuleData: ModuleData = {
  morning: [
    {
      id: "d1",
      name: "晨间焕活",
      tag: "唤醒",
      desc: "开启一天的透亮肌底",
      steps: [
        { title: "温和洁面", description: "使用氨基酸洗面奶，轻柔除去夜间油脂。" },
        { title: "纤维水膜", description: "湿敷3分钟，快速提升肌肤含水量。" },
        { title: "光感防护", description: "涂抹自带提亮效果的日乳，抵御外界污染。" },
      ],
    },
    {
      id: "d2",
      name: "都市防护",
      tag: "抗氧",
      desc: "对抗城市环境压力",
      steps: [
        { title: "屏障修护", description: "建立微米级防护层。" },
        { title: "抗蓝光精华", description: "阻隔电子屏幕带来的隐形伤害。" },
      ],
    },
  ],
  evening: [
    {
      id: "n1",
      name: "月光深润",
      tag: "修复",
      desc: "利用黄金睡眠期修护",
      steps: [
        { title: "深度卸妆", description: "彻底溶解残妆与污垢。" },
        { title: "夜间精华", description: "层层渗透，激活细胞自我更新。" },
        { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。" },
      ],
    },
    {
      id: "n2",
      name: "助眠舒缓",
      tag: "解压",
      desc: "放松身心的入眠仪式",
      steps: [
        { title: "香氛喷雾", description: "营造宁静的睡眠氛围。" },
        { title: "穴位按摩", description: "舒缓面部肌肉紧张感。" },
      ],
    },
  ],
  spa: [
    {
      id: "s1",
      name: "热能排浊",
      tag: "排毒",
      desc: "家中的恒温理疗体验",
      steps: [
        { title: "热敷开启", description: "42度恒温毛巾覆盖，打开毛孔。" },
        { title: "粘土清洁", description: "深层吸附毛孔深处杂质。" },
      ],
    },
    {
      id: "s2",
      name: "丝滑塑颜",
      tag: "紧致",
      desc: "塑造面部清晰轮廓",
      steps: [
        { title: "拨筋手法", description: "配合刮痧板进行提拉按摩。" },
        { title: "高倍滋养", description: "注入浓缩修护能量。" },
      ],
    },
  ],
  travel: [
    {
      id: "t1",
      name: "高空补水",
      tag: "极速",
      desc: "应对机舱干燥环境",
      steps: [
        { title: "免洗洁肤", description: "便捷除去面部灰尘。" },
        { title: "补水喷雾", description: "随时补充流失水分。" },
      ],
    },
    {
      id: "t2",
      name: "落地急救",
      tag: "舒缓",
      desc: "改善时差引起的倦怠",
      steps: [
        { title: "冰感面膜", description: "降低表皮温度，消除浮肿。" },
        { title: "维稳修护", description: "平复换季或地域带来的不适。" },
      ],
    },
  ],
  professional: [
    {
      id: "p1",
      name: "酵素焕肤",
      tag: "专业",
      desc: "医学级角质更新处理",
      steps: [
        { title: "酸性激活", description: "软化陈旧角质，促进代谢。" },
        { title: "中和平衡", description: "恢复肌肤天然酸碱值。" },
      ],
    },
    {
      id: "p2",
      name: "注氧鲜肌",
      tag: "活氧",
      desc: "高压氧渗透嫩肤",
      steps: [
        { title: "导入精粹", description: "配合专业设备深层透皮。" },
        { title: "屏障封存", description: "强效锁水，持久焕发神采。" },
      ],
    },
  ],
};

interface RitualContentProps {
  backgroundImage?: string;
}

/**
 * 护肤仪式页面内容组件
 * 三层级交互式布局：Level 1 模块选择 -> Level 2 方案选择 -> Level 3 详细步骤
 */
export function RitualContent({ backgroundImage }: RitualContentProps) {
  // 展开状态
  const [isExpanded, setIsExpanded] = useState(false);
  // 当前层级: 1=模块选择, 2=方案选择, 3=步骤详情
  const [currentLevel, setCurrentLevel] = useState(1);
  // 选中的模块
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null);
  // 选中的方案
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  // 悬停的模块索引
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // 移动端菜单
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // 使用默认数据
  const moduleData = defaultModuleData;

  // 选择模块
  const selectModule = (moduleId: ModuleId) => {
    setSelectedModule(moduleId);
    setCurrentLevel(2);
  };

  // 选择方案
  const selectScheme = (scheme: Scheme) => {
    setSelectedScheme(scheme);
    setCurrentLevel(3);
  };

  // 返回上一级
  const _goBack = () => {
    if (currentLevel === 3) {
      setSelectedScheme(null);
      setCurrentLevel(2);
    } else if (currentLevel === 2) {
      setSelectedModule(null);
      setCurrentLevel(1);
    }
  };

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
      {/* 底层暗金色背景 */}
      <div className="fullscreen-bg-base" />

      {/* 全屏背景图片 - 带边距和圆角 */}
      <div className="fullscreen-bg">
        <Image
          src={backgroundImage || "/images/bg.png"}
          alt="护肤仪式"
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
            {/* 主内容区域 - 三层级布局 */}
            <m.div
              className="w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              animate={{
                height: isExpanded ? "calc(100vh - 120px)" : 0
              }}
              transition={{
                duration: 0.8,
                ease: [0.22, 1, 0.36, 1]
              }}
              style={{ minHeight: isExpanded ? "400px" : 0 }}
            >
              <div className={cn(
                "flex h-full flex-col overflow-hidden",
                !isExpanded && "hidden"
              )}>
                {/* 顶部栏：LOGO + 面包屑 */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-brand-charcoal/5 px-4 py-3 sm:px-8 sm:py-4 lg:px-12">
                  {/* 左侧：LOGO（始终显示） */}
                  <Link href="/" className="block transition-opacity hover:opacity-70">
                    <Image
                      src="/images/logo.png"
                      alt="NIHPLOD"
                      width={100}
                      height={32}
                      className="h-6 w-auto sm:h-7 lg:h-8"
                      priority
                    />
                  </Link>

                  {/* 右侧：面包屑导航（可点击返回）- 仅 Level 2/3 时显示 */}
                  <AnimatePresence mode="wait">
                    {currentLevel >= 2 && (
                      <m.nav
                        className="flex items-center gap-2 text-xs text-brand-charcoal/50 sm:text-sm"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {/* 护肤仪式 - 点击返回 Level 1 */}
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentLevel(1);
                            setSelectedModule(null);
                            setSelectedScheme(null);
                          }}
                          className="transition-colors duration-300 hover:text-brand-charcoal"
                        >
                          护肤仪式
                        </button>

                        {selectedModule && (
                          <>
                            <span className="text-brand-charcoal/30">/</span>
                            {currentLevel === 2 ? (
                              <span className="text-brand-charcoal">
                                {modules.find(m => m.id === selectedModule)?.label}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentLevel(2);
                                  setSelectedScheme(null);
                                }}
                                className="transition-colors duration-300 hover:text-brand-charcoal"
                              >
                                {modules.find(m => m.id === selectedModule)?.label}
                              </button>
                            )}
                          </>
                        )}

                        {currentLevel === 3 && selectedScheme && (
                          <>
                            <span className="text-brand-charcoal/30">/</span>
                            <span className="text-brand-charcoal">{selectedScheme.name}</span>
                          </>
                        )}
                      </m.nav>
                    )}
                  </AnimatePresence>
                </div>

                {/* 视口容器 - 三层级切换 */}
                <div className="relative flex-1 overflow-hidden">
                  {/* Level 1: 垂直模块面板 - 参照 ref sp1.html */}
                  <AnimatePresence mode="wait">
                    {currentLevel === 1 && (
                      <m.div
                        key="level1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0 flex gap-4 p-4 sm:gap-5 sm:p-5 lg:gap-6 lg:p-6"
                      >
                        {modules.map((module, index) => (
                          <m.button
                            key={module.id}
                            type="button"
                            onClick={() => selectModule(module.id)}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className={cn(
                              "group relative flex cursor-pointer flex-col justify-end overflow-hidden rounded-sm border-l p-5 sm:p-8 lg:p-10",
                              hoveredIndex === index
                                ? "flex-[1.6] border-brand-charcoal/15 bg-white/65 shadow-[0_30px_60px_-10px_rgba(0,38,62,0.08)]"
                                : hoveredIndex !== null
                                  ? "flex-[0.9] border-brand-charcoal/5 bg-white/25"
                                  : "flex-1 border-brand-charcoal/10 bg-white/30"
                            )}
                            style={{
                              transition: "flex 0.9s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.6s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.5s ease, box-shadow 0.7s cubic-bezier(0.16, 1, 0.3, 1)"
                            }}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.1 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                          >
                            {/* 序号 */}
                            <span
                              className={cn(
                                "mb-auto font-sans text-[13px] tracking-wide sm:text-sm",
                                hoveredIndex === index
                                  ? "text-brand-charcoal/55"
                                  : "text-brand-charcoal/30"
                              )}
                              style={{ transition: "color 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
                            >
                              {module.number}
                            </span>

                            {/* 标题 - 竖排 */}
                            <h2
                              className={cn(
                                "mb-4 font-light tracking-wide text-brand-charcoal [writing-mode:vertical-rl] sm:mb-5",
                                hoveredIndex === index
                                  ? "text-[24px] sm:text-[28px] lg:text-[32px]"
                                  : "text-xl sm:text-2xl lg:text-[26px]"
                              )}
                              style={{ transition: "font-size 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
                            >
                              {module.label}
                            </h2>

                            {/* 描述文字 - hover 时显示 */}
                            <p
                              className={cn(
                                "max-w-[180px] text-[12px] leading-relaxed text-brand-charcoal/50 sm:max-w-[200px] sm:text-[13px]",
                                hoveredIndex === index
                                  ? "translate-y-0 opacity-100"
                                  : "pointer-events-none translate-y-3 opacity-0"
                              )}
                              style={{
                                transition: hoveredIndex === index
                                  ? "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s"
                                  : "opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
                              }}
                            >
                              {module.description}
                            </p>

                            {/* 底部指示线 - hover 时显示 */}
                            <div
                              className={cn(
                                "absolute bottom-0 left-0 h-px bg-brand-charcoal/15",
                                hoveredIndex === index ? "w-full" : "w-0"
                              )}
                              style={{
                                transition: hoveredIndex === index
                                  ? "width 1s cubic-bezier(0.16, 1, 0.3, 1) 0.1s"
                                  : "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                              }}
                            />
                          </m.button>
                        ))}
                      </m.div>
                    )}

                    {/* Level 2: 左右分栏式布局 */}
                    {currentLevel === 2 && selectedModule && (
                      <m.div
                        key="level2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0 flex flex-col overflow-hidden p-4 sm:p-6 lg:flex-row lg:p-8"
                      >
                        {/* 左侧：模块主题图 */}
                        <m.div
                          className="relative flex-shrink-0 overflow-hidden rounded-sm bg-brand-charcoal/5 lg:w-[45%]"
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {/* 占位图背景 */}
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-charcoal/5 to-brand-charcoal/10" />

                          {/* 装饰性图形 */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="h-3/4 w-3/4 opacity-[0.07]" viewBox="0 0 200 200">
                              <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.5" />
                              <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="0.5" />
                              <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                              <path d="M100 20 L100 180 M20 100 L180 100" stroke="currentColor" strokeWidth="0.3" />
                            </svg>
                          </div>

                          {/* 模块信息覆盖层 */}
                          <div className="relative flex h-full flex-col justify-end p-6 sm:p-10 lg:p-12">
                            <m.div
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            >
                              <span className="text-sm text-brand-charcoal/40">
                                {modules.find(m => m.id === selectedModule)?.number}
                              </span>
                              <h2 className="mt-2 text-3xl font-light text-brand-charcoal sm:text-4xl lg:text-5xl">
                                {modules.find(m => m.id === selectedModule)?.label}
                              </h2>
                              <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-brand-charcoal/50 lg:text-base">
                                {modules.find(m => m.id === selectedModule)?.description}
                              </p>
                            </m.div>
                          </div>
                        </m.div>

                        {/* 右侧：方案列表 */}
                        <div className="flex flex-1 flex-col justify-center overflow-x-hidden overflow-y-auto py-4 sm:py-6 lg:py-8">
                          <div className="flex flex-col gap-2 lg:gap-3 overflow-hidden">
                            {moduleData[selectedModule].map((scheme, index) => (
                              <m.button
                                key={scheme.id}
                                type="button"
                                onClick={() => selectScheme(scheme)}
                                className="group relative rounded-sm p-5 text-left sm:p-6 lg:p-8"
                                style={{
                                  transition: "background-color 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
                                }}
                                whileHover={{ backgroundColor: "rgba(255,255,255,0.7)" }}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                              >
                                {/* 序号 */}
                                <span className="mb-2 block text-xs text-brand-charcoal/30 sm:mb-3">
                                  0{index + 1}
                                </span>

                                {/* 标题行：名称 + 标签 */}
                                <div className="mb-2 flex items-center gap-3 sm:mb-3 sm:gap-4">
                                  <h3 className="text-lg font-light text-brand-charcoal sm:text-xl lg:text-2xl">
                                    {scheme.name}
                                  </h3>
                                  <span className="border border-brand-charcoal/25 px-2 py-0.5 text-[9px] tracking-wide text-brand-charcoal/45 sm:px-3 sm:text-[10px]">
                                    {scheme.tag}
                                  </span>
                                </div>

                                {/* 描述 */}
                                <p className="max-w-[380px] pr-10 text-[12px] leading-relaxed text-brand-charcoal/40 sm:text-[13px]">
                                  {scheme.desc}
                                </p>

                                {/* 右侧箭头 */}
                                <div
                                  className="absolute right-5 top-1/2 -translate-y-1/2 text-brand-charcoal/15 sm:right-6 lg:right-8"
                                >
                                  <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    className="transition-transform duration-500 group-hover:translate-x-1.5"
                                  >
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </m.button>
                            ))}
                          </div>
                        </div>
                      </m.div>
                    )}

                    {/* Level 3: 详细步骤 - 极简左侧 + 连接线步骤 */}
                    {currentLevel === 3 && selectedScheme && (
                      <m.div
                        key="level3"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
                        className="absolute inset-0 flex flex-col overflow-hidden p-4 sm:p-6 lg:flex-row lg:gap-8 lg:p-8"
                      >
                        {/* 左侧：极简视觉区域 */}
                        <m.div
                          className="relative flex flex-shrink-0 flex-col justify-center overflow-hidden rounded-sm bg-gradient-to-br from-brand-charcoal/[0.02] to-brand-charcoal/[0.06] p-5 sm:p-8 lg:w-[40%] lg:p-10"
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 装饰性流体图形 - 背景层 */}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]">
                            <m.div
                              className="h-[280px] w-[280px] rounded-[40%_60%_70%_30%/40%_50%_60%_50%] bg-brand-charcoal sm:h-[320px] sm:w-[320px] lg:h-[380px] lg:w-[380px]"
                              animate={{
                                borderRadius: [
                                  "40% 60% 70% 30% / 40% 50% 60% 50%",
                                  "60% 40% 30% 70% / 50% 60% 40% 50%",
                                  "40% 60% 70% 30% / 40% 50% 60% 50%"
                                ]
                              }}
                              transition={{
                                duration: 8,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }}
                            />
                          </div>

                          {/* 装饰性 SVG 圆环 */}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <svg className="h-48 w-48 opacity-[0.06] sm:h-56 sm:w-56 lg:h-64 lg:w-64" viewBox="0 0 200 200">
                              <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-brand-charcoal" />
                              <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-brand-charcoal" />
                              <m.path
                                d="M100 30 Q130 100 100 170 Q70 100 100 30"
                                fill="currentColor"
                                className="text-brand-charcoal"
                                initial={{ opacity: 0.3 }}
                                animate={{ opacity: [0.3, 0.5, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                              />
                            </svg>
                          </div>

                          {/* 模块归属信息 */}
                          <m.div
                            className="relative z-10 mb-2 flex items-center gap-2 text-[10px] text-brand-charcoal/35 sm:mb-3 sm:text-[11px]"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.15 }}
                          >
                            <span className="tracking-wide">{modules.find(m => m.id === selectedModule)?.label}</span>
                            <span className="text-brand-charcoal/20">·</span>
                            <span className="tracking-wide">{modules.find(m => m.id === selectedModule)?.number}</span>
                          </m.div>

                          {/* 标签 */}
                          <m.span
                            className="relative z-10 mb-2 w-fit border border-brand-charcoal/20 bg-white/30 px-3 py-1 text-[10px] uppercase tracking-widest text-brand-charcoal/50 backdrop-blur-sm sm:mb-4 sm:px-4 sm:py-1.5"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                          >
                            {selectedScheme.tag}
                          </m.span>

                          {/* 方案标题 */}
                          <m.h2
                            className="relative z-10 mb-2 text-xl font-light text-brand-charcoal sm:mb-4 sm:text-2xl lg:text-3xl"
                            style={{ letterSpacing: "-0.02em" }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.25 }}
                          >
                            {selectedScheme.name}
                          </m.h2>

                          {/* 描述 */}
                          <m.p
                            className="relative z-10 line-clamp-2 max-w-[300px] text-[12px] leading-[1.8] text-brand-charcoal/50 sm:line-clamp-none sm:text-[13px] lg:max-w-[320px] lg:text-sm"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.3 }}
                          >
                            {selectedScheme.desc}
                          </m.p>

                          {/* 步骤数量提示 */}
                          <m.div
                            className="relative z-10 mt-4 flex items-center gap-3 text-[11px] text-brand-charcoal/40 sm:mt-8"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                          >
                            <span className="h-px w-8 bg-brand-charcoal/20 sm:w-10" />
                            <span className="tracking-wide">{selectedScheme.steps.length} 个护理步骤</span>
                          </m.div>
                        </m.div>

                        {/* 右侧：步骤时间轴 */}
                        <m.div
                          className="relative mt-3 flex flex-1 flex-col overflow-y-auto rounded-sm border border-brand-charcoal/[0.06] bg-white p-5 shadow-[0_4px_40px_rgba(0,0,0,0.04)] sm:mt-5 sm:p-7 lg:mt-0 lg:p-10"
                          initial={{ opacity: 0, x: 30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 流程标题 - 带装饰线 */}
                          <m.div
                            className="mb-5 flex items-center gap-3 sm:mb-7 lg:mb-8"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.25 }}
                          >
                            <span className="h-px w-4 bg-brand-charcoal/25 sm:w-6" />
                            <h3 className="text-[10px] font-normal uppercase tracking-[0.15em] text-brand-charcoal/40 sm:text-[11px]">
                              仪式流程 / Procedure
                            </h3>
                          </m.div>

                          {/* 步骤列表 - 带连接线 */}
                          <div className="relative flex flex-1 flex-col justify-center gap-1">
                            {selectedScheme.steps.map((step, index) => (
                              <m.div
                                key={step.title}
                                className="group relative flex gap-4 rounded-lg px-2 py-4 transition-colors duration-300 hover:bg-brand-beige/20 sm:gap-5 sm:px-3 sm:py-5 lg:gap-6 lg:py-6"
                                initial={{ opacity: 0, y: 25 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.3 + index * 0.1, ease: [0.19, 1, 0.22, 1] }}
                              >
                                {/* 左侧：序号 + 连接线 */}
                                <div className="relative flex flex-col items-center">
                                  {/* 序号圆圈 - 增大尺寸、添加阴影 */}
                                  <div className="z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-charcoal/70 bg-white text-[11px] font-semibold shadow-sm transition-all duration-300 group-hover:border-brand-charcoal group-hover:shadow-md sm:h-8 sm:w-8 sm:text-xs lg:h-9 lg:w-9 lg:text-[13px]">
                                    {index + 1}
                                  </div>
                                  {/* 连接线 - 带流动动画 */}
                                  {index < selectedScheme.steps.length - 1 && (
                                    <div className="absolute left-1/2 top-7 h-[calc(100%+0.25rem)] w-[2px] -translate-x-1/2 overflow-hidden sm:top-8 lg:top-9">
                                      {/* 静态背景线 */}
                                      <div className="absolute inset-0 bg-gradient-to-b from-brand-charcoal/10 to-brand-charcoal/5" />
                                      {/* 流动光效 */}
                                      <m.div
                                        className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-brand-charcoal/25 to-transparent"
                                        initial={{ top: "-2rem" }}
                                        animate={{ top: "100%" }}
                                        transition={{
                                          duration: 2,
                                          repeat: Infinity,
                                          ease: "easeInOut",
                                          delay: index * 0.3
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* 右侧：步骤内容 */}
                                <div className="flex-1 pt-0.5 sm:pt-1">
                                  <h4 className="mb-1 text-[13px] font-semibold text-brand-charcoal transition-colors duration-300 group-hover:text-brand-charcoal/90 sm:mb-1.5 sm:text-sm lg:text-base">
                                    {step.title}
                                  </h4>
                                  <p className="max-w-[380px] text-[11px] leading-[1.7] text-brand-charcoal/50 transition-colors duration-300 group-hover:text-brand-charcoal/60 sm:text-[12px] lg:max-w-[420px] lg:text-[13px] lg:leading-[1.75]">
                                    {step.description}
                                  </p>
                                </div>
                              </m.div>
                            ))}
                          </div>
                        </m.div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => {
                if (isExpanded) {
                  // 展开 -> 收起，重置所有状态
                  setCurrentLevel(1);
                  setSelectedModule(null);
                  setSelectedScheme(null);
                  setHoveredIndex(null);
                  setIsExpanded(false);
                } else {
                  // 收起 -> 展开
                  setIsExpanded(true);
                }
              }}
              className="group flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3"
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

      {/* 底部导航栏 - 第一阶段及以下时显示 */}
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

