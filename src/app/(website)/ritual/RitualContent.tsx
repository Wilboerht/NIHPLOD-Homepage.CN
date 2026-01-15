"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import { ChevronDown, Clock, ChevronRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

// 模块配置 - 4个护肤仪式模块
type ModuleId = "daily" | "portable" | "spa" | "professional";

interface ModuleConfig {
  id: ModuleId;
  number: string;
  label: string;
  subtitle: string;
  description: string;
}

const modules: ModuleConfig[] = [
  {
    id: "daily",
    number: "01",
    label: "优雅日常",
    subtitle: "告别繁琐, 轻松护理",
    description: "每日专属的精简守护"
  },
  {
    id: "portable",
    number: "02",
    label: "随身好物",
    subtitle: "外出 / 通勤 / 旅行",
    description: "随时随地按需使用"
  },
  {
    id: "spa",
    number: "03",
    label: "居家SPA",
    subtitle: "让生活充满仪式感",
    description: "享受DIY的美好时光"
  },
  {
    id: "professional",
    number: "04",
    label: "专业水疗",
    subtitle: "让身心重拾活力与平衡",
    description: "沉静式悦己体验"
  },
];

// 护肤步骤类型
interface RitualStep {
  title: string;
  description: string;
  duration?: string; // 时长，如 "1-2分钟"
  tips?: string; // 技巧提示
  dosage?: string; // 用量建议
  imageUrl?: string;
}

// 方案类型
interface Scheme {
  id: string;
  name: string;
  tag: string;
  desc: string;
  steps: RitualStep[];
  totalDuration?: string;
  products?: string;
  benefits?: string[];
  specialSupport?: string;
  nameEn?: string;
}

// 模块数据类型
type ModuleData = Record<ModuleId, Scheme[]>;

// 默认模块数据
const defaultModuleData: ModuleData = {
  daily: [
    {
      id: "d1",
      name: "晨间焕活",
      nameEn: "MORNING VITALITY RITUAL",
      tag: "唤醒",
      desc: "开启一天的透亮肌底",
      totalDuration: "5-10分钟",
      products: "洁面慕斯、面霜",
      benefits: ["保湿锁水", "屏障增强", "过敏修护", "抗初老", "维稳舒缓"],
      specialSupport: "孕期、月子期、轻医美术后",
      steps: [
        {
          title: "净肤",
          description: "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
          duration: "30秒",
          tips: "温水洗净，避免过冷或过热刺激。",
          imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png"
        },
        {
          title: "焕活",
          description: "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
          duration: "1-2分钟",
          tips: "掌心温热后按压效果更佳。",
          imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png"
        },
        {
          title: "防护",
          description: "在面部完全干爽后，取足量防晒霜，点涂于面部及颈部，顺着皮肤纹理均匀涂抹。防晒剂提供即时自然提亮效果。",
          duration: "1分钟",
          tips: "出门前15分钟涂抹。",
          imageUrl: "https://wp-cdn.4ce.cn/v2/YjI5qTM.png"
        },
      ],
    },
    {
      id: "n1",
      name: "晚间呵护",
      nameEn: "NIGHT REPAIR RITUAL",
      tag: "修复",
      desc: "利用黄金睡眠期修护",
      totalDuration: "10-15分钟",
      products: "卸妆油、洁面、晚霜",
      benefits: ["深层清洁", "夜间修护", "滋养再生"],
      steps: [
        { title: "深度卸妆", description: "彻底溶解彩妆与防晒残留。", duration: "2分钟", tips: "干手干脸按摩，充分乳化后洗净。", dosage: "3泵", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "温和洁面", description: "洗去多余油脂，不伤皮脂膜。", duration: "1分钟", tips: "重点清洁T区，两颊轻柔带过。", dosage: "1泵", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。", duration: "1-2分钟", tips: "用掌心温热后按压于面部，让肌肤充分吸收。", dosage: "蚕豆大小", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
  ],
  portable: [
    {
      id: "t1",
      name: "高空补水",
      nameEn: "IN-FLIGHT HYDRATION",
      tag: "极速",
      desc: "应对机舱干燥环境",
      totalDuration: "5分钟",
      products: "补水喷雾、修护霜",
      benefits: ["即时补水", "舒缓干燥"],
      steps: [
        { title: "舒缓喷雾", description: "即刻缓解肌肤紧绷感。", duration: "10秒", tips: "距离面部20cm处呈Z字形喷洒。", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "维稳修护", description: "平复换季或地域带来的不适。", duration: "2分钟", tips: "选择舒缓成分，轻柔按压于敏感部位。", dosage: "2-3泵", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
  ],
  spa: [
    {
      id: "s1",
      name: "热能排浊",
      nameEn: "THERMAL DETOX",
      tag: "排毒",
      desc: "家中的恒温理疗体验",
      totalDuration: "20分钟",
      products: "热敷毛巾、清洁面膜",
      benefits: ["毛孔清洁", "促进循环"],
      steps: [
        { title: "热敷开启", description: "42度恒温毛巾覆盖，打开毛孔。", duration: "3-5分钟", tips: "确保毛巾温度适中，覆盖全脸后轻轻按压。", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "粘土清洁", description: "深层吸附毛孔深处杂质。", duration: "10-15分钟", tips: "避开眼周，待面膜八分干时用温水洗净。", dosage: "均匀涂抹一层", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
    {
      id: "s2",
      name: "丝滑塑颜",
      nameEn: "SILKY CONTOURING",
      tag: "紧致",
      desc: "塑造面部清晰轮廓",
      totalDuration: "10分钟",
      products: "按摩油、刮痧板",
      benefits: ["提拉紧致", "淋巴排毒"],
      steps: [
        { title: "拨筋手法", description: "配合刮痧板进行提拉按摩。", duration: "5-8分钟", tips: "沿面部轮廓由下往上刮拭，力度适中，每个区域重复3-5次。", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "高倍滋养", description: "注入浓缩修护能量。", duration: "2分钟", tips: "趁肌肤温热时涂抹，按压至完全吸收。", dosage: "3-4泵", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
  ],
  professional: [
    {
      id: "p1",
      name: "酵素焕肤",
      nameEn: "ENZYME PEELING",
      tag: "专业",
      desc: "医学级角质更新处理",
      totalDuration: "15分钟",
      products: "酸类精华、中和液",
      benefits: ["角质更新", "提亮肤色"],
      steps: [
        { title: "酸性激活", description: "软化陈旧角质，促进代谢。", duration: "5-10分钟", tips: "首次使用建议从短时间开始，逐步增加。避免眼周和唇部。", dosage: "薄薄一层", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "中和平衡", description: "恢复肌肤天然酸碱值。", duration: "2分钟", tips: "用专用中和液或清水彻底清洗，后续使用舒缓产品。", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
    {
      id: "p2",
      name: "注氧鲜肌",
      nameEn: "OXYGEN INFUSION",
      tag: "活氧",
      desc: "高压氧渗透嫩肤",
      totalDuration: "20分钟",
      products: "注氧仪、精华液",
      benefits: ["深层水润", "活肤注氧"],
      steps: [
        { title: "导入精粹", description: "配合专业设备深层透皮。", duration: "10-15分钟", tips: "确保肌肤洁净干燥，按照设备说明操作。", dosage: "根据设备要求", imageUrl: "https://wp-cdn.4ce.cn/v2/sSNhrfD.png" },
        { title: "屏障封存", description: "强效锁水，持久焕发神采。", duration: "2分钟", tips: "趁导入后肌肤通道打开时立即涂抹封层产品。", dosage: "充足涂抹", imageUrl: "https://wp-cdn.4ce.cn/v2/2xPfQKk.png" },
      ],
    },
  ],
};



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
interface RitualContentProps {
  backgroundImage?: string;
}

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
  const { setDrawerOpen } = useLayout();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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



  // 组件加载后自动展开，实现"抽屉下拉"动画
  useEffect(() => {
    // 稍微延迟以展示"下拉"动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

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
              style={{ willChange: "flex-grow" }}
              initial={{ flexGrow: 0, flexBasis: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                flexBasis: 0
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                // 展开时延迟0.4s等待导航栏收起（大幅重叠以消除视觉间隔）；收起时不延迟
                delay: isExpanded ? 0.3 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />

              {/* 动态背景图片 */}


              <div className={cn(
                "flex h-full flex-col overflow-hidden pb-3",
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
                  <div className="flex-1 overflow-y-auto px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <AnimatePresence mode="wait">
                      {/* 移动端 Level 1: 主菜单 */}
                      {currentLevel === 1 && (
                        <m.div
                          key="mobile-level1"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                          className="flex h-full flex-col"
                        >
                          {/* 标题区 */}
                          <div className="mb-4 shrink-0 pt-2">
                            <p className="mb-2 text-xs uppercase tracking-[3px] text-[#00263e]/60">SKINCARE RITUAL</p>
                            <h1 className="text-4xl font-normal leading-none text-[#00263e]">护肤仪式</h1>
                          </div>

                          {/* 菜单列表 */}
                          <div className="flex flex-1 flex-col">
                            {modules.map((module, index) => (
                              <button
                                key={module.id}
                                type="button"
                                onClick={() => selectModule(module.id)}
                                className={cn(
                                  "group flex flex-1 items-center justify-between py-4 text-left transition-transform duration-300 active:scale-[0.98]",
                                  index !== modules.length - 1 && "border-b border-[#00263e]/10"
                                )}
                              >
                                <div className="flex items-center gap-6">
                                  <span className="font-serif text-3xl italic text-[#00263e]/20 group-hover:text-[#00263e]/30 transition-colors">
                                    {module.number}
                                  </span>
                                  <span className="text-[24px] font-light tracking-wide text-[#00263e]">
                                    {module.label}
                                  </span>
                                  <div className="mt-1 flex flex-col items-start gap-1">
                                    <span className="text-[10px] font-normal uppercase tracking-wider text-[#00263e]/60">
                                      {module.subtitle}
                                    </span>
                                  </div>
                                </div>
                                <ArrowUpRight className="h-5 w-5 text-[#00263e]/20" />
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
                                <h3 className="mb-2 text-[18px] font-medium text-[#00263e]">{scheme.name}</h3>
                                <p className="text-[14px] text-[#00263e]/70">{scheme.desc}</p>
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
                            <h2 className="text-[24px] font-normal leading-tight text-[#00263e]">
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
                                  <h4 className="mb-2 text-[18px] font-medium text-[#00263e]">{step.title}</h4>
                                  <p className="text-[14px] leading-relaxed text-[#00263e]/80">{step.description}</p>
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
                          <div className="w-24" />
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
                                // 桌面端：垂直面板布局，居中对齐
                                "group relative flex cursor-pointer flex-col items-center justify-end gap-0 overflow-hidden rounded-sm border-0 border-l p-8 lg:p-10",
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

                              {/* 标题 */}
                              <h2
                                className={cn(
                                  "mb-5 text-center font-light tracking-wide text-brand-charcoal",
                                  hoveredIndex === index
                                    ? "text-[28px] lg:text-[32px]"
                                    : "text-2xl lg:text-[26px]"
                                )}
                                style={{ transition: "font-size 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
                              >
                                {module.label}
                              </h2>

                              {/* 副标题 */}
                              <h3
                                className={cn(
                                  "mb-4 max-w-[220px] text-center text-[11px] font-medium uppercase tracking-[0.1em] text-brand-charcoal",
                                  hoveredIndex === index
                                    ? "opacity-60"
                                    : "opacity-40"
                                )}
                                style={{
                                  transition: hoveredIndex === index
                                    ? "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                                    : "opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
                                }}
                              >
                                {module.subtitle}
                              </h3>

                              {/* 描述文字 - hover 时显示 */}
                              <p
                                className={cn(
                                  "max-w-[200px] text-center text-[13px] leading-relaxed text-brand-charcoal/50",
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
                      {currentLevel === 3 && selectedScheme && selectedModule && (
                        <m.div
                          key="level3"
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -30 }}
                          transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
                          className="absolute inset-0 flex flex-col overflow-hidden px-12 pt-10 lg:px-[60px] lg:pt-10 items-center"
                        >
                          <div className="flex h-full w-full max-w-[1440px] flex-col justify-center">
                            {/* Level 3 Header: 标题与切换器 */}
                            <header className="mb-9 flex flex-shrink-0 items-end justify-between border-b border-brand-charcoal/10 pb-5">
                              {/* 左侧标题组 */}
                              <div className="flex flex-col gap-3">
                                <h1 className="font-sans text-[48px] font-light leading-none tracking-wider text-brand-charcoal">
                                  {selectedScheme.name}
                                </h1>
                                <p className="font-sans text-[12px] tracking-widest text-brand-charcoal-light">
                                  预计用时 {selectedScheme.totalDuration || "5-10分钟"}
                                </p>
                              </div>

                              {/* 右侧切换器 - 显示当前模块下的所有方案 */}
                              <nav className="flex gap-10">
                                <LayoutGroup id={`tab-${selectedModule}`}>
                                  {moduleData[selectedModule].map((scheme) => {
                                    const isActive = scheme.id === selectedScheme.id;
                                    return (
                                      <button
                                        key={scheme.id}
                                        type="button"
                                        onClick={() => selectScheme(scheme)}
                                        className={cn(
                                          "relative pb-2 text-[16px] tracking-widest transition-colors duration-300",
                                          isActive
                                            ? "text-brand-charcoal"
                                            : "text-brand-charcoal-light/60 hover:text-brand-charcoal"
                                        )}
                                      >
                                        {scheme.name}
                                        {isActive && (
                                          <m.div
                                            layoutId="activeSchemeLine"
                                            className="absolute bottom-0 left-0 h-[1.5px] w-full bg-brand-charcoal rounded-full"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                          />
                                        )}
                                      </button>
                                    );
                                  })}
                                </LayoutGroup>
                              </nav>
                            </header>

                            {/* 内容主体：左侧边栏 + 右侧网格 */}
                            {/* 内容主体：左侧边栏 + 右侧网格 */}
                            <div className="flex w-full flex-row gap-16 overflow-hidden items-start pb-10 max-h-[75vh]">
                              {/* 左侧：信息侧边栏 (Info Sidebar) */}
                              <m.aside
                                className="flex w-[320px] flex-shrink-0 flex-col gap-12 overflow-y-auto pr-4 scrollbar-thin"
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                              >
                                {/* Meta Item: Products */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    涉及产品
                                  </h3>
                                  <div className="flex flex-wrap gap-6">
                                    {(selectedScheme.products || "洁面慕斯、面霜")
                                      .split("、")
                                      .map((product, index) => {
                                        // 产品图标占位符映射 - 根据产品名匹配或按索引循环
                                        const productIcons: Record<string, React.ReactNode> = {
                                          // 洁面类
                                          "洁面慕斯": (
                                            <svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="17.9922" y="5" width="11.9999" height="37.9997" rx="1.99992" fill="url(#paint0_linear_2088_4549)" />
                                              <path d="M18.7941 5.99999C18.7941 5.99999 18.9941 5 23.9941 5C28.9941 5 29.1941 5.99999 29.1941 5.99999L29.4941 16.9999C29.994 16.9999 29.994 17.6666 29.994 17.9999V20.9999C30.494 21.0202 30.494 21.6665 30.494 21.9999V40.9997C30.494 42.1043 29.6006 42.9997 28.496 42.9997H23.9941H19.4922C18.3876 42.9997 17.4941 42.1051 17.4941 41.0005V21.9999C17.4941 21.1999 17.6608 20.9999 17.9941 20.9999V17.9999C17.9941 17.1999 18.1608 16.9999 18.4941 16.9999L18.7941 5.99999Z" stroke="#B795A7" stroke-width="1.59993" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M20.4062 16.9989C20.4062 16.9989 21.303 16.7988 23.9932 16.7988C26.6833 16.7988 27.5801 16.9989 27.5801 16.9989" stroke="#B795A7" stroke-width="1.19995" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M19.7441 21.099C19.7441 21.099 20.806 20.999 23.9916 20.999C27.1772 20.999 28.239 21.099 28.239 21.099" stroke="#B795A7" stroke-width="1.19995" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M21.7218 38.0581L21.0954 37.2988H20.9922V38.2793H21.1151V37.52L21.7407 38.2793H21.8446V37.2988H21.7218V38.0581Z" fill="#00263E" />
                                              <path d="M22.1953 37.2988H22.0723V38.2808H22.1953V37.2988Z" fill="#00263E" />
                                              <path d="M23.285 38.2793V37.2988H23.1622V37.727H22.5604V37.2988H22.4375V38.2793H22.5604V37.8511H23.1622V38.2793H23.285Z" fill="#00263E" />
                                              <path d="M23.9095 37.2988H23.4785V38.2796H23.6012V37.9535H23.9095C23.9522 37.9537 23.9945 37.9454 24.034 37.929C24.0735 37.9126 24.1094 37.8886 24.1397 37.8582C24.1699 37.8277 24.1939 37.7916 24.2103 37.7518C24.2267 37.712 24.2351 37.6693 24.2351 37.6262C24.2351 37.583 24.2267 37.5404 24.2103 37.5005C24.1939 37.4607 24.1699 37.4246 24.1397 37.3942C24.1094 37.3638 24.0735 37.3397 24.034 37.3233C23.9945 37.307 23.9522 37.2986 23.9095 37.2988ZM23.9095 37.8296H23.6012V37.4228H23.9096C23.963 37.4228 24.0142 37.4442 24.0519 37.4823C24.0897 37.5205 24.1109 37.5722 24.1109 37.6262C24.1109 37.6801 24.0897 37.7318 24.0519 37.77C24.0142 37.8081 23.9629 37.8296 23.9095 37.8296Z" fill="#00263E" />
                                              <path d="M24.4941 37.2988H24.3711V38.28H25.0151V38.1559H24.4941V37.2988Z" fill="#00263E" />
                                              <path d="M25.4697 37.2991C25.3737 37.2991 25.2799 37.3278 25.2001 37.3817C25.1203 37.4355 25.0581 37.512 25.0213 37.6016C24.9846 37.6911 24.975 37.7896 24.9937 37.8847C25.0124 37.9797 25.0586 38.067 25.1265 38.1355C25.1944 38.2041 25.2808 38.2507 25.375 38.2696C25.4691 38.2886 25.5667 38.2788 25.6554 38.2418C25.7441 38.2047 25.8199 38.1419 25.8732 38.0613C25.9265 37.9807 25.955 37.886 25.955 37.7891C25.9572 37.7241 25.9462 37.6594 25.9226 37.599C25.899 37.5385 25.8633 37.4836 25.8178 37.4376C25.7723 37.3917 25.7179 37.3557 25.658 37.3319C25.5981 37.308 25.534 37.2969 25.4697 37.2991ZM25.4697 38.1552C25.398 38.1552 25.3279 38.1337 25.2683 38.0935C25.2086 38.0533 25.1621 37.9961 25.1347 37.9292C25.1072 37.8623 25.1 37.7887 25.114 37.7177C25.128 37.6467 25.1625 37.5814 25.2132 37.5302C25.264 37.479 25.3286 37.4442 25.3989 37.43C25.4692 37.4159 25.5422 37.4231 25.6084 37.4508C25.6747 37.4785 25.7313 37.5255 25.7712 37.5857C25.811 37.6459 25.8323 37.7167 25.8323 37.7891C25.8345 37.8378 25.8267 37.8864 25.8092 37.9318C25.7918 37.9772 25.7652 38.0185 25.7311 38.053C25.6969 38.0874 25.6561 38.1143 25.6111 38.1319C25.5661 38.1495 25.5179 38.1574 25.4697 38.1552Z" fill="#00263E" />
                                              <path d="M26.4774 37.2988H26.1113V38.2794H26.4774C26.6059 38.2789 26.7289 38.227 26.8196 38.1351C26.9103 38.0432 26.9612 37.9188 26.9612 37.7891C26.9612 37.6594 26.9103 37.535 26.8196 37.4431C26.7289 37.3512 26.6059 37.2993 26.4774 37.2988ZM26.4774 38.1555H26.234V37.4227H26.4774C26.5737 37.4227 26.666 37.4613 26.734 37.53C26.8021 37.5987 26.8403 37.6919 26.8403 37.7891C26.8403 37.8863 26.8021 37.9794 26.734 38.0482C26.666 38.1169 26.5737 38.1555 26.4774 38.1555Z" fill="#00263E" />
                                              <path d="M23.0053 38.9147L22.9052 38.6719H22.8516V38.9892H22.8932V38.7351L22.9856 38.9622H23.0244L23.1168 38.7343V38.9892H23.1584V38.6719H23.1048L23.0053 38.9147Z" fill="#00263E" />
                                              <path d="M23.424 38.667C23.3922 38.6672 23.3611 38.6769 23.3347 38.6949C23.3083 38.7129 23.2878 38.7384 23.2757 38.7681C23.2636 38.7979 23.2606 38.8306 23.2669 38.8622C23.2732 38.8937 23.2886 38.9226 23.3112 38.9453C23.3338 38.968 23.3625 38.9834 23.3937 38.9897C23.425 38.9959 23.4574 38.9926 23.4868 38.9802C23.5162 38.9679 23.5413 38.947 23.559 38.9202C23.5766 38.8935 23.5861 38.862 23.5861 38.8299C23.5863 38.8083 23.5823 38.787 23.5742 38.7671C23.5661 38.7471 23.5542 38.7291 23.5391 38.7139C23.524 38.6987 23.506 38.6867 23.4862 38.6787C23.4665 38.6706 23.4453 38.6667 23.424 38.667ZM23.4231 38.9502C23.3996 38.95 23.3767 38.9428 23.3572 38.9295C23.3377 38.9161 23.3226 38.8973 23.3137 38.8753C23.3048 38.8533 23.3026 38.8291 23.3073 38.8058C23.312 38.7826 23.3234 38.7612 23.3401 38.7445C23.3568 38.7277 23.378 38.7164 23.4011 38.7118C23.4241 38.7072 23.4481 38.7096 23.4698 38.7188C23.4915 38.7279 23.51 38.7433 23.5231 38.7631C23.5361 38.7829 23.5431 38.8061 23.5431 38.8299C23.5434 38.8458 23.5405 38.8617 23.5346 38.8765C23.5286 38.8913 23.5198 38.9047 23.5086 38.9159C23.4974 38.9272 23.484 38.936 23.4693 38.9419C23.4546 38.9478 23.4389 38.9506 23.4231 38.9502Z" fill="#00263E" />
                                              <path d="M23.9115 38.9139L23.7226 38.6719H23.6895V38.9891H23.731V38.7471L23.9206 38.9891H23.9531V38.6719H23.9115V38.9139Z" fill="#00263E" />
                                              <path d="M24.1852 38.668L24.0488 38.9879H24.093L24.1326 38.8922H24.2771L24.3167 38.9879H24.3617L24.2244 38.668H24.1852ZM24.1492 38.8524L24.2051 38.7178L24.2605 38.8524H24.1492Z" fill="#00263E" />
                                              <path d="M24.5852 38.9506C24.5652 38.9502 24.5456 38.9448 24.5282 38.9348C24.5108 38.9248 24.4961 38.9105 24.4856 38.8934C24.4751 38.8762 24.4691 38.8567 24.468 38.8365C24.4669 38.8164 24.4709 38.7963 24.4795 38.7781C24.4882 38.7599 24.5012 38.7442 24.5175 38.7324C24.5337 38.7206 24.5527 38.7131 24.5725 38.7105C24.5924 38.708 24.6126 38.7105 24.6313 38.7179C24.6499 38.7252 24.6665 38.7372 24.6793 38.7526L24.7095 38.7214C24.6939 38.704 24.6748 38.6901 24.6534 38.6808C24.6321 38.6714 24.609 38.6667 24.5857 38.667C24.5643 38.6668 24.543 38.6708 24.5232 38.6789C24.5033 38.687 24.4853 38.6989 24.47 38.7141C24.4548 38.7292 24.4427 38.7473 24.4344 38.7671C24.4262 38.787 24.4219 38.8083 24.4219 38.8299C24.4218 38.8514 24.4261 38.8728 24.4343 38.8927C24.4425 38.9126 24.4545 38.9306 24.4697 38.9458C24.4849 38.961 24.5029 38.973 24.5228 38.9812C24.5426 38.9893 24.5638 38.9934 24.5852 38.9932C24.6106 38.9936 24.6358 38.988 24.6587 38.977C24.6817 38.966 24.7018 38.9499 24.7176 38.9298L24.6856 38.9008C24.6741 38.9166 24.6589 38.9293 24.6414 38.938C24.624 38.9467 24.6047 38.951 24.5852 38.9506Z" fill="#00263E" />
                                              <path d="M24.9416 38.667C24.9097 38.6672 24.8786 38.6769 24.8522 38.6949C24.8259 38.7129 24.8053 38.7384 24.7933 38.7682C24.7812 38.7979 24.7781 38.8307 24.7845 38.8622C24.7908 38.8937 24.8062 38.9227 24.8288 38.9453C24.8514 38.968 24.8801 38.9834 24.9113 38.9897C24.9426 38.9959 24.9749 38.9926 25.0043 38.9802C25.0338 38.9679 25.0589 38.947 25.0766 38.9202C25.0942 38.8935 25.1036 38.862 25.1036 38.8299C25.1039 38.8083 25.0998 38.787 25.0918 38.7671C25.0837 38.7471 25.0717 38.729 25.0566 38.7139C25.0415 38.6987 25.0236 38.6867 25.0038 38.6787C24.984 38.6706 24.9629 38.6667 24.9416 38.667ZM24.9407 38.9502C24.9172 38.95 24.8942 38.9428 24.8748 38.9295C24.8553 38.9161 24.8402 38.8973 24.8313 38.8753C24.8224 38.8533 24.8202 38.8291 24.8249 38.8058C24.8296 38.7825 24.841 38.7612 24.8577 38.7445C24.8744 38.7277 24.8956 38.7163 24.9187 38.7118C24.9417 38.7072 24.9657 38.7096 24.9874 38.7188C25.0091 38.7279 25.0276 38.7433 25.0407 38.7631C25.0537 38.7829 25.0607 38.8061 25.0607 38.8299C25.061 38.8458 25.0581 38.8617 25.0521 38.8765C25.0462 38.8913 25.0374 38.9047 25.0262 38.9159C25.0149 38.9272 25.0016 38.936 24.9869 38.9419C24.9722 38.9478 24.9565 38.9506 24.9407 38.9502Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2088_4549" x1="29.9921" y1="23.9999" x2="17.9922" y2="23.9999" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#EAE0E5" />
                                                  <stop offset="0.15" stop-color="#FAF8F9" />
                                                  <stop offset="0.45" stop-color="#CBB3C0" />
                                                  <stop offset="0.55" stop-color="#CBB3C0" />
                                                  <stop offset="0.85" stop-color="#FAF8F9" />
                                                  <stop offset="1" stop-color="#EAE0E5" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 面霜类
                                          "面霜": (
                                            <svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="7.59979" y="10.5986" width="32.7998" height="28.1998" fill="url(#paint0_linear_2121_4309)" />
                                              <path d="M9.42296 10.5499C11.6962 10.2844 15.9983 10 23.9981 10C31.9979 10 36.3 10.2844 38.5732 10.5499C40.0781 10.7256 40.998 11.957 40.998 13.4721V35.9998C40.998 37.6566 39.6548 38.9998 37.998 38.9998H9.99825C8.34139 38.9998 6.99823 37.6566 6.99823 35.9998V13.4721C6.99823 11.957 7.91808 10.7256 9.42296 10.5499Z" stroke="#D6C0AD" stroke-width="1.60001" />
                                              <path d="M10 20.5C10 20.5 13.7333 20 23.9999 20C34.2665 20 37.9998 20.5 37.9998 20.5" stroke="#D6C0AD" stroke-width="1.20001" stroke-linecap="round" />
                                              <path d="M19.7866 34.0414L18.595 32.6006H18.3987V34.4611H18.6325V33.0203L19.8227 34.4611H20.0204V32.6006H19.7866V34.0414Z" fill="#00263E" />
                                              <path d="M20.6924 32.6006H20.4591V34.4606H20.6924V32.6006Z" fill="#00263E" />
                                              <path d="M22.7628 34.4611V32.6006H22.5291V33.4131H21.3843V32.6006H21.1505V34.4611H21.3843V33.6485H22.5291V34.4611H22.7628Z" fill="#00263E" />
                                              <path d="M23.9515 32.6006H23.131V34.4615H23.3645V33.8428H23.9515C24.0328 33.8431 24.1133 33.8274 24.1885 33.7963C24.2637 33.7653 24.332 33.7196 24.3896 33.6619C24.4472 33.6042 24.4929 33.5356 24.5241 33.46C24.5553 33.3845 24.5713 33.3035 24.5713 33.2217C24.5713 33.1399 24.5553 33.0589 24.5241 32.9833C24.4929 32.9078 24.4472 32.8392 24.3896 32.7815C24.332 32.7238 24.2637 32.6781 24.1885 32.647C24.1133 32.616 24.0328 32.6002 23.9515 32.6006ZM23.9515 33.6076H23.3645V32.8357H23.9516C24.0532 32.8357 24.1507 32.8764 24.2226 32.9488C24.2945 33.0212 24.3349 33.1193 24.3349 33.2217C24.3349 33.324 24.2945 33.4222 24.2226 33.4946C24.1507 33.567 24.0532 33.6076 23.9515 33.6076Z" fill="#00263E" />
                                              <path d="M25.0678 32.6006H24.8341V34.4605H26.0573V34.2252H25.0678V32.6006Z" fill="#00263E" />
                                              <path d="M26.9248 32.6011C26.7423 32.6011 26.564 32.6556 26.4122 32.7577C26.2605 32.8598 26.1422 33.0049 26.0723 33.1747C26.0025 33.3445 25.9842 33.5313 26.0198 33.7116C26.0554 33.8919 26.1433 34.0574 26.2723 34.1874C26.4013 34.3173 26.5658 34.4059 26.7447 34.4417C26.9237 34.4776 27.1093 34.4592 27.2779 34.3888C27.4465 34.3185 27.5906 34.1994 27.692 34.0466C27.7934 33.8938 27.8475 33.7141 27.8475 33.5303C27.8517 33.4072 27.8307 33.2844 27.7858 33.1698C27.741 33.0551 27.6731 32.951 27.5866 32.8639C27.5001 32.7767 27.3967 32.7084 27.2829 32.6632C27.169 32.618 27.0471 32.5969 26.9248 32.6011ZM26.9248 34.2247C26.7885 34.2247 26.6552 34.184 26.5418 34.1077C26.4284 34.0314 26.34 33.923 26.2878 33.7961C26.2356 33.6692 26.222 33.5297 26.2486 33.395C26.2752 33.2603 26.3408 33.1365 26.4372 33.0394C26.5336 32.9423 26.6565 32.8762 26.7902 32.8494C26.924 32.8226 27.0626 32.8363 27.1886 32.8889C27.3145 32.9414 27.4222 33.0304 27.498 33.1446C27.5738 33.2588 27.6142 33.393 27.6142 33.5303C27.6184 33.6226 27.6035 33.7148 27.5704 33.801C27.5372 33.8872 27.4866 33.9654 27.4217 34.0308C27.3569 34.0961 27.2792 34.1471 27.1936 34.1805C27.1081 34.2139 27.0165 34.2289 26.9248 34.2247Z" fill="#00263E" />
                                              <path d="M28.8392 32.6006H28.1427V34.4612H28.8392C29.0836 34.4602 29.3176 34.3618 29.4901 34.1875C29.6626 34.0131 29.7595 33.777 29.7595 33.5309C29.7595 33.2848 29.6626 33.0487 29.4901 32.8743C29.3176 32.7 29.0836 32.6015 28.8392 32.6006ZM28.8392 34.2261H28.3761V32.8357H28.8392C29.0223 32.8357 29.1979 32.9089 29.3273 33.0393C29.4568 33.1697 29.5295 33.3465 29.5295 33.5309C29.5295 33.7153 29.4568 33.8921 29.3273 34.0225C29.1979 34.1528 29.0223 34.2261 28.8392 34.2261Z" fill="#00263E" />
                                              <path d="M22.2273 35.6634L22.0373 35.2031H21.9355V35.8047H22.0145V35.3229L22.1899 35.7536H22.2635L22.4388 35.3216V35.8047H22.5178V35.2031H22.4161L22.2273 35.6634Z" fill="#00263E" />
                                              <path d="M23.0286 35.1944C22.9678 35.1947 22.9085 35.2131 22.8582 35.2473C22.8078 35.2815 22.7686 35.3299 22.7456 35.3864C22.7226 35.443 22.7167 35.5051 22.7288 35.565C22.7408 35.6249 22.7702 35.6798 22.8133 35.7229C22.8564 35.766 22.9112 35.7953 22.9709 35.8071C23.0305 35.8189 23.0922 35.8127 23.1483 35.7892C23.2044 35.7658 23.2524 35.7261 23.2861 35.6753C23.3198 35.6245 23.3378 35.5647 23.3378 35.5036C23.3383 35.4627 23.3306 35.4222 23.3151 35.3844C23.2997 35.3465 23.277 35.3122 23.2481 35.2834C23.2193 35.2545 23.185 35.2318 23.1473 35.2165C23.1096 35.2013 23.0692 35.1937 23.0286 35.1944ZM23.0269 35.7321C22.982 35.7318 22.9383 35.7181 22.9011 35.6928C22.864 35.6675 22.8351 35.6317 22.8181 35.5899C22.8012 35.5482 22.7969 35.5023 22.8059 35.458C22.8148 35.4138 22.8366 35.3733 22.8685 35.3415C22.9003 35.3097 22.9408 35.2881 22.9848 35.2794C23.0289 35.2707 23.0745 35.2753 23.1159 35.2927C23.1573 35.31 23.1927 35.3393 23.2176 35.3769C23.2425 35.4144 23.2558 35.4585 23.2558 35.5036C23.2564 35.5339 23.2509 35.564 23.2396 35.5921C23.2282 35.6202 23.2114 35.6457 23.19 35.6671C23.1686 35.6885 23.1431 35.7052 23.1151 35.7164C23.087 35.7276 23.0571 35.7329 23.0269 35.7321Z" fill="#00263E" />
                                              <path d="M23.9563 35.6612L23.598 35.2031H23.5352V35.8036H23.614V35.3455L23.9737 35.8036H24.0352V35.2031H23.9563V35.6612Z" fill="#00263E" />
                                              <path d="M24.4756 35.1982L24.2168 35.8047H24.3005L24.3757 35.6235H24.6499L24.7251 35.8047H24.8105L24.55 35.1982H24.4756ZM24.4073 35.5478L24.5132 35.2927L24.6183 35.5478H24.4073Z" fill="#00263E" />
                                              <path d="M25.2338 35.732C25.1958 35.7312 25.1585 35.7209 25.1255 35.7019C25.0925 35.683 25.0647 35.656 25.0448 35.6234C25.0248 35.5909 25.0133 35.5538 25.0113 35.5157C25.0093 35.4775 25.0168 35.4394 25.0332 35.4049C25.0496 35.3705 25.0744 35.3407 25.1052 35.3183C25.1361 35.2959 25.172 35.2817 25.2097 35.2769C25.2474 35.2721 25.2857 35.2768 25.3211 35.2908C25.3565 35.3047 25.3879 35.3274 25.4123 35.3566L25.4696 35.2974C25.44 35.2645 25.4037 35.2382 25.3632 35.2204C25.3227 35.2027 25.2788 35.1938 25.2346 35.1944C25.194 35.1939 25.1537 35.2016 25.116 35.2169C25.0784 35.2322 25.0441 35.2549 25.0152 35.2836C24.9863 35.3123 24.9634 35.3465 24.9477 35.3842C24.932 35.4218 24.9239 35.4623 24.9238 35.5031C24.9238 35.544 24.9318 35.5844 24.9473 35.6221C24.9629 35.6599 24.9858 35.6941 25.0146 35.7229C25.0434 35.7517 25.0776 35.7744 25.1152 35.7899C25.1529 35.8053 25.1931 35.8131 25.2338 35.8128C25.282 35.8134 25.3297 35.8028 25.3732 35.782C25.4168 35.7611 25.455 35.7305 25.4849 35.6925L25.4243 35.6375C25.4023 35.6674 25.3736 35.6916 25.3404 35.708C25.3073 35.7245 25.2707 35.7327 25.2338 35.732Z" fill="#00263E" />
                                              <path d="M25.9192 35.1944C25.8584 35.1947 25.7991 35.2131 25.7488 35.2473C25.6984 35.2815 25.6592 35.3299 25.6362 35.3865C25.6132 35.443 25.6073 35.5052 25.6194 35.565C25.6315 35.6249 25.6609 35.6799 25.704 35.723C25.7471 35.766 25.8019 35.7953 25.8615 35.8071C25.9211 35.8189 25.9829 35.8127 26.039 35.7892C26.0951 35.7658 26.143 35.7261 26.1768 35.6753C26.2105 35.6245 26.2285 35.5647 26.2285 35.5036C26.2289 35.4627 26.2212 35.4222 26.2058 35.3844C26.1904 35.3465 26.1676 35.3122 26.1387 35.2833C26.1099 35.2545 26.0756 35.2318 26.0379 35.2165C26.0002 35.2012 25.9598 35.1937 25.9192 35.1944ZM25.9175 35.7321C25.8726 35.7318 25.8289 35.7181 25.7917 35.6928C25.7546 35.6675 25.7257 35.6317 25.7088 35.5899C25.6918 35.5481 25.6876 35.5022 25.6965 35.458C25.7055 35.4138 25.7273 35.3732 25.7591 35.3415C25.791 35.3097 25.8315 35.2881 25.8755 35.2794C25.9195 35.2707 25.9651 35.2753 26.0066 35.2927C26.048 35.31 26.0834 35.3393 26.1083 35.3769C26.1332 35.4144 26.1465 35.4585 26.1465 35.5036C26.147 35.5339 26.1415 35.5641 26.1302 35.5922C26.1189 35.6203 26.102 35.6458 26.0806 35.6671C26.0592 35.6885 26.0337 35.7053 26.0057 35.7164C25.9776 35.7276 25.9476 35.733 25.9175 35.7321Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2121_4309" x1="40.3995" y1="24.6985" x2="7.59979" y2="24.6985" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#FBF7F4" />
                                                  <stop offset="0.1" stop-color="white" />
                                                  <stop offset="0.48" stop-color="#EAD9C9" />
                                                  <stop offset="0.52" stop-color="#EAD9C9" />
                                                  <stop offset="0.9" stop-color="white" />
                                                  <stop offset="1" stop-color="#FBF7F4" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 精华类
                                          "精华": (
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                              <path d="M10 3h4v3h-4z" />
                                              <path d="M9 6h6l1 3v9a2 2 0 01-2 2h-4a2 2 0 01-2-2V9l1-3z" />
                                              <circle cx="12" cy="14" r="2" />
                                            </svg>
                                          ),
                                          // 爽肤水/化妆水
                                          "爽肤水": (
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                              <rect x="8" y="6" width="8" height="14" rx="1" />
                                              <path d="M10 3h4v3h-4z" />
                                              <path d="M10 10h4M10 13h4" />
                                            </svg>
                                          ),
                                          // 眼霜
                                          "眼霜": (
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                              <ellipse cx="12" cy="14" rx="6" ry="4" />
                                              <path d="M9 10V8a3 3 0 016 0v2" />
                                              <circle cx="12" cy="14" r="1.5" />
                                            </svg>
                                          ),
                                          // 面膜
                                          "面膜": (
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                              <path d="M12 4c-4 0-7 3-7 7v4c0 2 1.5 4 4 5h6c2.5-1 4-3 4-5v-4c0-4-3-7-7-7z" />
                                              <circle cx="9" cy="11" r="1" />
                                              <circle cx="15" cy="11" r="1" />
                                              <path d="M10 15c1 1 3 1 4 0" />
                                            </svg>
                                          ),
                                          // 防晒
                                          "防晒": (
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                              <circle cx="12" cy="12" r="4" />
                                              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                                              <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                                            </svg>
                                          ),
                                        };

                                        // 查找匹配的图标，否则使用默认图标（根据索引循环）
                                        const defaultIcons = [
                                          // 默认瓶子1
                                          <svg key="d1" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <path d="M9 3h6v3H9V3z" />
                                            <path d="M8 6h8v2l2 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8l2-2V6z" />
                                          </svg>,
                                          // 默认瓶子2
                                          <svg key="d2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <rect x="7" y="8" width="10" height="12" rx="2" />
                                            <path d="M9 4h6v4H9z" />
                                          </svg>,
                                          // 默认瓶子3
                                          <svg key="d3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <path d="M10 4h4v2h-4z" />
                                            <path d="M8 6h8c1 0 2 1 2 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8c0-1 1-2 2-2z" />
                                            <ellipse cx="12" cy="13" rx="3" ry="4" />
                                          </svg>,
                                        ];

                                        const trimmedProduct = product.trim();
                                        const icon = productIcons[trimmedProduct] || defaultIcons[index % defaultIcons.length];

                                        return (
                                          <div key={trimmedProduct} className="flex flex-col items-center gap-2">
                                            {/* SVG 图标占位符 - 之后手动替换 */}
                                            {icon}
                                            {/* 产品名称 */}
                                            <span className="text-sm text-brand-charcoal">
                                              {trimmedProduct}
                                            </span>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>

                                {/* Meta Item: Benefits (Tags) */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    针对功效
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {(selectedScheme.benefits || ["保湿锁水", "屏障增强"]).map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded-full border border-brand-charcoal/20 px-4 py-1.5 text-sm text-brand-charcoal"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Meta Item: Certifications */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    检测认证
                                  </h3>
                                  <div className="flex items-center gap-5">
                                    <img
                                      src="https://wp-cdn.4ce.cn/v2/kqZbfaN.png"
                                      alt="SGS"
                                      title="SGS 权威认证"
                                      className="h-7 w-auto"
                                    />
                                    <img
                                      src="https://wp-cdn.4ce.cn/v2/fRqWjc5.png"
                                      alt="Intertek"
                                      title="Intertek 质量认证"
                                      className="h-7 w-auto"
                                    />
                                  </div>
                                </div>

                                {/* Meta Item: Special Support */}
                                {selectedScheme.specialSupport && (
                                  <div className="flex flex-col">
                                    <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                      特殊人群支持
                                    </h3>
                                    <div className="border border-dashed border-brand-charcoal/30 p-5 text-sm leading-relaxed text-brand-charcoal/80">
                                      {selectedScheme.specialSupport}
                                    </div>
                                  </div>
                                )}
                              </m.aside>

                              {/* 右侧：步骤网格 (Steps Grid) */}
                              <m.section
                                className={cn(
                                  "flex flex-1 items-center gap-10 pb-10 pr-4",
                                  selectedScheme.steps.length > 3
                                    ? "overflow-hidden"
                                    : "overflow-x-auto scrollbar-hide snap-x snap-mandatory"
                                )}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
                              >
                                <div
                                  className={cn(
                                    "flex gap-10",
                                    selectedScheme.steps.length > 3 && "animate-marquee hover:[animation-play-state:paused]"
                                  )}
                                >
                                  {(selectedScheme.steps.length > 3
                                    ? [...selectedScheme.steps, ...selectedScheme.steps]
                                    : selectedScheme.steps
                                  ).map((step, index) => (
                                    <m.article
                                      key={`${step.title}-${index}`}
                                      className="group flex w-[320px] flex-shrink-0 flex-col gap-5 snap-start h-full"
                                      initial={{ opacity: 0, y: 30 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{
                                        duration: 0.8,
                                        delay: 0.3 + (index % selectedScheme.steps.length) * 0.1,
                                        ease: [0.23, 1, 0.32, 1]
                                      }}
                                    >
                                      {/* Image Wrapper */}
                                      <div className="relative w-full h-[280px] flex items-center justify-center overflow-hidden bg-brand-beige/20">
                                        <img
                                          src={step.imageUrl || "https://wp-cdn.4ce.cn/v2/sSNhrfD.png"}
                                          alt={step.title}
                                          className="h-full w-full object-contain mix-blend-multiply transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                                        />
                                      </div>

                                      {/* Step Info */}
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3 text-sm text-brand-charcoal-light opacity-60 after:flex-1 after:h-px after:bg-brand-charcoal/10">
                                          STEP {String((index % selectedScheme.steps.length) + 1).padStart(2, "0")}
                                        </div>
                                        <h2 className="font-display text-xl font-medium text-brand-charcoal">
                                          {step.title}
                                        </h2>
                                        <p className="text-justify text-sm leading-relaxed text-brand-charcoal/80">
                                          {step.description}
                                        </p>
                                      </div>
                                    </m.article>
                                  ))}
                                </div>
                              </m.section>
                            </div>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
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

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外 */}
      {backgroundImage && (
        <div className="fixed inset-0 z-[-1]">
          <Image
            src={backgroundImage}
            alt="Background"
            fill
            className="object-cover"
            priority
          />
          {/* 叠加层，确保文字可读性 */}
          <div className="absolute inset-0 bg-black/10" />
        </div>
      )}

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
