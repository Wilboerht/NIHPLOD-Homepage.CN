"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, ContactIcon, HomeIcon, RitualIcon, UserButton } from "@/components/website";

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
  duration?: string; // 时长，如 "1-2分钟"
  tips?: string; // 技巧提示
  dosage?: string; // 用量建议
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
        { title: "温和洁面", description: "使用氨基酸洗面奶，轻柔除去夜间油脂。", duration: "1-2分钟", tips: "用温水打湿面部，取适量洁面乳于掌心揉搓起泡后轻柔按摩。", dosage: "黄豆大小" },
        { title: "纤维水膜", description: "湿敷3分钟，快速提升肌肤含水量。", duration: "3分钟", tips: "将化妆棉浸透后敷于两颊、额头、下巴，保持湿润状态。", dosage: "浸透化妆棉" },
        { title: "光感防护", description: "涂抹自带提亮效果的日乳，抵御外界污染。", duration: "1分钟", tips: "从面部中心向外轻拍，确保均匀覆盖全脸及颈部。", dosage: "一元硬币大小" },
      ],
    },
    {
      id: "d2",
      name: "都市防护",
      tag: "抗氧",
      desc: "对抗城市环境压力",
      steps: [
        { title: "屏障修护", description: "建立微米级防护层。", duration: "2分钟", tips: "轻拍至完全吸收，重点关注T区和易敏感部位。", dosage: "2-3泵" },
        { title: "抗蓝光精华", description: "阻隔电子屏幕带来的隐形伤害。", duration: "1分钟", tips: "点涂于面部后轻柔按压，特别是眼周区域。", dosage: "1-2泵" },
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
        { title: "深度卸妆", description: "彻底溶解残妆与污垢。", duration: "2-3分钟", tips: "以打圈方式轻柔按摩，让卸妆产品充分乳化。", dosage: "2-3泵" },
        { title: "夜间精华", description: "层层渗透，激活细胞自我更新。", duration: "2分钟", tips: "沿肌肤纹理由下至上轻柔按摩，促进吸收。", dosage: "3-4滴" },
        { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。", duration: "1-2分钟", tips: "用掌心温热后按压于面部，让肌肤充分吸收。", dosage: "蚕豆大小" },
      ],
    },
    {
      id: "n2",
      name: "助眠舒缓",
      tag: "解压",
      desc: "放松身心的入眠仪式",
      steps: [
        { title: "香氛喷雾", description: "营造宁静的睡眠氛围。", duration: "30秒", tips: "距离面部20cm喷洒，闭眼深呼吸感受香气。" },
        { title: "穴位按摩", description: "舒缓面部肌肉紧张感。", duration: "3-5分钟", tips: "用指腹轻柔按压太阳穴、眉心、下颌，每个穴位停留5秒。" },
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
        { title: "热敷开启", description: "42度恒温毛巾覆盖，打开毛孔。", duration: "3-5分钟", tips: "确保毛巾温度适中，覆盖全脸后轻轻按压。" },
        { title: "粘土清洁", description: "深层吸附毛孔深处杂质。", duration: "10-15分钟", tips: "避开眼周，待面膜八分干时用温水洗净。", dosage: "均匀涂抹一层" },
      ],
    },
    {
      id: "s2",
      name: "丝滑塑颜",
      tag: "紧致",
      desc: "塑造面部清晰轮廓",
      steps: [
        { title: "拨筋手法", description: "配合刮痧板进行提拉按摩。", duration: "5-8分钟", tips: "沿面部轮廓由下往上刮拭，力度适中，每个区域重复3-5次。" },
        { title: "高倍滋养", description: "注入浓缩修护能量。", duration: "2分钟", tips: "趁肌肤温热时涂抹，按压至完全吸收。", dosage: "3-4泵" },
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
        { title: "免洗洁肤", description: "便捷除去面部灰尘。", duration: "1分钟", tips: "用化妆棉蘸取后轻柔擦拭全脸。", dosage: "浸透化妆棉" },
        { title: "补水喷雾", description: "随时补充流失水分。", duration: "30秒", tips: "距离面部15-20cm喷洒，用手轻拍帮助吸收。" },
      ],
    },
    {
      id: "t2",
      name: "落地急救",
      tag: "舒缓",
      desc: "改善时差引起的倦怠",
      steps: [
        { title: "冰感面膜", description: "降低表皮温度，消除浮肿。", duration: "10-15分钟", tips: "提前冷藏效果更佳，敷后轻拍促进精华吸收。" },
        { title: "维稳修护", description: "平复换季或地域带来的不适。", duration: "2分钟", tips: "选择舒缓成分，轻柔按压于敏感部位。", dosage: "2-3泵" },
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
        { title: "酸性激活", description: "软化陈旧角质，促进代谢。", duration: "5-10分钟", tips: "首次使用建议从短时间开始，逐步增加。避免眼周和唇部。", dosage: "薄薄一层" },
        { title: "中和平衡", description: "恢复肌肤天然酸碱值。", duration: "2分钟", tips: "用专用中和液或清水彻底清洗，后续使用舒缓产品。" },
      ],
    },
    {
      id: "p2",
      name: "注氧鲜肌",
      tag: "活氧",
      desc: "高压氧渗透嫩肤",
      steps: [
        { title: "导入精粹", description: "配合专业设备深层透皮。", duration: "10-15分钟", tips: "确保肌肤洁净干燥，按照设备说明操作。", dosage: "根据设备要求" },
        { title: "屏障封存", description: "强效锁水，持久焕发神采。", duration: "2分钟", tips: "趁导入后肌肤通道打开时立即涂抹封层产品。", dosage: "充足涂抹" },
      ],
    },
  ],
};

interface RitualContentProps {
  backgroundImage?: string;
}

/**
 * 计算步骤总时长
 * @param steps 步骤数组
 * @returns 格式化的总时长字符串
 */
function calculateTotalDuration(steps: RitualStep[]): string {
  let minTotal = 0;
  let maxTotal = 0;

  steps.forEach(step => {
    if (step.duration) {
      // 解析时长字符串，如 "1-2分钟", "30秒", "10-15分钟"
      const durationStr = step.duration.replace(/分钟|秒/g, "");
      const isSeconds = step.duration.includes("秒");

      if (durationStr.includes("-")) {
        const [min, max] = durationStr.split("-").map(Number);
        if (isSeconds) {
          minTotal += min / 60;
          maxTotal += max / 60;
        } else {
          minTotal += min;
          maxTotal += max;
        }
      } else {
        const value = Number(durationStr);
        if (isSeconds) {
          minTotal += value / 60;
          maxTotal += value / 60;
        } else {
          minTotal += value;
          maxTotal += value;
        }
      }
    }
  });

  // 四舍五入
  minTotal = Math.round(minTotal);
  maxTotal = Math.round(maxTotal);

  if (minTotal === maxTotal) {
    return `约 ${minTotal} 分钟`;
  }
  return `约 ${minTotal}-${maxTotal} 分钟`;
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
  // 展开的步骤索引（用于显示技巧提示）
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

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

  // 组件加载后自动展开，实现"导航栏先收起，抽屉再下拉"的动画序列
  useEffect(() => {
    // 稍微延迟一点，确保初始导航栏是可见状态
    const timer = setTimeout(() => {
      setIsExpanded(true);
    }, 1200);
    return () => clearTimeout(timer);
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
          style={{ transitionDelay: isExpanded ? "400ms" : "0ms" }}
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
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              animate={{
                height: isExpanded ? "calc(100vh - 120px)" : 0,
                minHeight: isExpanded ? 400 : 0
              }}
              transition={{
                duration: 0.8,
                ease: [0.22, 1, 0.36, 1],
                // 展开时延迟0.4s等待导航栏收起（大幅重叠以消除视觉间隔）；收起时不延迟
                delay: isExpanded ? 0.4 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />

              <div className={cn(
                "flex h-full flex-col overflow-hidden",
                !isExpanded && "hidden"
              )}>
                {/* ========== 移动端布局 - 参考 Ritual 移动端.html ========== */}
                <div className="flex h-full flex-col sm:hidden">
                  {/* 移动端顶部 Header */}
                  <header className="flex items-center justify-between px-6 pb-6 pt-4">
                    {/* 返回按钮 - 仅在 Level 2/3 显示 */}
                    <m.button
                      type="button"
                      onClick={() => {
                        if (currentLevel === 3) {
                          setSelectedScheme(null);
                          setCurrentLevel(2);
                        } else if (currentLevel === 2) {
                          setSelectedModule(null);
                          setCurrentLevel(1);
                        }
                      }}
                      className={cn(
                        "flex items-center text-sm tracking-wide transition-all duration-400",
                        currentLevel > 1 ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2.5 opacity-0"
                      )}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M19 12H5M5 12L12 19M5 12L12 5" />
                      </svg>
                      <span className="ml-2">返回</span>
                    </m.button>
                    {/* Logo */}
                    <Image
                      src="/images/logo.png"
                      alt="NIHPLOD"
                      width={100}
                      height={28}
                      className="h-7 w-auto brightness-[0.15]"
                      priority
                    />
                  </header>

                  {/* 移动端内容区域 */}
                  <div className="flex-1 overflow-y-auto px-6 pb-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <AnimatePresence mode="wait">
                      {/* 移动端 Level 1: 主菜单 */}
                      {currentLevel === 1 && (
                        <m.div
                          key="mobile-level1"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 标题区 */}
                          <div className="mb-10">
                            <p className="mb-2 text-xs uppercase tracking-[3px] text-[#00263e]/60">SKINCARE RITUAL</p>
                            <h1 className="text-4xl font-normal leading-none text-[#00263e]">护肤仪式</h1>
                          </div>

                          {/* 菜单列表 */}
                          <div className="flex flex-col">
                            {modules.map((module) => (
                              <button
                                key={module.id}
                                type="button"
                                onClick={() => selectModule(module.id)}
                                className="flex items-end justify-between border-b border-[#00263e]/10 py-6 text-left transition-transform duration-300 active:scale-[0.98]"
                              >
                                <span className="text-[28px] font-light tracking-wide text-[#00263e]">
                                  {module.label}
                                </span>
                                <span className="mb-2 text-xs font-semibold text-[#00263e]/50">
                                  {module.number}
                                </span>
                              </button>
                            ))}
                          </div>
                        </m.div>
                      )}

                      {/* 移动端 Level 2: 方案选择 */}
                      {currentLevel === 2 && selectedModule && (
                        <m.div
                          key="mobile-level2"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 分类标题 */}
                          <h2 className="mb-6 text-2xl font-normal text-[#00263e]">
                            {modules.find(m => m.id === selectedModule)?.label}
                          </h2>

                          {/* 方案卡片网格 */}
                          <div className="flex flex-col gap-5 pt-5">
                            {moduleData[selectedModule].map((scheme, index) => (
                              <button
                                key={scheme.id}
                                type="button"
                                onClick={() => selectScheme(scheme)}
                                className="relative overflow-hidden border border-[#00263e] bg-[#F0EDE1] p-6 text-left shadow-[0_4px_0_#00263e] transition-all duration-300 active:translate-y-1 active:shadow-none"
                              >
                                {/* 右上角标签 */}
                                <span className="absolute right-0 top-0 bg-[#00263e] px-2.5 py-1 text-[10px] uppercase text-[#F0EDE1]">
                                  Protocol {index + 1}
                                </span>
                                <h3 className="mb-2 text-xl font-medium text-[#00263e]">{scheme.name}</h3>
                                <p className="text-[13px] text-[#00263e]/70">{scheme.desc}</p>
                              </button>
                            ))}
                          </div>
                        </m.div>
                      )}

                      {/* 移动端 Level 3: 详细步骤 */}
                      {currentLevel === 3 && selectedScheme && (
                        <m.div
                          key="mobile-level3"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 详情头部 */}
                          <div className="mb-8">
                            <p className="mb-2 text-xs uppercase tracking-wide text-[#00263e]/50">
                              {modules.find(m => m.id === selectedModule)?.label}
                            </p>
                            <h2 className="text-[32px] font-normal leading-tight text-[#00263e]">
                              {selectedScheme.name}
                            </h2>
                          </div>

                          {/* 步骤列表 */}
                          <div className="flex flex-col gap-10">
                            {selectedScheme.steps.map((step, index) => (
                              <div key={step.title} className="flex flex-col gap-4">
                                {/* 步骤图片区域 - 墨水效果 */}
                                <div className="relative flex h-60 w-full items-center justify-center overflow-hidden bg-[#00263e]">
                                  {/* 墨水浮动效果 */}
                                  <m.div
                                    className="absolute h-[150px] w-[150px] rounded-full bg-[#F0EDE1]/30 blur-[40px]"
                                    animate={{
                                      x: ["-20%", "20%"],
                                      y: ["-20%", "20%"],
                                      scale: [1, 1.2, 1]
                                    }}
                                    transition={{ duration: 8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                                  />
                                  <m.div
                                    className="absolute h-[100px] w-[100px] rounded-full bg-[#F0EDE1]/20 blur-[40px]"
                                    animate={{
                                      x: ["20%", "-20%"],
                                      y: ["20%", "-20%"],
                                      scale: [1.2, 1, 1.2]
                                    }}
                                    transition={{ duration: 8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 2 }}
                                  />
                                  <span className="z-10 text-xs uppercase tracking-wide text-white/60">
                                    VISUAL CONCEPT
                                  </span>
                                </div>

                                {/* 步骤编号 */}
                                <div className="w-fit border-b border-[#00263e] pb-1 text-[10px] uppercase tracking-wide text-[#00263e]/50">
                                  STEP 0{index + 1}
                                </div>

                                {/* 步骤信息 */}
                                <div>
                                  <h4 className="mb-2 text-lg font-medium text-[#00263e]">{step.title}</h4>
                                  <p className="text-sm leading-relaxed text-[#00263e]/80">{step.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* 底部结束标记 */}
                          <div className="mt-16 pb-10 text-center text-[10px] uppercase tracking-[4px] text-[#00263e]/30">
                            END OF RITUAL
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ========== 桌面端布局 - 保持原有样式 ========== */}
                <div className="hidden h-full flex-col sm:flex">
                  {/* 顶部栏：LOGO + 面包屑/用户按钮 */}
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-brand-charcoal/5 px-8 py-4 lg:px-12">
                    {/* 左侧：LOGO - 点击返回 Level 1 */}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentLevel(1);
                        setSelectedModule(null);
                        setSelectedScheme(null);
                      }}
                      className="block transition-opacity hover:opacity-70"
                    >
                      <Image
                        src="/images/logo.png"
                        alt="NIHPLOD"
                        width={100}
                        height={32}
                        className="h-7 w-auto lg:h-8"
                        priority
                      />
                    </button>

                    {/* 右侧：Level 1 显示用户按钮，Level 2/3 显示面包屑 */}
                    <AnimatePresence mode="wait">
                      {currentLevel === 1 ? (
                        <m.div
                          key="user-button"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <UserButton />
                        </m.div>
                      ) : currentLevel >= 2 ? (
                        <m.nav
                          key="breadcrumb"
                          className="flex items-center gap-2 text-sm text-brand-charcoal/50"
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
                      ) : null}
                    </AnimatePresence>
                  </div>

                  {/* 视口容器 - 三层级切换 */}
                  <div className="relative flex-1 overflow-hidden">
                    {/* Level 1: 垂直模块面板 - 桌面端水平排列 */}
                    <AnimatePresence mode="wait">
                      {currentLevel === 1 && (
                        <m.div
                          key="level1"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, x: -30 }}
                          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex flex-row gap-5 overflow-visible p-5 lg:gap-6 lg:p-6"
                        >
                          {modules.map((module, index) => (
                            <m.button
                              key={module.id}
                              type="button"
                              onClick={() => selectModule(module.id)}
                              onMouseEnter={() => setHoveredIndex(index)}
                              onMouseLeave={() => setHoveredIndex(null)}
                              className={cn(
                                // 桌面端：垂直面板布局
                                "group relative flex cursor-pointer flex-col items-stretch justify-end gap-0 overflow-hidden rounded-sm border-0 border-l p-8 lg:p-10",
                                // 桌面端 hover 效果
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
                                  "mb-auto text-[13px] font-normal tracking-wide",
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
                                  "mb-5 font-light tracking-wide text-brand-charcoal [writing-mode:vertical-rl]",
                                  hoveredIndex === index
                                    ? "text-[28px] lg:text-[32px]"
                                    : "text-2xl lg:text-[26px]"
                                )}
                                style={{ transition: "font-size 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
                              >
                                {module.label}
                              </h2>

                              {/* 描述文字 - hover 时显示 */}
                              <p
                                className={cn(
                                  "max-w-[200px] text-[13px] leading-relaxed text-brand-charcoal/50",
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

                      {/* Level 2: 方案选择 - 桌面端水平排列 */}
                      {currentLevel === 2 && selectedModule && (
                        <m.div
                          key="level2"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex flex-row gap-5 overflow-visible p-5 lg:gap-6 lg:p-6"
                        >
                          {moduleData[selectedModule].map((scheme, index) => (
                            <m.button
                              key={scheme.id}
                              type="button"
                              onClick={() => selectScheme(scheme)}
                              onMouseEnter={() => setHoveredIndex(index)}
                              onMouseLeave={() => setHoveredIndex(null)}
                              className={cn(
                                // 桌面端：垂直居中面板
                                "group relative flex cursor-pointer flex-col items-center justify-center gap-0 overflow-hidden rounded-sm border-0 p-8 lg:p-10",
                                // 桌面端 hover 效果
                                hoveredIndex === index
                                  ? "flex-[1.6] bg-white/50 shadow-[0_30px_60px_-10px_rgba(0,38,62,0.06)]"
                                  : hoveredIndex !== null
                                    ? "flex-[0.9] bg-white/20"
                                    : "flex-1 bg-white/25"
                              )}
                              style={{
                                transition: "flex 0.9s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.7s cubic-bezier(0.16, 1, 0.3, 1)"
                              }}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.7, delay: 0.1 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                            >
                              {/* 标签 - 居中圆角边框 */}
                              <span
                                className={cn(
                                  "mb-5 rounded-full border px-5 py-1.5 text-xs tracking-wider",
                                  hoveredIndex === index
                                    ? "border-brand-charcoal/25 text-brand-charcoal/70"
                                    : "border-brand-charcoal/15 text-brand-charcoal/40"
                                )}
                                style={{ transition: "border-color 0.5s ease, color 0.5s ease" }}
                              >
                                {scheme.tag}
                              </span>

                              {/* 标题 - 居中 */}
                              <h3
                                className={cn(
                                  "mb-4 text-center font-light tracking-wide text-brand-charcoal",
                                  hoveredIndex === index
                                    ? "text-2xl lg:text-[26px]"
                                    : "text-xl lg:text-2xl"
                                )}
                                style={{ transition: "font-size 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
                              >
                                {scheme.name}
                              </h3>

                              {/* 描述文字 - 居中 */}
                              <p
                                className={cn(
                                  "text-center text-[13px] leading-relaxed",
                                  hoveredIndex === index
                                    ? "text-brand-charcoal/55"
                                    : "text-brand-charcoal/40"
                                )}
                                style={{ transition: "color 0.5s ease" }}
                              >
                                {scheme.desc}
                              </p>
                            </m.button>
                          ))}
                        </m.div>
                      )}

                      {/* Level 3: 详细步骤 - 桌面端左右分栏 */}
                      {currentLevel === 3 && selectedScheme && (
                        <m.div
                          key="level3"
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -30 }}
                          transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
                          className="absolute inset-0 flex flex-row gap-8 overflow-hidden p-6 lg:p-8"
                        >
                          {/* 左侧：方案信息区域 */}
                          <m.div
                            className="relative flex w-[40%] flex-shrink-0 flex-col justify-center overflow-hidden rounded-sm bg-gradient-to-br from-brand-charcoal/[0.02] to-brand-charcoal/[0.06] p-8 lg:p-10"
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                          >
                            {/* 装饰性流体图形 - 背景层 */}
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]">
                              <m.div
                                className="h-[320px] w-[320px] rounded-[40%_60%_70%_30%/40%_50%_60%_50%] bg-brand-charcoal lg:h-[380px] lg:w-[380px]"
                                animate={{
                                  borderRadius: [
                                    "40% 60% 70% 30% / 40% 50% 60% 50%",
                                    "60% 40% 30% 70% / 50% 60% 40% 50%",
                                    "40% 60% 70% 30% / 40% 50% 60% 50%"
                                  ]
                                }}
                                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                              />
                            </div>

                            {/* 装饰性 SVG 圆环 */}
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <svg className="h-56 w-56 opacity-[0.06] lg:h-64 lg:w-64" viewBox="0 0 200 200">
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
                              className="relative z-10 mb-3 flex items-center gap-2 text-[11px] text-brand-charcoal/35"
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
                              className="relative z-10 mb-4 inline-block w-fit border border-brand-charcoal/20 bg-white/30 px-4 py-1.5 text-[10px] uppercase tracking-widest text-brand-charcoal/50 backdrop-blur-sm"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.6, delay: 0.2 }}
                            >
                              {selectedScheme.tag}
                            </m.span>

                            {/* 方案标题 */}
                            <m.h2
                              className="relative z-10 mb-4 text-2xl font-light text-brand-charcoal lg:text-3xl"
                              style={{ letterSpacing: "-0.02em" }}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.7, delay: 0.25 }}
                            >
                              {selectedScheme.name}
                            </m.h2>

                            {/* 描述 */}
                            <m.p
                              className="relative z-10 max-w-[320px] text-[13px] leading-[1.8] text-brand-charcoal/50 lg:text-sm"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.7, delay: 0.3 }}
                            >
                              {selectedScheme.desc}
                            </m.p>

                            {/* 步骤数量 + 总时长 */}
                            <m.div
                              className="relative z-10 mt-8 flex flex-wrap items-center gap-5 text-[11px] text-brand-charcoal/40"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.6, delay: 0.4 }}
                            >
                              {/* 步骤数量 */}
                              <div className="flex items-center gap-2">
                                <span className="h-px w-10 bg-brand-charcoal/20" />
                                <span className="tracking-wide">{selectedScheme.steps.length} 个护理步骤</span>
                              </div>
                              {/* 总时长 */}
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-brand-charcoal/30" />
                                <span className="tracking-wide">{calculateTotalDuration(selectedScheme.steps)}</span>
                              </div>
                            </m.div>
                          </m.div>

                          {/* 右侧：步骤时间轴 */}
                          <m.div
                            className="relative flex flex-1 flex-col overflow-y-auto rounded-sm border border-brand-charcoal/[0.06] bg-white p-7 shadow-[0_4px_40px_rgba(0,0,0,0.04)] lg:p-10"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
                          >
                            {/* 流程标题 - 带装饰线 */}
                            <m.div
                              className="mb-7 flex items-center gap-3 lg:mb-8"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.5, delay: 0.25 }}
                            >
                              <span className="h-px w-6 bg-brand-charcoal/25" />
                              <h3 className="text-[11px] font-normal uppercase tracking-[0.15em] text-brand-charcoal/40">
                                仪式流程 / Procedure
                              </h3>
                            </m.div>

                            {/* 步骤列表 - 带连接线 */}
                            <div className="relative flex flex-1 flex-col justify-center gap-1">
                              {selectedScheme.steps.map((step, index) => {
                                const isStepExpanded = expandedStepIndex === index;
                                const hasTips = step.tips || step.dosage || step.duration;

                                return (
                                  <m.div
                                    key={step.title}
                                    className="group relative flex gap-5 lg:gap-6"
                                    initial={{ opacity: 0, y: 25 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: 0.3 + index * 0.1, ease: [0.19, 1, 0.22, 1] }}
                                  >
                                    {/* 左侧：序号 + 连接线 */}
                                    <div className="flex flex-col items-center self-stretch">
                                      {/* 序号圆圈 */}
                                      <div className={cn(
                                        "z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white text-xs font-semibold shadow-sm transition-all duration-300 lg:h-9 lg:w-9 lg:text-[13px]",
                                        isStepExpanded
                                          ? "border-brand-gold bg-brand-gold/5 shadow-md"
                                          : "border-brand-charcoal/70 group-hover:border-brand-charcoal group-hover:shadow-md"
                                      )}>
                                        {index + 1}
                                      </div>
                                      {/* 连接线 - 静态线条 */}
                                      {index < selectedScheme.steps.length - 1 && (
                                        <div className="mt-1 mb-1 min-h-[8px] w-[2px] flex-1 rounded-full bg-gradient-to-b from-brand-charcoal/15 via-brand-charcoal/10 to-brand-charcoal/15" />
                                      )}
                                    </div>

                                    {/* 右侧：步骤内容（可点击展开） */}
                                    <div className="flex-1 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => hasTips && setExpandedStepIndex(isStepExpanded ? null : index)}
                                        className={cn(
                                          "w-full rounded-lg px-3 py-4 text-left transition-colors duration-300 lg:py-5",
                                          hasTips ? "cursor-pointer hover:bg-brand-beige/20" : "cursor-default",
                                          isStepExpanded && "bg-brand-beige/30"
                                        )}
                                      >
                                        {/* 标题行 */}
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1">
                                            <h4 className="mb-1.5 text-sm font-semibold text-brand-charcoal transition-colors duration-300 group-hover:text-brand-charcoal/90 lg:text-base">
                                              {step.title}
                                            </h4>
                                            <p className="max-w-[380px] text-[12px] leading-[1.7] text-brand-charcoal/50 transition-colors duration-300 group-hover:text-brand-charcoal/60 lg:max-w-[420px] lg:text-[13px] lg:leading-[1.75]">
                                              {step.description}
                                            </p>
                                          </div>
                                          {/* 展开指示器 */}
                                          {hasTips && (
                                            <m.div
                                              className="mt-0.5 flex-shrink-0"
                                              animate={{ rotate: isStepExpanded ? 90 : 0 }}
                                              transition={{ duration: 0.3 }}
                                            >
                                              <ChevronRight className="h-4 w-4 text-brand-charcoal/30" />
                                            </m.div>
                                          )}
                                        </div>

                                        {/* 展开的详细信息 */}
                                        <AnimatePresence>
                                          {isStepExpanded && hasTips && (
                                            <m.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: "auto", opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                              className="overflow-hidden"
                                            >
                                              <div className="mt-4 space-y-2.5 border-t border-brand-charcoal/[0.08] pt-4">
                                                {/* 时长 */}
                                                {step.duration && (
                                                  <div className="flex items-center gap-2 text-[12px]">
                                                    <Clock className="h-3 w-3 flex-shrink-0 text-brand-gold/70" />
                                                    <span className="text-brand-charcoal/40">时长</span>
                                                    <span className="text-brand-charcoal/70">{step.duration}</span>
                                                  </div>
                                                )}
                                                {/* 用量 */}
                                                {step.dosage && (
                                                  <div className="flex items-center gap-2 text-[12px]">
                                                    <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center text-[10px] text-brand-gold/70">●</span>
                                                    <span className="text-brand-charcoal/40">用量</span>
                                                    <span className="text-brand-charcoal/70">{step.dosage}</span>
                                                  </div>
                                                )}
                                                {/* 技巧提示 */}
                                                {step.tips && (
                                                  <div className="flex gap-2 text-[12px]">
                                                    <span className="mt-0.5 flex h-3 w-3 flex-shrink-0 items-center justify-center text-[10px] text-brand-gold/70">✦</span>
                                                    <div>
                                                      <span className="text-brand-charcoal/40">技巧</span>
                                                      <p className="mt-0.5 leading-relaxed text-brand-charcoal/60">{step.tips}</p>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </m.div>
                                          )}
                                        </AnimatePresence>
                                      </button>
                                    </div>
                                  </m.div>
                                );
                              })}
                            </div>
                          </m.div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => {
                // 切换展开/收起状态，保持当前层级和选择不变
                setIsExpanded(!isExpanded);
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
              duration: 1.2,
              ease: [0.22, 1, 0.36, 1]
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

