
"use client";

import { useEffect, useState, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MapPin, X } from "lucide-react";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

interface AdvisorWelcomeProps {
  backgroundImage?: string;
}

/**
 * AI 护肤顾问欢迎页
 *
 * NIHPLOD 旎柏 - 源自摩纳哥的高端护肤品牌
 * 品牌理念：奢华、温馨、科技、纯净、仪式感
 *
 * 设计风格：大气、精致、清爽、简约不简单
 */
export function AdvisorWelcome({ backgroundImage }: AdvisorWelcomeProps) {
  const router = useRouter();
  const { initSession } = useAdvisorAnalytics();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Mouse parallax state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Location/Region states
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showRegionSelectModal, setShowRegionSelectModal] = useState(false);

  const { setDrawerOpen } = useLayout();

  useEffect(() => {
    initSession();
    router.prefetch("/advisor/questions");
  }, [initSession, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  // Mouse interaction effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
      setMousePos({ x: moveX, y: moveY });
    };

    if (isExpanded) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isExpanded]);

  // Region options
  const regionOptions = [
    { group: "华北/东北", regions: ["北京", "天津", "河北", "山西", "内蒙古", "黑龙江", "吉林", "辽宁"] },
    { group: "华东", regions: ["上海", "江苏", "浙江", "山东", "安徽", "江西"] },
    { group: "华南", regions: ["广东", "广西", "海南", "福建", "台湾"] },
    { group: "华中/西南", regions: ["湖北", "湖南", "河南", "四川", "重庆", "贵州", "云南"] },
    { group: "西北", regions: ["陕西", "甘肃", "宁夏", "新疆"] },
    { group: "高原", regions: ["西藏", "青海"] },
  ];

  /* --- Handlers --- */
  const handleLocationAccept = useCallback(async () => {
    setShowLocationModal(false);
    if ("geolocation" in navigator) {
      try {
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000,
          });
        });
        sessionStorage.setItem("locationConsent", "granted");
        setIsLoading(true);
        router.push("/advisor/questions");
      } catch {
        setShowRegionSelectModal(true);
      }
    } else {
      setShowRegionSelectModal(true);
    }
  }, [router]);

  const handleRegionSelect = useCallback((region: string) => {
    setShowRegionSelectModal(false);
    sessionStorage.setItem("locationConsent", "granted");
    sessionStorage.setItem("userRegion", region);
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);

  const handleSkipRegionSelect = useCallback(() => {
    setShowRegionSelectModal(false);
    sessionStorage.setItem("locationConsent", "declined");
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);

  const handleLocationDecline = useCallback(() => {
    setShowLocationModal(false);
    sessionStorage.setItem("locationConsent", "declined");
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);

  const handleStart = () => {
    setShowLocationModal(true);
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=JetBrains+Mono:wght@300&display=swap');
      `}</style>

      {/* Background */}
      {backgroundImage && (
        <div className="fullscreen-bg">
          <Image
            src={backgroundImage}
            alt="Background"
            fill
            priority
            quality={75}
            className="object-cover"
            sizes="100vw"
          />
        </div>
      )}

      {/* Main Drawer Container */}
      <m.div
        className="safe-area-content !top-0"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full font-sans"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <div className="flex h-full flex-col items-center">

            {/* Drawer Content */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
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
              {/* Paper Texture */}
              <div
                className="pointer-events-none absolute inset-0 z-50 opacity-[0.04]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
              />

              <div className={cn(
                "flex h-full flex-col overflow-y-auto",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                !isExpanded && "hidden"
              )}>
                {/* Grid Layout Container */}
                <div className="mx-auto grid min-h-full max-w-[1600px] grid-cols-12 grid-rows-[auto_1fr_auto] gap-4 p-4 md:gap-8 md:p-8 w-full">

                  {/* Header */}
                  <header className="col-span-12 flex items-start justify-between border-b border-[#3D4430]/15 pb-4 md:pb-8">
                    <img
                      src="https://wp-cdn.4ce.cn/v2/SItKqUC.png"
                      alt="Logo"
                      className="h-8 mix-blend-multiply"
                    />
                    <div className="font-light tracking-[0.1em] text-[#3D4430] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>
                      Ref: AI-DERMA-2024 / P-01
                    </div>
                  </header>

                  {/* Main Content */}
                  <main className="col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-center">

                    {/* Spacer */}
                    <div className="relative hidden md:block md:col-span-1 md:col-start-1" />

                    {/* Image Section */}
                    <div className="relative col-span-1 max-w-[280px] mx-auto md:max-w-none md:mx-0 md:col-span-4 md:col-start-2">
                      <m.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                      >
                        {/* Frame Corner */}
                        <div className="absolute -left-2.5 -top-2.5 h-10 w-10 border-l border-t border-[#3D4430]" />

                        <img
                          src="https://wp-cdn.4ce.cn/v2/bP048kN.png"
                          alt="小旎老师"
                          className="block h-auto w-full grayscale-[0.2] contrast-[1.05]"
                          style={{
                            maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
                            transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
                            transition: 'transform 0.1s ease-out'
                          }}
                        />
                      </m.div>
                    </div>

                    {/* Text Content Section */}
                    <div className="col-span-1 md:col-span-5 md:col-start-7 pl-0 md:pl-8">
                      <m.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                      >
                        <span className="mb-4 block text-[#3D4430]" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}># AI智能测肤</span>

                        <h1 className="mb-6 md:mb-8 font-light tracking-tight text-[#1A1A1A]" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
                          您口袋里的
                          <span className="block font-semibold">专属护肤导师</span>
                        </h1>

                        <div className="relative mb-8 md:mb-12 max-w-full md:max-w-[480px] pl-6 md:pl-8 text-[#5E5E5E]" style={{ fontSize: 'clamp(1rem, 2vw, 1.1rem)', lineHeight: '1.8' }}>
                          {/* Accent Line */}
                          <div className="absolute left-0 top-2 h-[80%] w-px bg-[#3D4430] opacity-30" />

                          你好，我是小旎老师。
                          <p>
                            为了精准分析你的肌肤状态并生成专业定制化报告，接下来我将引导你进行 <strong className="font-semibold text-[#1A1A1A]">问卷调查</strong> 与 <strong className="font-semibold text-[#1A1A1A]">面部信息采集</strong>。
                            <br /><br />
                            整个过程非常简单，预计占用 <strong className="font-semibold text-[#1A1A1A]">2-5 分钟</strong>，请在 <strong className="font-semibold text-[#1A1A1A]">素颜</strong> 及光线充足的环境下进行操作。本测试严格遵守隐私保护条款，所有采集信息仅用于实时分析计算及临时版报告生成。
                          </p>
                        </div>

                        <button
                          onClick={handleStart}
                          disabled={isLoading}
                          className="group relative inline-flex w-full md:w-auto justify-center items-center overflow-hidden border border-[#3D4430] bg-[#3D4430] px-8 md:px-14 py-4 md:py-5 text-base text-white tracking-[0.05em] transition-all duration-300 hover:bg-transparent hover:text-[#3D4430] hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          <span className={cn(
                            "relative flex items-center transition-colors duration-300",
                            isLoading ? "text-white" : "group-hover:text-[#3D4430]"
                          )}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? "加载中..." : "立即开启"}
                          </span>
                        </button>
                      </m.div>
                    </div>
                  </main>

                  {/* Footer */}
                  <footer className="col-span-12 mt-4 md:mt-8 flex flex-col items-center justify-between border-t border-[#3D4430]/15 pt-4 md:pt-8 md:flex-row md:items-end gap-6 md:gap-0">
                    <div className="flex flex-wrap justify-center gap-y-4 gap-x-8 md:justify-start">
                      <div className="text-[#5E5E5E]" style={{ fontSize: '0.75rem' }}>
                        <strong className="mb-1 block text-[#3D4430] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Phase 01</strong>
                        多维问卷调研
                      </div>
                      <div className="text-[#5E5E5E]" style={{ fontSize: '0.75rem' }}>
                        <strong className="mb-1 block text-[#3D4430] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Phase 02</strong>
                        面部数据采样
                      </div>
                      <div className="text-[#5E5E5E]" style={{ fontSize: '0.75rem' }}>
                        <strong className="mb-1 block text-[#3D4430] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Phase 03</strong>
                        定制报告生成
                      </div>
                    </div>

                    <div className="mt-2 md:mt-0 text-center md:text-right leading-relaxed text-black/40" style={{ fontSize: '0.7rem' }}>
                      本站护肤检测相关大数据及人工智能技术
                      <p>由 MySkin.Today 提供服务支持</p>
                    </div>
                  </footer>

                </div>
              </div>
            </m.div>

            {/* Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-6 py-2 md:px-10 md:py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              <div className="texture-overlay absolute inset-0 rounded-b-2xl opacity-[0.04]" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-[#3D4430] lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-[#3D4430] lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div >
      </m.div >

      {/* Modals */}
      <AnimatePresence>
        {showLocationModal && (
          <m.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <m.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLocationModal(false)}
            />

            <m.div
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-[#F8F6F0] shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={() => setShowLocationModal(false)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/5 hover:text-brand-charcoal/60"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="px-6 pb-6 pt-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3D4430]/10">
                  <MapPin className="h-7 w-7 text-[#3D4430]" />
                </div>

                <h3 className="mb-2 text-xl font-light tracking-wide text-[#1A1A1A]">
                  定位服务
                </h3>

                <p className="mb-6 text-sm font-light leading-relaxed text-[#5E5E5E]">
                  为了给您提供更精准的护肤建议，我们希望获取您的位置信息，以便分析当地的气候、紫外线强度等环境因素。
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleLocationAccept}
                    className="group relative w-full overflow-hidden rounded-full border border-[#3D4430] bg-[#3D4430] px-6 py-3 text-sm font-medium tracking-wider text-white transition-all duration-300 hover:bg-transparent hover:text-[#3D4430]"
                  >
                    <span className="relative">同意提供定位</span>
                  </button>

                  <button
                    onClick={handleLocationDecline}
                    className="w-full rounded-full border border-[#3D4430]/20 bg-transparent px-6 py-3 text-sm font-light tracking-wider text-[#3D4430]/60 transition-all duration-300 hover:border-[#3D4430]/40 hover:text-[#3D4430]/80"
                  >
                    暂不提供
                  </button>
                </div>

                <p className="mt-4 text-[10px] font-light leading-relaxed text-[#1A1A1A]/40">
                  您的位置信息仅用于本次分析，不会被存储或用于其他用途
                </p>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRegionSelectModal && (
          <m.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <m.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSkipRegionSelect}
            />

            <m.div
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-[#F8F6F0] shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={handleSkipRegionSelect}
                className="absolute right-3 top-3 rounded-full p-1.5 text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/5 hover:text-brand-charcoal/60"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="px-6 pb-6 pt-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3D4430]/10">
                  <MapPin className="h-7 w-7 text-[#3D4430]" />
                </div>

                <h3 className="mb-2 text-xl font-light tracking-wide text-[#1A1A1A]">
                  选择您的地区
                </h3>

                <p className="mb-4 text-sm font-light leading-relaxed text-[#5E5E5E]">
                  自动定位失败，请手动选择您所在的地区，以便我们为您提供更精准的气候相关护肤建议
                </p>

                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[#3D4430]/10 bg-white/50">
                  {regionOptions.map((group) => (
                    <div key={group.group} className="border-b border-[#3D4430]/5 last:border-b-0">
                      <div className="sticky top-0 bg-[#F0EDE1]/90 px-4 py-2 text-left text-xs font-medium tracking-wider text-[#3D4430]/50 backdrop-blur-sm">
                        {group.group}
                      </div>
                      <div className="flex flex-wrap gap-2 px-4 py-2">
                        {group.regions.map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionSelect(region)}
                            className="rounded-full border border-[#3D4430]/30 bg-white px-3 py-1.5 text-sm text-[#3D4430] transition-all hover:border-[#3D4430] hover:bg-[#3D4430]/10"
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSkipRegionSelect}
                  className="mt-4 w-full text-sm font-light text-[#3D4430]/50 transition-colors hover:text-[#3D4430]/70"
                >
                  跳过，使用简化分析
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
