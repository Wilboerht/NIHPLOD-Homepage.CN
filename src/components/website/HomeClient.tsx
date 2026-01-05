
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";
// import { UserButton } from "./UserButton";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";



interface HomeClientProps {
  content?: HomePageContent;
}

export default function HomeClient({ content: _content }: HomeClientProps) {
  const [isExpanded, setIsExpanded] = useState(true); // 首页默认展开
  const { setDrawerOpen, setNavMenuOpen } = useLayout();

  // 首页特殊处理：立即设置抽屉为展开状态，不需要动画
  useEffect(() => {
    setDrawerOpen(true);
  }, [setDrawerOpen]);

  const handleCollapse = () => {
    setIsExpanded(false);
    setDrawerOpen(false);
    // 展开底部导航菜单
    setNavMenuOpen(true);
  };

  return (
    <>
      {/* 内容区域容器 */}
      <m.div
        className="safe-area-content !-top-[1px]"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 抽屉 - z-20 Ensure it sits on top of the button */}
            <m.div
              className="relative z-20 w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              style={{ willChange: "flex-grow, height" }}
              initial={{ height: 0, flexGrow: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: !isExpanded ? 0 : "auto"
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                delay: isExpanded ? 0.3 : 0
              }}
            >
              <div className={cn("home-container relative h-full w-full flex flex-col", !isExpanded && "hidden")}>
                {/* 顶部导航容器 - 优化样式 */}
                <m.div
                  className="w-full flex flex-col relative z-20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  {/* 第一层：公告栏 (Top Bar) - 可交互 */}
                  <AnnouncementBar />

                  {/* 第二层：主导航 (Main Nav) */}
                  <header className="flex w-full items-center justify-between px-6 py-4 lg:px-24 lg:py-8">
                    {/* 左侧导航 */}
                    <nav className="flex items-center gap-8 text-sm font-bold uppercase tracking-[0.15em] text-brand-charcoal lg:gap-16 pl-1">
                      <Link href="/products" className="hover:opacity-70 transition-opacity">购物</Link>
                      <Link href="/story" className="hover:opacity-70 transition-opacity">关于</Link>
                      <Link href="/ritual" className="hover:opacity-70 transition-opacity">仪式</Link>
                      <button className="flex items-center gap-2 hover:opacity-70 transition-opacity group">
                        搜索 <span className="font-normal text-brand-charcoal/40 group-hover:text-brand-charcoal transition-colors">Q</span>
                      </button>
                    </nav>

                    {/* 右侧：购物袋 */}
                    <div className="text-sm font-bold uppercase tracking-[0.15em] text-brand-charcoal hover:opacity-70 transition-opacity cursor-pointer pr-1">
                      购物袋 (0)
                    </div>
                  </header>
                </m.div>

                {/* 主内容区：左文字 + 右图片 */}
                {/* 主内容区：左文字 + 右图片 */}
                <main className="relative z-10 flex flex-1 w-full">
                  {/* 左侧内容区 - 垂直居中布局 */}
                  <div className="flex w-full flex-col px-6 py-8 lg:w-1/2 lg:pl-24 lg:pr-12 lg:py-12">
                    {/* 上方弹性空间 */}
                    <div className="flex-1 flex flex-col justify-center">
                      {/* 主内容 */}
                      <div className="flex flex-col gap-6 lg:gap-8">
                        {/* 标题 - 标准化: Mobile 36px, Desktop 48px/60px */}
                        <m.h1
                          className="font-serif text-4xl font-light leading-[1.1] tracking-wide text-brand-charcoal lg:text-5xl xl:text-6xl"
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 1, delay: 0.3 }}
                        >
                          逆转时光<br />
                          焕活新生
                        </m.h1>

                        {/* 描述文字 - 标准化: Mobile 14px, Desktop 16px (Standard Body) */}
                        <m.p
                          className="max-w-md text-sm leading-[1.75] text-brand-charcoal/70 lg:text-base"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 1, delay: 0.5 }}
                        >
                          海豚肌肤每两小时自我更新的神奇能力，是 NIHPLOD 的灵感来源。我们将这种动物本能转化为尖端护肤科技。
                        </m.p>

                        {/* 促销信息 - 标准化: Mobile 12px, Desktop 14px */}
                        <m.div
                          className="space-y-2 text-xs lg:text-sm"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 1, delay: 0.6 }}
                        >
                          <p className="font-medium uppercase tracking-widest text-brand-charcoal/50">新年限定礼遇</p>
                          <p className="text-brand-charcoal/80">购买任意产品即享精致小样套装</p>
                        </m.div>

                        {/* CTA 链接 - 标准化: Mobile 14px, Desktop 16px */}
                        <m.div
                          className="pt-2"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 1, delay: 0.7 }}
                        >
                          <button
                            onClick={handleCollapse}
                            className="text-sm font-medium text-brand-charcoal underline underline-offset-8 decoration-1 transition-all hover:text-brand-gold hover:decoration-brand-gold lg:text-base"
                          >
                            立即探索
                          </button>
                        </m.div>
                      </div>
                    </div>

                    {/* 底部：品牌大 Logo */}
                    <m.div
                      className="pt-12 lg:pt-10"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1.2, delay: 0.8 }}
                    >
                      <Image
                        src="/images/logo.png"
                        alt="NIHPLOD"
                        width={400}
                        height={120}
                        className="w-auto h-12 lg:h-16 object-contain opacity-90"
                      />
                    </m.div>
                  </div>

                  {/* 右侧图片区 */}
                  <div className="hidden lg:flex w-1/2 flex-col justify-center p-6 lg:pr-24 lg:py-12 lg:pl-0">
                    <m.div
                      className="relative h-full w-full overflow-hidden rounded-2xl shadow-sm"
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 1.2, delay: 0.4 }}
                    >
                      <Image
                        src="/images/home-hero.png"
                        alt="NIHPLOD Hero"
                        fill
                        className="object-cover"
                        priority
                      />
                    </m.div>
                  </div>
                </main>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5 overflow-hidden"
            >
              {/* 矿物纹理覆盖层 - 使用与抽屉相同的 texture-overlay 类 */}
              <div className="texture-overlay absolute inset-0" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isExpanded ? 180 : 0, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div >
      </m.div >

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}

// 公告栏内容
const ANNOUNCEMENTS = [
  "新会员首单享奢宠礼遇 & 免运费配送",
  "探索全新 NIHPLOD 逆转时光系列",
  "加入会员，尊享积分兑换与生日礼遇"
]

// 独立的公告栏组件
function AnnouncementBar() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const next = () => setIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length)
  const prev = () => setIndex((prev) => (prev - 1 + ANNOUNCEMENTS.length) % ANNOUNCEMENTS.length)

  return (
    <div className="w-full border-b border-brand-charcoal/5 h-[36px] flex items-center bg-brand-light/20">

      {/* 这是一个填满左侧剩余空间的容器：从屏幕左边一直到右侧功能区左边 */}
      <div className="flex-1 flex items-center justify-between px-6 lg:pl-24 lg:pr-6 min-w-0">
        {/* 左箭头 */}
        <button
          onClick={prev}
          className="hover:text-brand-charcoal transition-colors group p-2 -ml-2 select-none flex-none"
          aria-label="Previous announcement"
        >
          <ChevronDown className="h-3 w-3 rotate-90 opacity-40 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 中间公告: 在两个箭头之间居中 */}
        <div className="flex-1 relative h-[36px] overflow-hidden mx-4">
          <AnimatePresence mode="wait">
            <m.span
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center text-center text-xs uppercase tracking-[0.1em] text-brand-charcoal/80 font-normal truncate select-none"
            >
              {ANNOUNCEMENTS[index]}
            </m.span>
          </AnimatePresence>
        </div>

        {/* 右箭头 (桌面端显示) */}
        <button
          onClick={next}
          className="hidden sm:block hover:text-brand-charcoal transition-colors group p-2 -mr-2 select-none flex-none"
          aria-label="Next announcement"
        >
          <ChevronDown className="h-3 w-3 -rotate-90 opacity-40 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* 右侧功能区 (自然布局在右侧) */}
      <div className="flex-none flex items-center gap-6 pr-6 lg:pr-24 h-full text-[10px] lg:text-xs uppercase tracking-widest text-brand-charcoal/60 border-l border-brand-charcoal/5 pl-6">
        <div className="hidden sm:flex items-center gap-6 font-medium">
          <Link href="/account" className="hover:text-brand-charcoal transition-colors">账户</Link>
          <Link href="/loyalty" className="hover:text-brand-charcoal transition-colors">会员中心</Link>
        </div>

        {/* 移动端右箭头 (替代桌面端右箭头在窄屏显示) */}
        <button
          onClick={next}
          className="sm:hidden hover:text-brand-charcoal transition-colors group p-2 -mr-2 select-none"
          aria-label="Next announcement"
        >
          <ChevronDown className="h-3 w-3 -rotate-90 opacity-40 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </div>
  )
}
