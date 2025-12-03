"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Clock, CheckCircle, Camera, X } from "lucide-react";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";

/**
 * 功能特点列表
 */
const features = [
  {
    icon: CheckCircle,
    text: "6 道简单问题",
  },
  {
    icon: Clock,
    text: "约 2 分钟完成",
  },
  {
    icon: Camera,
    text: "AI 面部识别（可选）",
  },
];

/**
 * AI 护肤顾问欢迎页
 * Step 0: 介绍流程，引导用户开始测试
 */
export function AdvisorWelcome() {
  const router = useRouter();

  const handleStart = () => {
    router.push("/advisor/questions");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      {/* 返回按钮 */}
      <Link
        href="/"
        className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white md:left-6 md:top-6"
        aria-label="返回首页"
      >
        <X className="h-5 w-5" />
      </Link>

      {/* 主内容区域 */}
      <m.div
        className="w-full max-w-md text-center"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* 顶部图标 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-gold/10"
        >
          <Sparkles className="h-10 w-10 text-brand-gold" />
        </m.div>

        {/* 标题 */}
        <m.div variants={fadeInUp} transition={defaultTransition}>
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-gold">
            AI SKINCARE ADVISOR
          </p>
          <h1 className="font-serif text-3xl text-brand-charcoal md:text-4xl">
            AI 护肤顾问
          </h1>
        </m.div>

        {/* 副标题说明 */}
        <m.p
          variants={fadeInUp}
          transition={defaultTransition}
          className="mt-4 text-base leading-relaxed text-brand-charcoal/70"
        >
          花 2 分钟回答几个简单问题
          <br />
          获取专属于你的护肤方案
        </m.p>

        {/* 功能特点 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm text-brand-charcoal/80 backdrop-blur-sm"
            >
              <feature.icon className="h-4 w-4 text-brand-gold" />
              <span>{feature.text}</span>
            </div>
          ))}
        </m.div>

        {/* 开始按钮 */}
        <m.div variants={fadeInUp} transition={defaultTransition} className="mt-10">
          <button
            onClick={handleStart}
            className="group inline-flex items-center gap-2 rounded-full bg-brand-gold px-8 py-4 text-base font-medium text-white shadow-lg shadow-brand-gold/25 transition-all hover:bg-brand-gold/90 hover:shadow-xl hover:shadow-brand-gold/30"
          >
            开始测试
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </m.div>

        {/* 底部提示 */}
        <m.p
          variants={fadeInUp}
          transition={defaultTransition}
          className="mt-6 text-xs text-brand-charcoal/50"
        >
          🔒 您的信息将被安全保护，仅用于生成护肤建议
        </m.p>
      </m.div>

      {/* 装饰元素 - 浮动圆形 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <m.div
          className="absolute -left-20 top-1/4 h-40 w-40 rounded-full bg-brand-gold/5"
          animate={{
            y: [0, 20, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <m.div
          className="absolute -right-16 bottom-1/3 h-32 w-32 rounded-full bg-brand-blush/50"
          animate={{
            y: [0, -15, 0],
            scale: [1, 1.03, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
        <m.div
          className="absolute right-1/4 top-16 h-16 w-16 rounded-full bg-brand-gold/10"
          animate={{
            y: [0, 10, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />
      </div>
    </div>
  );
}

