"use client";

import { useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { Sun, Moon, Heart, Play, ChevronRight } from "lucide-react";
import { FloatingCardLayout } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";
import { cn } from "@/lib/utils";

// 晨间仪式步骤 (基于 NIHPLOD 产品线)
const morningSteps = [
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
];

// 晚间仪式步骤 (基于 NIHPLOD 产品线)
const eveningSteps = [
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
];

type TabType = "morning" | "evening" | "couple";

// 护肤步骤类型
interface RitualStep {
  order: number;
  name: string;
  nameEn: string;
  description: string;
  duration: string;
  productSlug: string | null;
}

/**
 * 护肤仪式页内容组件
 */
export function RitualContent() {
  const [activeTab, setActiveTab] = useState<TabType>("morning");

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "morning", label: "晨间仪式", icon: <Sun className="h-4 w-4" /> },
    { key: "evening", label: "晚间仪式", icon: <Moon className="h-4 w-4" /> },
    { key: "couple", label: "双人SPA", icon: <Heart className="h-4 w-4" /> },
  ];

  return (
    <FloatingCardLayout
      backgroundImage="/images/ritual-bg.jpg"
      backgroundAlt="护肤仪式"
      initialState="expanded"
      pageTitle="护肤仪式"
    >
      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        <p className="text-xs uppercase tracking-widest text-brand-gold">
          SKINCARE RITUAL
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
          护肤仪式
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/70">
          每一次护肤，都是与自己对话的珍贵时光。
          <br />
          放慢节奏，感受每一个步骤带来的愉悦与治愈。
        </p>
      </m.div>

      {/* 视频预览区 */}
      <m.div
        className="relative mb-6 aspect-video overflow-hidden rounded-xl bg-brand-beige/30"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold text-white shadow-lg transition-transform hover:scale-110"
          >
            <Play className="ml-1 h-6 w-6" fill="white" />
          </button>
        </div>
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-brand-charcoal/60">
          5分钟护肤仪式教程
        </p>
      </m.div>

      {/* Tab 切换 */}
      <m.div
        className="mb-6 flex justify-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors",
              activeTab === tab.key
                ? "bg-brand-gold text-white"
                : "bg-brand-beige/50 text-brand-charcoal hover:bg-brand-beige"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </m.div>

      {/* 内容区域 */}
      <div className="pb-20">
        {activeTab === "morning" && (
          <RitualSteps
            title="晨间仪式"
            titleEn="MORNING RITUAL"
            description="清晨护肤，唤醒肌肤活力，为新的一天注入能量"
            steps={morningSteps}
            icon={<Sun className="h-5 w-5" />}
          />
        )}

        {activeTab === "evening" && (
          <RitualSteps
            title="晚间仪式"
            titleEn="EVENING RITUAL"
            description="夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新"
            steps={eveningSteps}
            icon={<Moon className="h-5 w-5" />}
          />
        )}

        {activeTab === "couple" && <CoupleSpaSection />}
      </div>
    </FloatingCardLayout>
  );
}

/**
 * 护肤步骤组件
 */
function RitualSteps({
  title,
  titleEn,
  description,
  steps,
  icon,
}: {
  title: string;
  titleEn: string;
  description: string;
  steps: RitualStep[];
  icon: React.ReactNode;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 标题区 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-brand-gold">
            {titleEn}
          </p>
          <h2 className="font-serif text-xl text-brand-charcoal">{title}</h2>
        </div>
      </div>
      <p className="mb-6 text-sm text-brand-charcoal/70">{description}</p>

      {/* 步骤卡片 */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <m.div
            key={step.order}
            className="rounded-xl border border-brand-beige bg-white p-4 shadow-sm"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
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
    </m.div>
  );
}

/**
 * 双人SPA区块
 */
function CoupleSpaSection() {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 标题区 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold">
          <Heart className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-brand-gold">
            COUPLE SPA
          </p>
          <h2 className="font-serif text-xl text-brand-charcoal">双人SPA</h2>
        </div>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-brand-charcoal/70">
        与伴侣一起，享受护肤的亲密时光。
        <br />
        在彼此的呵护中，感受爱与美的交融。
      </p>

      {/* 双人SPA 特色卡片 */}
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5">
          <h3 className="font-serif text-lg text-brand-charcoal">
            💑 面对面护肤
          </h3>
          <p className="mt-2 text-sm text-brand-charcoal/70">
            相对而坐，为彼此涂抹护肤品。用指尖传递温柔，在每一次触碰中加深情感连接。
          </p>
        </div>

        <div className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5">
          <h3 className="font-serif text-lg text-brand-charcoal">
            🧴 互相按摩
          </h3>
          <p className="mt-2 text-sm text-brand-charcoal/70">
            轮流为对方进行面部按摩，配合舒缓的音乐与香氛，创造属于你们的私密SPA时光。
          </p>
        </div>

        <div className="rounded-xl border border-brand-beige bg-gradient-to-br from-brand-blush/30 to-white p-5">
          <h3 className="font-serif text-lg text-brand-charcoal">
            🕯️ 仪式感布置
          </h3>
          <p className="mt-2 text-sm text-brand-charcoal/70">
            点上香薰蜡烛，播放轻柔音乐，准备好柔软的毛巾和温热的花茶，让护肤成为一场浪漫约会。
          </p>
        </div>
      </div>

      {/* 产品推荐 */}
      <div className="mt-6 rounded-xl bg-brand-gold/10 p-4">
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
      </div>
    </m.div>
  );
}

