"use client";

import { m } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Silk } from "@/components/ui/Silk";

/**
 * AI 护肤顾问欢迎页
 *
 * NIHPLOD 旎柏 - 源自摩纳哥的高端护肤品牌
 * 品牌理念：奢华、温馨、科技、纯净、仪式感
 * 核心技术：真脂质体靶向技术
 */
export function AdvisorWelcome() {
  const router = useRouter();

  const handleStart = () => {
    router.push("/advisor/questions");
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden">
      {/* Silk 丝绸背景效果 */}
      <div className="absolute inset-0">
        <Silk
          color="#f5f0e8"
          speed={2}
          scale={1}
          noiseIntensity={0.5}
          rotation={0.05}
        />
      </div>

      {/* 顶部导航 */}
      <m.header
        className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12 sm:py-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        <Link
          href="/"
          className="text-sm text-brand-charcoal/50 transition-colors hover:text-brand-gold"
        >
          ← 首页
        </Link>
        <Image
          src="/images/logo.png"
          alt="NIHPLOD"
          width={100}
          height={30}
          className="h-5 w-auto opacity-70 sm:h-6"
        />
        <div className="w-12" />
      </m.header>

      {/* 主内容区 */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20">
        {/* 装饰线条 */}
        <m.div
          className="mb-10 h-[1px] w-16 bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent sm:mb-12 sm:w-20"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.4 }}
        />

        {/* 英文标题 */}
        <m.p
          className="mb-4 text-[10px] font-light tracking-[0.4em] text-brand-gold sm:mb-5 sm:text-xs"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          AI SKIN ADVISOR
        </m.p>

        {/* 中文主标题 */}
        <m.h1
          className="text-center font-serif text-5xl font-light leading-[1.2] tracking-wide text-brand-charcoal sm:text-6xl md:text-7xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          专属定制
        </m.h1>

        {/* 副标题 */}
        <m.p
          className="mt-6 max-w-xs text-center text-sm font-light leading-relaxed text-brand-charcoal/60 sm:mt-8 sm:max-w-md sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.9 }}
        >
          回答简单问题，发现专属于你的护肤方案
        </m.p>

        {/* 按钮 */}
        <m.button
          onClick={handleStart}
          className="mt-14 rounded-full bg-brand-gold px-16 py-4 text-sm tracking-[0.15em] text-white shadow-lg shadow-brand-gold/20 transition-all duration-300 hover:shadow-xl hover:shadow-brand-gold/30 sm:mt-16 sm:px-20 sm:py-5 sm:text-base"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          开始测试
        </m.button>

        {/* 时间提示 */}
        <m.span
          className="mt-6 text-[11px] font-light tracking-wider text-brand-charcoal/40 sm:mt-8 sm:text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.3 }}
        >
          约 2 分钟
        </m.span>
      </main>

      {/* 底部品牌语 */}
      <m.footer
        className="relative z-10 pb-8 text-center sm:pb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.5 }}
      >
        <p className="text-[10px] font-light tracking-[0.2em] text-brand-charcoal/30 sm:text-xs">
          逆转时光 · NIHPLOD
        </p>
      </m.footer>
    </div>
  );
}

