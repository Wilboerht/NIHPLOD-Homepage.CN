
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
  const [isExpanded, setIsExpanded] = useState(false); // 默认收起以展示动画
  const [isLoading, setIsLoading] = useState(false);
  const [_imageError, _setImageError] = useState(false);

  // 定位权限相关状态
  const [showLocationModal, setShowLocationModal] = useState(false);


  const { setDrawerOpen } = useLayout();

  useEffect(() => {
    initSession();
    // 预加载问卷页面
    router.prefetch("/advisor/questions");
  }, [initSession, router]);

  // 组件加载后自动展开，实现"抽屉下拉"动画
  useEffect(() => {
    // 稍微延迟以展示"下拉"动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  // 地区选项（按气候类型分组）
  const regionOptions = [
    { group: "华北/东北", regions: ["北京", "天津", "河北", "山西", "内蒙古", "黑龙江", "吉林", "辽宁"] },
    { group: "华东", regions: ["上海", "江苏", "浙江", "山东", "安徽", "江西"] },
    { group: "华南", regions: ["广东", "广西", "海南", "福建", "台湾"] },
    { group: "华中/西南", regions: ["湖北", "湖南", "河南", "四川", "重庆", "贵州", "云南"] },
    { group: "西北", regions: ["陕西", "甘肃", "宁夏", "新疆"] },
    { group: "高原", regions: ["西藏", "青海"] },
  ];

  // 状态：显示手动选择地区模态框
  const [showRegionSelectModal, setShowRegionSelectModal] = useState(false);

  // 处理定位权限同意
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
        // 定位成功，保存状态并继续
        sessionStorage.setItem("locationConsent", "granted");
        setIsLoading(true);
        router.push("/advisor/questions");
      } catch {
        // 定位失败，显示手动选择地区模态框
        setShowRegionSelectModal(true);
      }
    } else {
      // 浏览器不支持，显示手动选择
      setShowRegionSelectModal(true);
    }
  }, [router]);

  // 处理手动选择地区
  const handleRegionSelect = useCallback((region: string) => {
    setShowRegionSelectModal(false);
    sessionStorage.setItem("locationConsent", "granted");
    sessionStorage.setItem("userRegion", region);
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);

  // 跳过手动选择
  const handleSkipRegionSelect = useCallback(() => {
    setShowRegionSelectModal(false);
    sessionStorage.setItem("locationConsent", "declined");
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);

  // 处理定位权限拒绝
  const handleLocationDecline = useCallback(() => {
    setShowLocationModal(false);
    sessionStorage.setItem("locationConsent", "declined");
    setIsLoading(true);
    router.push("/advisor/questions");
  }, [router]);


  const handleStart = () => {
    // 显示定位权限询问模态框
    setShowLocationModal(true);
  };

  return (
    <>
      {/* 自定义页面背景 - 覆盖全局背景 */}
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

      {/* 主内容容器 */}
      <m.div
        className="safe-area-content !top-0"
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
            {/* 主内容区域 */}
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
                // 展开时延迟0.3s等待导航栏收起；收起时不延迟
                delay: isExpanded ? 0.3 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />
              <div className={cn(
                "flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                !isExpanded && "hidden"
              )}>
                {/* 内容区域 - 垂直居中 */}
                <div className="flex flex-1 flex-col items-center justify-center">
                  {/* 皇冠图标 */}
                  <m.div
                    className="text-brand-gold/50"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.567 19.4336C19.0088 19.4337 19.3668 19.7926 19.3668 20.2344C19.3666 20.6759 19.0086 21.0341 18.567 21.0342H5.43323C4.99163 21.0341 4.6327 20.6759 4.63245 20.2344C4.63245 19.7926 4.99147 19.4337 5.43323 19.4336H18.567ZM11.9996 2.97266C12.2929 2.97266 12.5628 3.13298 12.7028 3.39062L15.6891 8.89258L20.4567 6.9707C20.7347 6.8586 21.0521 6.91146 21.2789 7.10742C21.5058 7.3035 21.6036 7.60999 21.5328 7.90137L19.3444 16.9199C19.2573 17.2786 18.9361 17.5312 18.567 17.5312H5.43323C5.06415 17.5312 4.74196 17.2786 4.65491 16.9199L2.46643 7.90137C2.39575 7.6101 2.49367 7.3035 2.72034 7.10742C2.94705 6.91145 3.26463 6.85881 3.5426 6.9707L8.3092 8.89258L11.2965 3.39062L11.3551 3.29883C11.5044 3.09548 11.7431 2.97277 11.9996 2.97266ZM11.9996 11.6572C11.0326 11.6573 10.2488 12.4412 10.2487 13.4082C10.2487 14.3753 11.0326 15.1591 11.9996 15.1592C12.9668 15.1592 13.7506 14.3754 13.7506 13.4082C13.7505 12.4412 12.9667 11.6572 11.9996 11.6572Z" fill="currentColor" />
                    </svg>
                  </m.div>

                  {/* 装饰线条 */}
                  <m.div
                    className="mb-6 mt-4 h-px w-12 bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent sm:mb-8 sm:w-16"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                  />

                  {/* 英文标题 */}
                  <m.p
                    className="text-[11px] font-light uppercase tracking-[0.35em] text-brand-gold/80 sm:text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  >
                    Personalized Skin Analysis
                  </m.p>

                  {/* 中文主标题 */}
                  <m.h1
                    className="mt-4 text-center font-serif text-4xl font-light tracking-wide text-brand-charcoal sm:mt-5 sm:text-5xl md:text-6xl lg:text-7xl"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                  >
                    臻享定制
                  </m.h1>

                  {/* 分隔装饰 */}
                  <m.div
                    className="my-6 flex items-center gap-3 sm:my-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                  >
                    <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand-gold/40" />
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-gold/60" />
                    <span className="h-px w-10 bg-gradient-to-l from-transparent to-brand-gold/40" />
                  </m.div>

                  {/* 副标题 */}
                  <m.p
                    className="max-w-sm text-center text-sm font-light leading-relaxed tracking-wide text-brand-charcoal/60 sm:max-w-md sm:text-base"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.7 }}
                  >
                    几个简单问题
                    <br className="sm:hidden" />
                    <span className="hidden sm:inline">，</span>
                    开启您的专属护肤之旅
                  </m.p>

                  {/* 开始按钮 */}
                  <m.button
                    onClick={handleStart}
                    disabled={isLoading}
                    className="group relative mt-10 overflow-hidden rounded-full border-2 border-brand-gold/60 bg-gradient-to-r from-brand-gold/10 via-brand-champagne/20 to-brand-gold/10 px-14 py-4 text-sm font-medium tracking-[0.2em] text-brand-charcoal shadow-luxury backdrop-blur-sm transition-all duration-300 hover:border-brand-gold hover:shadow-luxury-lg sm:mt-12 sm:px-16 sm:py-4.5 sm:text-base disabled:opacity-70 disabled:cursor-not-allowed"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.9 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {/* 光泽效果 */}
                    {!isLoading && (
                      <span className="absolute inset-0 -translate-x-full bg-shimmer transition-transform duration-700 group-hover:translate-x-full" />
                    )}
                    <span className="relative flex items-center gap-2">
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isLoading ? "加载中..." : "开启体验"}
                    </span>
                  </m.button>

                  {/* 时间提示 */}
                  <m.p
                    className="mt-5 text-[11px] font-light tracking-wider text-brand-charcoal/40 sm:mt-6 sm:text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.1 }}
                  >
                    约 2 分钟 · 专属定制
                  </m.p>

                  {/* 隐私说明 */}
                  <m.p
                    className="mt-4 max-w-xs text-center text-[10px] font-light leading-relaxed tracking-wide text-brand-charcoal/35 sm:max-w-sm sm:text-[11px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.2 }}
                  >
                    您的面部图像仅用于即时分析，我们承诺不会存储或保留任何影像数据
                  </m.p>

                  {/* Logo */}
                  <m.div
                    className="mt-8 sm:mt-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.3 }}
                  >
                    <Image
                      src="/images/logo.png"
                      alt="NIHPLOD"
                      width={120}
                      height={40}
                      className="h-8 w-auto opacity-40 sm:h-10"
                    />
                  </m.div>
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 - 始终显示，紧贴内容区域 */}
            <button
              type="button"
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
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div >
      </m.div >

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}

      {/* 定位权限询问模态框 */}
      <AnimatePresence>
        {showLocationModal && (
          <m.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 背景遮罩 */}
            <m.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLocationModal(false)}
            />

            {/* 模态框内容 */}
            <m.div
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-[#F8F6F0] shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* 关闭按钮 */}
              <button
                onClick={() => setShowLocationModal(false)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/5 hover:text-brand-charcoal/60"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 内容区域 */}
              <div className="px-6 pb-6 pt-8 text-center">
                {/* 图标 */}
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold/10">
                  <MapPin className="h-7 w-7 text-brand-gold" />
                </div>

                {/* 标题 */}
                <h3 className="mb-2 font-serif text-xl font-light tracking-wide text-brand-charcoal">
                  定位服务
                </h3>

                {/* 描述 */}
                <p className="mb-6 text-sm font-light leading-relaxed text-brand-charcoal/60">
                  为了给您提供更精准的护肤建议，我们希望获取您的位置信息，以便分析当地的气候、紫外线强度等环境因素。
                </p>

                {/* 按钮组 */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleLocationAccept}
                    className="group relative w-full overflow-hidden rounded-full border-2 border-brand-gold/60 bg-gradient-to-r from-brand-gold/20 via-brand-champagne/30 to-brand-gold/20 px-6 py-3 text-sm font-medium tracking-wider text-brand-charcoal transition-all duration-300 hover:border-brand-gold hover:shadow-lg"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-shimmer transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative">同意提供定位</span>
                  </button>

                  <button
                    onClick={handleLocationDecline}
                    className="w-full rounded-full border border-brand-charcoal/20 bg-transparent px-6 py-3 text-sm font-light tracking-wider text-brand-charcoal/60 transition-all duration-300 hover:border-brand-charcoal/40 hover:text-brand-charcoal/80"
                  >
                    暂不提供
                  </button>
                </div>

                {/* 隐私说明 */}
                <p className="mt-4 text-[10px] font-light leading-relaxed text-brand-charcoal/40">
                  您的位置信息仅用于本次分析，不会被存储或用于其他用途
                </p>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 手动选择地区模态框 - 定位失败时显示 */}
      <AnimatePresence>
        {showRegionSelectModal && (
          <m.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 背景遮罩 */}
            <m.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSkipRegionSelect}
            />

            {/* 模态框内容 */}
            <m.div
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-[#F8F6F0] shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* 关闭按钮 */}
              <button
                onClick={handleSkipRegionSelect}
                className="absolute right-3 top-3 rounded-full p-1.5 text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/5 hover:text-brand-charcoal/60"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 内容区域 */}
              <div className="px-6 pb-6 pt-8 text-center">
                {/* 图标 */}
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold/10">
                  <MapPin className="h-7 w-7 text-brand-gold" />
                </div>

                {/* 标题 */}
                <h3 className="mb-2 font-serif text-xl font-light tracking-wide text-brand-charcoal">
                  选择您的地区
                </h3>

                {/* 描述 */}
                <p className="mb-4 text-sm font-light leading-relaxed text-brand-charcoal/60">
                  自动定位失败，请手动选择您所在的地区，以便我们为您提供更精准的气候相关护肤建议
                </p>

                {/* 地区选择列表 */}
                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-brand-charcoal/10 bg-white/50">
                  {regionOptions.map((group) => (
                    <div key={group.group} className="border-b border-brand-charcoal/5 last:border-b-0">
                      <div className="sticky top-0 bg-brand-cream/90 px-4 py-2 text-left text-xs font-medium tracking-wider text-brand-charcoal/50 backdrop-blur-sm">
                        {group.group}
                      </div>
                      <div className="flex flex-wrap gap-2 px-4 py-2">
                        {group.regions.map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionSelect(region)}
                            className="rounded-full border border-brand-gold/30 bg-white px-3 py-1.5 text-sm text-brand-charcoal transition-all hover:border-brand-gold hover:bg-brand-gold/10"
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 跳过按钮 */}
                <button
                  onClick={handleSkipRegionSelect}
                  className="mt-4 w-full text-sm font-light text-brand-charcoal/50 transition-colors hover:text-brand-charcoal/70"
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

