"use client";

import { m } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

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
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-brand-cream">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* 右上角光晕 */}
        <m.div
          className="absolute -right-[15%] -top-[20%] h-[60vh] w-[60vh] rounded-full bg-brand-gold/[0.06]"
          style={{ filter: "blur(80px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
        />
        {/* 左下角光晕 */}
        <m.div
          className="absolute -bottom-[15%] -left-[10%] h-[50vh] w-[50vh] rounded-full bg-brand-blush/60"
          style={{ filter: "blur(60px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.2 }}
        />
      </div>

      {/* 顶部导航 */}
      <m.header
        className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10 sm:py-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
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
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16">
        {/* 装饰小元素 */}
        <m.div
          className="mb-8 h-px w-10 bg-brand-gold/50 sm:mb-10 sm:w-12"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        />

        {/* 英文标题 */}
        <m.p
          className="mb-3 text-[11px] tracking-[0.3em] text-brand-gold sm:mb-4 sm:text-xs"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          SKIN ADVISOR
        </m.p>

        {/* 中文主标题 */}
        <m.h1
          className="text-center font-serif text-4xl leading-[1.3] text-brand-charcoal sm:text-5xl md:text-6xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          专属定制
        </m.h1>

        {/* 副标题 */}
        <m.p
          className="mt-5 max-w-xs text-center text-base leading-relaxed text-brand-charcoal/60 sm:mt-6 sm:max-w-sm sm:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          回答简单问题，发现专属于你的护肤方案
        </m.p>

        {/* 按钮 */}
        <m.button
          onClick={handleStart}
          className="mt-12 rounded-full bg-brand-gold px-14 py-4 text-base tracking-wider text-white shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-brand-gold/20 sm:mt-14 sm:px-16 sm:py-5 sm:text-lg"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          开始测试
        </m.button>

        {/* 时间提示 */}
        <m.span
          className="mt-5 text-xs text-brand-charcoal/40 sm:mt-6 sm:text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          约 2 分钟
        </m.span>
      </main>

      {/* 底部品牌语 */}
      <m.footer
        className="relative z-10 pb-6 text-center sm:pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.4 }}
      >
        <p className="text-[10px] tracking-[0.15em] text-brand-charcoal/30 sm:text-xs">
          逆转时光 · NIHPLOD
        </p>
      </m.footer>
    </div>
  );
}

