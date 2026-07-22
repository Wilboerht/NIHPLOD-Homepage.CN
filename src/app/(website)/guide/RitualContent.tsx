"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";
import { ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { getCategoryIconPath } from "@/lib/product-icons";
import {
  defaultModuleData,
  defaultRelatedProducts,
  getProfessionalCards,
  hotelLogoNumbers,
  modules,
  type ModuleId,
  type RitualProductRef,
  type Scheme,
  type SubPlan,
} from "./guide-data";

// 查找匹配的图标，否则使用默认图标
export const DEFAULT_ICONS = [
  // 默认瓶子1
  <svg
    key="d1"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <path d="M9 3h6v3H9V3z" />
    <path d="M8 6h8v2l2 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8l2-2V6z" />
  </svg>,
  // 默认瓶子2
  <svg
    key="d2"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <rect x="7" y="8" width="10" height="12" rx="2" />
    <path d="M9 4h6v4H9z" />
  </svg>,
  // 默认瓶子3
  <svg
    key="d3"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <path d="M10 4h4v2h-4z" />
    <path d="M8 6h8c1 0 2 1 2 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8c0-1 1-2 2-2z" />
    <ellipse cx="12" cy="13" rx="3" ry="4" />
  </svg>,
];

/**
 * 护肤仪式页面内容组件
 * 三层级交互式布局：Level 1 模块选择 -> Level 2 方案选择 -> Level 3 详细步骤
 */
  // 添加 products 到 props
interface RitualContentProps {
  products?: ProductData[];
}

export function RitualContent({ products = [] }: RitualContentProps) {
  // 层级导航状态由 URL searchParams 驱动，刷新/分享链接/浏览器后退均可恢复
  // /guide -> Level 1；?module=xx -> Level 2；?module=xx&scheme=xx -> Level 3；&sub=xx -> 子方案 Tab
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module");
  const schemeParam = searchParams.get("scheme");
  const subParam = searchParams.get("sub");

  // 选中的模块（非法参数按未选中处理）
  const selectedModule: ModuleId | null =
    moduleParam && moduleParam in defaultModuleData ? (moduleParam as ModuleId) : null;
  // 选中的方案
  const selectedScheme: Scheme | null = selectedModule
    ? (defaultModuleData[selectedModule].find((s) => s.id === schemeParam) ?? null)
    : null;
  // 选中的子方案（Tab），未指定时默认第一个
  const selectedSubPlan: SubPlan | null =
    selectedScheme?.subPlans?.find((sp) => sp.id === subParam) ??
    selectedScheme?.subPlans?.[0] ??
    null;
  // 当前层级: 1=模块选择, 2=方案选择, 3=步骤详情
  const currentLevel = !selectedModule ? 1 : !selectedScheme ? 2 : 3;
  // 悬停的模块索引
  const { isDrawerOpen } = useLayout();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 轮播导航状态（桌面端步骤分页）
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // 获取当前应该显示的步骤（优先使用子方案的步骤）
  const currentSteps = selectedSubPlan?.steps || selectedScheme?.steps || [];
  // 获取当前应该显示的产品（优先使用子方案的产品）
  const currentProducts: RitualProductRef[] =
    selectedSubPlan?.products || selectedScheme?.products || defaultRelatedProducts;

  // 产品详情弹窗状态
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  // 查找产品逻辑
  const findProduct = (searchTerm: string) => {
    if (!products || products.length === 0) {
      console.warn("Product list is empty.");
      return null;
    }

    // 移除空白字符并转为小写
    const term = searchTerm.trim().toLowerCase();

    // 尝试在 products 中查找匹配项
    return products.find((p) => {
      const nameMatch = p.name.toLowerCase().includes(term);
      const enNameMatch = p.nameEn?.toLowerCase().includes(term);
      const categoryMatch = p.category?.name.toLowerCase().includes(term);
      return nameMatch || enNameMatch || categoryMatch;
    });
  };

  const router = useRouter();

  // 打开产品详情弹窗
  const handleProductClick = (productName: string) => {
    const product = findProduct(productName);
    if (product) {
      // 移动端直接跳转到产品详情页，不使用抽屉
      if (typeof window !== "undefined" && window.innerWidth <= 768) {
        router.push(`/products/${product.slug}`);
        return;
      }
      setSelectedProduct(product);
      setProductDrawerOpen(true);
    } else {
      console.warn(`Product not found for: ${productName}`);
      // 如果没有找到具体产品，尝试打开一个默认的分层或提示，
      // 这里我们可以暂时设为第一个产品作为兜底（仅限开发环境调试，正式环境建议提示“暂无详情”）
      if (products && products.length > 0) {
        setSelectedProduct(products[0]);
        setProductDrawerOpen(true);
      }
    }
  };

  // 关闭产品详情弹窗
  const handleCloseProductDrawer = () => {
    setProductDrawerOpen(false);
  };

  // 使用默认数据
  const moduleData = defaultModuleData;

  // 选择模块：单品好物 (portable)、专业水疗 (professional)、居家仪式 (spa) 直接进入 Level 3 首个方案
  const selectModule = (moduleId: ModuleId) => {
    const schemes = moduleData[moduleId];
    if (
      (moduleId === "portable" || moduleId === "professional" || moduleId === "spa") &&
      schemes &&
      schemes.length > 0
    ) {
      router.push(`/guide?module=${moduleId}&scheme=${schemes[0].id}`, { scroll: false });
    } else {
      router.push(`/guide?module=${moduleId}`, { scroll: false });
    }
  };

  // 选择方案（情景）
  const selectScheme = (scheme: Scheme) => {
    if (!selectedModule) return;
    setCurrentStepIndex(0); // 重置轮播索引
    router.push(`/guide?module=${selectedModule}&scheme=${scheme.id}`, { scroll: false });
  };

  // 选择子方案（Tab）：用 replace，避免 Tab 切换堆叠浏览器历史
  const selectSubPlan = (subPlan: SubPlan) => {
    if (!selectedModule || !selectedScheme) return;
    setCurrentStepIndex(0);
    router.replace(
      `/guide?module=${selectedModule}&scheme=${selectedScheme.id}&sub=${subPlan.id}`,
      { scroll: false }
    );
  };

  // 返回上一级（与浏览器后退行为一致）
  const goBack = () => {
    router.back();
  };

  // 返回 Level 1 模块选择
  const goHome = () => {
    router.push("/guide", { scroll: false });
  };

  return (
    <>
      <DrawerPageContainer wrapperClassName="!top-0 !pointer-events-none">
        {/* 矿物纹理覆盖层 */}
        <div className="texture-overlay absolute inset-0" />

        {/* 动态背景图片 */}

        <div
          className={cn(
            "flex h-full flex-col overflow-hidden transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* 页面主标题（视觉隐藏，三级视图共用，保证全页面唯一 h1） */}
          <h1 className="sr-only">护肤仪式指南</h1>

          {/* ========== 移动端布局 - 参考 Ritual 移动端.html ========== */}
          <div className="flex h-full flex-col bg-brand-cream sm:hidden">
            {/* 移动端 Header - 完全按照 FAQ 顶部栏样式 */}
            <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm transition-all">
              <AnimatePresence>
                {currentLevel > 1 && (
                  <m.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    type="button"
                    onClick={goBack}
                    aria-label="返回上一级"
                    className="absolute left-6 flex h-full items-center text-brand-charcoal/60 active:text-brand-charcoal"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </m.button>
                )}
              </AnimatePresence>
              <Link href="/" className="mt-1 flex items-center justify-center">
                <div className="relative h-[28px] w-[100px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>
              {/* Texture Overlay for Header to match body */}
              <div className="texture-overlay absolute inset-0 z-[-1]" />
            </div>

            {/* 移动端内容区域 - 隐藏滚动条并移除多余 padding */}
            <div
              className={cn(
                "relative z-10 flex-1 overflow-y-auto px-7 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                currentLevel === 1 && "flex flex-col"
              )}
            >
              <AnimatePresence mode="wait">
                {/* Level 1: 模块选择 - 2x2 精致网格 */}
                {currentLevel === 1 && (
                  <m.div
                    key="mobile-l1"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-1 flex-col justify-start"
                  >
                    <div className="mb-7 flex flex-col items-center pb-2 pt-2">
                      <h2 className="font-sans text-[24px] font-light tracking-[0.15em] text-brand-charcoal">
                        护肤仪式指南
                      </h2>
                      <div className="mt-2 h-px w-10 rounded-full bg-brand-charcoal-light/20" />
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-4">
                      {modules.map((module, index) => (
                        <m.button
                          key={module.id}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-20px" }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => selectModule(module.id)}
                          className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-[#FCF9F2] p-5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02),0_6px_20px_-4px_rgba(0,38,62,0.04)] transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-charcoal/30 active:scale-[0.97]"
                        >
                          <div className="relative z-10 flex flex-col">
                            <module.icon className="h-8 w-8 text-[#B8A47B] mb-4" strokeWidth={1} />
                            <span className="text-lg font-light tracking-[0.12em] text-brand-charcoal">
                              {module.label}
                            </span>
                            <p className="mt-1.5 text-[11px] font-light leading-relaxed text-brand-charcoal/50">
                              {module.description}
                            </p>
                            <div className="mt-3 h-[1px] w-8 bg-brand-beige/50" />
                          </div>
                          <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-brand-charcoal/20" />
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}

                {/* Level 2: 方案选择 - 紧凑型精选列表 */}
                {currentLevel === 2 && selectedModule && (
                  <m.div
                    key="mobile-l2"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex h-full flex-col overflow-hidden py-2"
                  >
                    <div className="flex flex-1 flex-col justify-center">
                      {/* 模块引导文案 */}
                      <div className="mb-6 px-4 text-center">
                        <p className="text-sm font-light leading-relaxed tracking-[0.05em] text-[#4A6272]/80">
                          {modules.find((m) => m.id === selectedModule)?.description}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        {moduleData[selectedModule].map((scheme, idx) => (
                          <m.button
                            key={scheme.id}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-10px" }}
                            transition={{ duration: 0.4, delay: idx * 0.08, ease: "easeOut" }}
                            onClick={() => selectScheme(scheme)}
                            className="group relative flex items-center overflow-hidden rounded-2xl border border-[#00263E]/5 bg-white px-5 py-5 shadow-[0_4px_20px_-4px_rgba(0,38,62,0.03)] transition-all duration-300 active:scale-[0.98]"
                          >
                            {/* 左侧装饰线 */}
                            <div className="mr-4 h-10 w-[3px] shrink-0 rounded-full bg-[#4A6272]/20 transition-colors group-active:bg-[#4A6272]/40" />

                            {/* 中间内容：标题 + 时长 */}
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                              <h3 className="truncate text-lg font-medium tracking-[0.1em] text-[#00263E]">
                                {scheme.name}
                              </h3>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-[#4A6272]/50" />
                                <span className="text-[11px] font-medium tracking-wide text-[#4A6272]/70">
                                  {scheme.totalDuration || "15分钟"}
                                </span>
                              </div>
                            </div>

                            {/* 右侧箭头 */}
                            <ChevronRight className="ml-3 h-5 w-5 shrink-0 text-[#4A6272]/30 transition-colors group-active:text-[#4A6272]" />
                          </m.button>
                        ))}
                      </div>

                      {/* AI 护肤顾问引导 */}
                      <div className="mt-6 text-center">
                        <a
                          href="https://advisor.nihplod.cn"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-1.5 text-sm font-light leading-relaxed tracking-[0.05em] text-[#4A6272] transition-colors hover:text-[#00263E]"
                        >
                          肌智派素颜测肤
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </a>
                      </div>
                    </div>

                    {/* 底部微调留白，确保不贴底 */}
                    <div className="h-6 shrink-0" />
                  </m.div>
                )}

                {/* Level 3: 步骤详情 - 垂直精修指南 */}
                {currentLevel === 3 && selectedScheme && (
                  <m.div
                    key="mobile-l3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex flex-col py-2"
                  >
                    {/* Level 3: Mobile Scheme Switcher Tabs (Only for Professional/Spa/Portable) */}
                    {((selectedScheme.subPlans && selectedScheme.subPlans.length > 1) ||
                      (selectedModule &&
                        ["portable", "professional", "spa"].includes(selectedModule) &&
                        moduleData[selectedModule].length > 1)) && (
                      <div className="relative mb-10 flex w-full max-w-[400px] flex-col items-center px-6">
                        <div
                          className="flex w-full items-center rounded-full bg-[#00263E]/[0.05] p-1"
                          role="tablist"
                          aria-label="方案切换"
                        >
                          <LayoutGroup id={`mobile-tab-${selectedModule}`}>
                            {/* 1. subPlans existing condition (such as daily) */}
                            {selectedScheme.subPlans && selectedScheme.subPlans.length > 0
                              ? selectedScheme.subPlans.map((subPlan) => {
                                  const isActive = selectedSubPlan?.id === subPlan.id;
                                  return (
                                    <button
                                      key={subPlan.id}
                                      type="button"
                                      role="tab"
                                      aria-selected={isActive}
                                      onClick={() => selectSubPlan(subPlan)}
                                      className={cn(
                                        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full py-2.5 transition-colors duration-300",
                                        isActive
                                          ? " text-[#00263E]"
                                          : "text-[#00263E]/40 hover:text-[#00263E]/65"
                                      )}
                                    >
                                      <span className="relative z-10 whitespace-nowrap text-[13px] font-light tracking-[0.12em]">
                                        {subPlan.name}
                                      </span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`active-mobile-tab-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                          }}
                                        />
                                      )}
                                    </button>
                                  );
                                })
                              : /* 2. Scheme level switching (for portable, professional, spa in level 3) */
                                selectedModule &&
                                ["portable", "professional", "spa"].includes(selectedModule) &&
                                moduleData[selectedModule].map((scheme) => {
                                  const isActive = scheme.id === selectedScheme.id;
                                  return (
                                    <button
                                      key={scheme.id}
                                      type="button"
                                      role="tab"
                                      aria-selected={isActive}
                                      onClick={() => selectScheme(scheme)}
                                      className={cn(
                                        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full py-2.5 transition-colors duration-300",
                                        isActive
                                          ? " text-[#00263E]"
                                          : "text-[#00263E]/40 hover:text-[#00263E]/65"
                                      )}
                                    >
                                      <span className="relative z-10 whitespace-nowrap text-[13px] font-light tracking-[0.12em]">
                                        {scheme.name}
                                      </span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`active-mobile-tab-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                          }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                          </LayoutGroup>
                        </div>
                      </div>
                    )}
                    {/* 顶部概览信息 (隐藏于 portable) */}
                    {selectedModule !== "portable" ? (
                      <div className="mb-10 flex flex-col items-center">
                        <div className="mb-6 text-center">
<h2 className="text-3xl font-light tracking-[0.15em] text-[#00263E]">
                            {selectedScheme.name}
                          </h2>

                          {/* 相关产品 - 横向滑动卡片 (Moved here) */}
                          <div className="mb-2 mt-6 w-full">
                            <div className="mb-4 flex items-center justify-center gap-3">
                              <div className="h-px w-8 bg-[#00263E]/10" />
                              <span className="text-[10px] uppercase tracking-[0.2em] text-[#00263E]/40">
                                相关产品
                              </span>
                              <div className="h-px w-8 bg-[#00263E]/10" />
                            </div>
                            <div className="w-full px-6 text-center">
                              <div className="flex flex-wrap justify-center gap-x-8 gap-y-6 pb-4">
                                {currentProducts.map((product, index) => {
                                  const cleanName = product.name;
                                  const isOptional = !!product.optional;

                                  return (
                                    <button
                                      key={cleanName}
                                      type="button"
                                      onClick={() => handleProductClick(cleanName)}
                                      className="flex flex-col items-center gap-2"
                                    >
                                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#00263E]/5 bg-white shadow-[0_2px_8px_-2px_rgba(0,38,62,0.06)] transition-transform active:scale-95">
                                        <div className="flex h-10 w-10 items-center justify-center">
                                          {getCategoryIconPath(cleanName) ? (
                                            <Image
                                              src={getCategoryIconPath(cleanName)!}
                                              alt={cleanName}
                                              width={40}
                                              height={40}
                                              className="h-10 w-10"
                                            />
                                          ) : (
                                            DEFAULT_ICONS[index % DEFAULT_ICONS.length]
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <span className="whitespace-nowrap text-[11px] font-medium tracking-widest text-[#00263E]/70">
                                          {cleanName}
                                        </span>
                                        {isOptional && (
                                          <span className="text-[10px] tracking-wider text-[#00263E]/60">
                                            可选
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="mt-8 flex items-center justify-center gap-6">
                            <div className="flex flex-col items-center">
                              <span className="mb-1 text-[10px] uppercase tracking-widest text-[#4A6272]/60">
                                预计时长
                              </span>
                              <span className="text-[14px] font-light text-[#00263E]">
                                {selectedScheme.totalDuration?.replace("min", "分钟") ||
                                  "15-20 分钟"}
                              </span>
                            </div>
                            <div className="h-6 w-px bg-[#00263E]/5" />
                            <div className="flex flex-col items-center">
                              <span className="mb-1 text-[10px] uppercase tracking-widest text-[#4A6272]/60">
                                护理阶段
                              </span>
                              <span className="text-[14px] font-light text-[#00263E]">
                                {currentSteps.length} 个核心步骤
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <h2 className="text-3xl font-light tracking-[0.15em] text-[#00263E]">
                          {selectedScheme.name}
                        </h2>
                        <span className="mt-2 inline-block font-serif text-[10px] uppercase tracking-[0.2em] text-[#4A6272]">
                          {selectedScheme.nameEn}
                        </span>
                      </div>
                    )}

                    {/* Content Rendering based on Module */}
                    {selectedModule === "portable" ? (
                      // Portable Module Layout
                      <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col duration-500">
                        {/* Hero Image */}
                        <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-sm">
                          <Image
                            src={selectedScheme.heroImage || "/images/portable-hero-update.webp"}
                            alt={selectedScheme.name}
                            fill
                            sizes="100vw"
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#00263E]/80 via-transparent to-transparent opacity-80" />
                          <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              {selectedScheme.benefits?.slice(0, 3).map((benefit, i) => (
                                <span
                                  key={i}
                                  className="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] font-light tracking-widest text-white backdrop-blur-md"
                                >
                                  {benefit}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Description Content */}
                        <div className="px-2">
                          <p className="relative mb-8 text-sm font-light leading-[1.8] text-[#00263E]/80">
                            <span className="absolute -left-3 -top-2 font-serif text-3xl text-[#4A6272]/20">
                              "
                            </span>
                            {selectedScheme.desc}
                            <span className="absolute -right-1 bottom-0 translate-y-1 font-serif text-3xl text-[#4A6272]/20">
                              "
                            </span>
                          </p>

                          {/* Products Meta */}
                          <div className="flex flex-col gap-3 border-t border-[#00263E]/10 py-4">
                            <span className="text-[10px] font-medium uppercase tracking-widest text-[#4A6272]/80">
                              核心单品搭配
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {selectedScheme.products?.map((prod) => (
                                <div
                                  key={prod.name}
                                  className="flex items-center gap-1.5 rounded-md border border-[#00263E]/5 bg-white px-3 py-1.5 shadow-sm"
                                >
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#4A6272]/40" />
                                  <span className="text-xs text-[#00263E]/90">{prod.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : selectedModule === "professional" ? (
                      <div className="animate-in fade-in flex w-full flex-col pb-6 duration-500">
                        <div className="mb-2 flex items-center gap-3 px-1">
                          <h3 className="text-[26px] font-normal tracking-wide text-[#00263E]">
                            {selectedScheme?.id === "p1" ? "面部方案" : "全身方案"}
                          </h3>
                          <span className="rounded-sm bg-[#E6DCC3] px-1.5 py-0.5 text-[10px] font-medium text-[#00263E]">
                            招牌
                          </span>
                        </div>
                        <div className="mb-8 flex flex-col px-1">
                          <p className="mb-3 font-sans text-xs font-light tracking-[0.1em] text-[#00263E]/60">
                            {selectedScheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
                          </p>
                        </div>

                        {/* 中间卡片区 - 纵向列表 */}
                        <div className="mb-12 flex flex-col gap-6">
                          {getProfessionalCards(selectedScheme?.id).map((item) => (
                            <div
                              key={item.image}
                              className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#00263E]/5 shadow-sm"
                            >
                              <Image
                                src={item.image}
                                alt={item.title}
                                fill
                                sizes="100vw"
                                className="z-0 object-cover"
                              />
                              {/* 渐变遮罩 */}
                              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                              {/* 文字内容 */}
                              <div className="pointer-events-none absolute bottom-0 left-0 z-20 flex w-full flex-col gap-3 p-5">
                                <div className="flex items-baseline gap-2 text-white">
                                  <h4 className="text-[22px] font-normal tracking-wide text-white drop-shadow-sm">
                                    {item.title}
                                  </h4>
                                  <span className="mx-0.5 text-sm font-light text-white/80">/</span>
                                  <span className="font-sans text-[16px] font-light tracking-wide text-white/90 drop-shadow-sm">
                                    {item.duration}
                                  </span>
                                </div>
                                <div>
                                  <span className="inline-block rounded-full border border-white/60 bg-white/10 px-3 py-1.5 text-[11px] font-light tracking-wider text-white/90 shadow-sm backdrop-blur-md">
                                    {item.tags}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 底部 Logo 栏 - 无限滚动 */}
                        <HotelLogoMarquee variant="mobile" />
                      </div>
                    ) : (
                      /* Regular Steps Waterfall Layout (daily, spa) */
                      <div className="space-y-10 sm:space-y-12">
                        {currentSteps.map((step, index) => (
                          <div key={index} className="group relative flex flex-col">
                            {/* 图片展示区 + 胶囊定位容器 */}
                             <div className="relative mb-5 sm:mb-7">
                              {/* 步骤胶囊 */}
                              <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-[#00263E]/20 bg-[#FBF8F0] px-4 py-1 text-xs font-medium tracking-widest text-[#00263E] shadow-sm">
                                步骤 {String(index + 1).padStart(2, "0")}
                              </div>
                              {/* 图片展示区 - 极简白背景 */}
                              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-[0_4px_25px_-5px_rgba(0,38,62,0.04)] transition-transform duration-500 group-active:scale-[0.99] sm:aspect-square sm:rounded-[2rem]">
                                <Image
                                  src={step.imageUrl || "/images/ritual-step-placeholder.webp"}
                                  alt={step.title}
                                  fill
                                  sizes="100vw"
                                  className="object-contain p-4 mix-blend-multiply sm:p-8"
                                />
                              </div>
                            </div>

                            {/* 文本描述区 */}
                            <div className="px-1 sm:px-3">
                              <h3 className="mb-3 text-center text-lg font-light tracking-[0.12em] text-[#00263E] sm:text-xl">
                                {step.title}
                              </h3>
                              <p className="text-left text-[13px] font-light leading-[1.8] text-[#00263E]/60 sm:text-[14px]">
                                {step.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 底部仪式感收尾 & 认证 */}
                    <div className="mt-4 flex flex-col items-center pb-10 text-center sm:mt-12">
                      <div className="mb-5 h-px w-12 bg-[#4A6272]/20 sm:mb-10" />
                      {selectedModule !== "portable" && (
                        <div className="mb-4 flex flex-col items-center gap-7 sm:gap-14">
                          {/* 核心优势 */}
                          <div className="flex w-full flex-col items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00263E]/40">
                              核心优势
                            </span>
                            <div className="flex w-full flex-wrap justify-center gap-2 px-4">
                              {(
                                selectedSubPlan?.benefits ||
                                selectedScheme.benefits || ["保湿锁水", "屏障增强"]
                              ).map((tag) => (
                                <div
                                  key={tag}
                                  className="flex items-center gap-1.5 rounded-full border border-[#4A6272]/10 bg-[#4A6272]/5 px-3 py-1"
                                >
                                  <span className="text-[10px] text-[#4A6272]/60">✦</span>
                                  <span className="text-[11px] font-light tracking-widest text-[#00263E]/70">
                                    {tag}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {(() => {
                            const supportText =
                              selectedSubPlan?.specialSupport !== undefined
                                ? selectedSubPlan.specialSupport
                                : (selectedScheme.specialSupport ?? "孕期、月子期、轻医美术后");
                            if (!supportText) return null;
                            const isRestricted = supportText.includes("不支持");
                            return (
                              <div className="flex w-full flex-col items-center gap-3 px-6">
<span className="text-[10px] uppercase tracking-[0.2em] text-[#00263E]/40">
                                  特殊时期支持
                                </span>
                                <div
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
                                    isRestricted
                                      ? "border-orange-900/10 bg-orange-50/30"
                                      : "border-[#4A6272]/10 bg-[#4A6272]/[0.03]"
                                  )}
                                >
                                  <Info
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      isRestricted ? "text-orange-900/40" : "text-[#4A6272]/40"
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-[11px] font-light tracking-widest",
                                      isRestricted ? "text-orange-900/70" : "text-[#00263E]/60"
                                    )}
                                  >
                                    {supportText}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Certifications (Quality Endorsement) */}
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00263E]/40">
                              检测认证
                            </span>
                            <div className="flex items-center gap-6 opacity-60 mix-blend-multiply">
                              <Image
                                src="/images/sgs.svg"
                                alt="SGS"
                                width={18}
                                height={18}
                                className="h-[18px] w-auto"
                              />
                              <Image
                                src="/images/intertek-logo.svg"
                                alt="Intertek"
                                width={18}
                                height={18}
                                className="h-[16px] w-auto"
                              />
                            </div>
                          </div>

                          {/* 专业门店入驻提醒 - 特殊移动端位置 */}
                          {selectedModule === "professional" && (
                            <div className="mt-2 flex items-start rounded-xl border border-[#4A6272]/10 bg-[#4A6272]/5 p-4 text-left">
                              <Info className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[#4A6272]/60" />
                              <p className="text-[12px] font-light leading-[1.6] tracking-wide text-[#00263E]/70">
                                找不到您所在城市的门店？银卡级别以上会员可
                                <Link
                                  href="/contact?type=cooperation"
                                  className="mx-1 font-medium text-[#4A6272] underline decoration-[#4A6272]/40 underline-offset-2 active:opacity-70"
                                >
                                  申请入驻
                                </Link>
                                您所在的城市。
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={goHome}
                        className={cn(
                          "mt-6 w-full max-w-[280px] rounded-full py-3.5 text-[13px] font-medium tracking-[0.2em] transition-all duration-300 sm:mt-8 sm:py-4",
                          "border border-[#4A6272]/30 bg-brand-primary/15 text-[#4A6272] shadow-[0_4px_15px_-3px_rgba(0,38,62,0.1)] backdrop-blur-[4px]",
                          "active:scale-[0.97] active:bg-brand-primary/25"
                        )}
                      >
                        <div className="-ml-1 flex items-center justify-center gap-1.5">
                          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                          <span>返回</span>
                        </div>
                      </button>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* 移动端版权信息 - 紧凑型固定底栏 */}
            <footer className="relative z-20 flex shrink-0 flex-col items-center py-4">
              <p className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </footer>
          </div>

          {/* ========== 桌面端布局 - 保持原有样式 ========== */}
          <div className="hidden h-full flex-col sm:flex">
            {/* 顶部栏：LOGO + 面包屑/用户按钮 */}
            <div className="flex h-[88px] flex-shrink-0 items-center border-b border-brand-charcoal/[0.05] px-10 xl:px-[8%]">
              {/* 左侧：LOGO */}
              <button
                type="button"
                onClick={goHome}
                aria-label="返回护肤指南首页"
                className="block shrink-0 opacity-90 transition-opacity hover:opacity-70"
              >
                <div className="relative h-9 w-[150px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain object-left"
                    priority
                  />
                </div>
              </button>

              {/* 右侧 */}
              <div className="ml-auto flex items-center">
                <AnimatePresence mode="wait">
                  {currentLevel === 1 ? (
                    <m.div
                      key="advisor-link"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <a
                        href="https://advisor.nihplod.cn"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1.5 text-sm font-light tracking-wide text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
                      >
                        肌智派素颜测肤
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                      </a>
                    </m.div>
                  ) : currentLevel >= 2 ? (
                    <m.button
                      key="back-btn"
                      type="button"
                      onClick={goBack}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center gap-1 text-[13px] font-light tracking-[0.1em] text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
                    >
                      <span>返回</span>
                      <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                    </m.button>
                  ) : null}
                </AnimatePresence>
              </div>
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
                    className="absolute inset-0 flex items-center justify-center overflow-visible px-10 xl:px-[8%]"
                  >
                    <div className="flex h-full w-full flex-col justify-center py-8">
                      {/* 页面标题区 - 与移动端 Level 1 保持一致 */}
                      <div className="mb-6 flex shrink-0 flex-col items-center text-center">
                        <h2 className="font-sans text-3xl font-light tracking-[0.15em] text-brand-charcoal">
                          护肤仪式指南
                        </h2>
                        <div className="mt-6 h-px w-10 rounded-full bg-brand-charcoal-light/20" />
                      </div>

                      <div className="flex max-h-[520px] w-full flex-1 flex-row gap-8">
                        {modules.map((module, index) => (
                          <m.button
                            key={module.id}
                            type="button"
                            onClick={() => selectModule(module.id)}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="group relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-[#FCF9F2] shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_16px_-2px_rgba(0,38,62,0.04)] transition-all duration-700 ease-out hover:-translate-y-[2px] hover:border-brand-beige/70 hover:shadow-[0_2px_0_rgba(0,38,62,0.02),0_8px_24px_-4px_rgba(0,38,62,0.06),0_16px_40px_-10px_rgba(0,38,62,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-charcoal/30"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.7,
                              delay: 0.1 + index * 0.05,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          >
                            {/* 内容区域 - 居中展示 */}
                            <div className="relative z-10 flex w-full flex-col items-center justify-center p-8 text-center text-brand-charcoal">
                              {/* 模块图标 */}
                              <div className="mb-8 transition-transform duration-500 group-hover:scale-110">
                                <module.icon
                                  className="h-12 w-12 text-[#B8A47B] transition-colors duration-500"
                                  strokeWidth={1}
                                />
                              </div>

                              {/* 标题 */}
                              <h2 className="mb-3 font-sans text-xl font-light tracking-[0.12em] text-brand-charcoal lg:text-2xl">
                                {module.label}
                              </h2>

                              {/* 描述/副标题 */}
                              <p className="max-w-[220px] text-[13px] font-light leading-relaxed tracking-wide text-brand-charcoal/60 transition-colors duration-500 group-hover:text-brand-charcoal/75 lg:text-sm">
                                {module.description}
                              </p>

                              {/* 装饰线 */}
                              <div className="mt-8 h-[1px] w-14 bg-brand-beige/50 transition-all duration-700 ease-out group-hover:w-24 group-hover:bg-brand-beige/80" />
                            </div>
                          </m.button>
                        ))}
                      </div>
                    </div>
                  </m.div>
                )}

                {/* Level 2: 方案选择 - 桌面端 Bento Box 布局 */}
                {currentLevel === 2 && selectedModule && (
                  <m.div
                    key="level2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center overflow-visible p-5"
                  >
                    <div className="flex w-full max-w-5xl items-center justify-center gap-8 lg:gap-12">
                      {moduleData[selectedModule].map((scheme, index) => (
                        <m.button
                          key={scheme.id}
                          type="button"
                          onClick={() => selectScheme(scheme)}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={cn(
                            // Bento Box 样式：正方形卡片，宽高固定
                            "group relative flex aspect-square w-full max-w-[320px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-[#FCF9F2] shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_16px_-2px_rgba(0,38,62,0.04)] transition-all duration-700 ease-out",
                            hoveredIndex === index
                              ? "scale-[1.02] border-brand-beige hover:shadow-[0_2px_0_rgba(0,38,62,0.02),0_8px_24px_-4px_rgba(0,38,62,0.06),0_16px_40px_-10px_rgba(0,38,62,0.04)]"
                              : "hover:border-brand-beige/70 hover:shadow-md"
                          )}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                          {/* 标签 - 仅存在时显示 */}
                          {scheme.tag && (
                            <span className="mb-6 text-[11px] tracking-[0.15em] text-brand-charcoal/50">
                              {scheme.tag}
                            </span>
                          )}

                          {/* 图标 - 仅存在时显示 */}
                          {scheme.icon && (
                            <div className="mb-6 text-[#B8A47B] [&>svg]:h-12 [&>svg]:w-12 [&>svg]:stroke-[1]">
                              {scheme.icon}
                            </div>
                          )}

                          {/* 标题 */}
                          <h3 className="mb-3 text-center text-2xl font-light tracking-[0.12em] text-brand-charcoal">
                            {scheme.name}
                          </h3>

                          {/* 英文标题 (如果有) */}
                          {scheme.nameEn && (
                            <span className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-brand-charcoal/40">
                              {scheme.nameEn}
                            </span>
                          )}

                          {/* 分隔线 */}
                          {scheme.desc && <div className="mb-5 h-px w-10 bg-brand-beige/50" />}

                          {/* 描述文字 - 仅在有描述时显示 */}
                          {scheme.desc && (
                            <p className="mb-7 max-w-[260px] px-2 text-center text-[13px] font-light leading-relaxed tracking-wide text-brand-charcoal/55">
                              {scheme.desc}
                            </p>
                          )}

                          {/* 预计用时 */}
                          <div className="flex items-center gap-2 text-brand-charcoal/45">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-[13px] font-light tracking-[0.1em]">{scheme.totalDuration}</span>
                          </div>
                        </m.button>
                      ))}
                    </div>
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
                    className="absolute inset-0 flex flex-col px-10 xl:px-[8%]"
                  >
                    <div className="flex h-full w-full flex-col pt-10">
                      {/* Level 3 Header: 标题与切换器 */}
                      <header className="flex flex-shrink-0 items-center pb-4">
                        {/* 左侧标题组 */}
                        <div className="flex flex-row items-center gap-5">
                          <h2 className="relative pb-4 font-sans text-3xl font-light leading-none tracking-[0.08em] text-[#00263E] after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-brand-beige/60">
                            {selectedModule === "portable" || selectedModule === "professional"
                              ? modules.find((m) => m.id === selectedModule)?.label
                              : selectedScheme.name}
                          </h2>
                          {selectedModule !== "portable" && selectedModule !== "professional" && (
                            <div className="flex items-center gap-2 text-brand-charcoal/50">
                              <Clock className="h-3.5 w-3.5" />
                              <span className="font-sans text-sm tracking-[0.1em]">
                                {selectedScheme.totalDuration || "5-10分钟"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 右侧子方案 Tab */}
                        {selectedScheme.subPlans && selectedScheme.subPlans.length > 0 ? (
                          <nav className="ml-auto flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                            <LayoutGroup id={`desktop-tab-${selectedModule}`}>
                              {selectedScheme.subPlans.map((subPlan) => {
                                const isActive = selectedSubPlan?.id === subPlan.id;
                                return (
                                  <button
                                    key={subPlan.id}
                                    type="button"
                                    onClick={() => selectSubPlan(subPlan)}
                                    className={`relative rounded-full px-5 py-1.5 text-[13px] font-light tracking-[0.12em] transition-colors duration-300 ${
                                      isActive
                                        ? "text-brand-charcoal"
                                        : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                                    }`}
                                  >
                                    <span className="relative z-10">{subPlan.name}</span>
                                    {isActive && (
                                      <m.div
                                        layoutId={`desktop-activeTab-${selectedModule}`}
                                        className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </LayoutGroup>
                          </nav>
                        ) : (
                          selectedModule !== "daily" && (
                            <nav className="ml-auto flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                              <LayoutGroup id={`desktop-tab-${selectedModule}`}>
                                {moduleData[selectedModule].map((scheme) => {
                                  const isActive = scheme.id === selectedScheme.id;
                                  return (
                                    <button
                                      key={scheme.id}
                                      type="button"
                                      onClick={() => selectScheme(scheme)}
                                      className={`relative rounded-full px-5 py-1.5 text-[13px] font-light tracking-[0.12em] transition-colors duration-300 ${
                                        isActive
                                          ? "text-brand-charcoal"
                                          : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                                      }`}
                                    >
                                      <span className="relative z-10">{scheme.name}</span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`desktop-activeTab-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                              </LayoutGroup>
                            </nav>
                          )
                        )}
                      </header>

                      {/* 内容主体：左侧边栏 + 右侧网格 */}
                      <div className="flex min-h-0 flex-1 w-full flex-row gap-12">
                        {/* 左侧：信息侧边栏 (Info Sidebar) */}
                        <m.aside
                          className="flex w-[25%] flex-shrink-0 flex-col gap-10 overflow-y-auto pr-4 pt-4 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* Meta Item: Products */}
                          <div className="relative isolate flex flex-col">
                            <h3 className="font-display z-10 mb-4 text-[11px] uppercase tracking-[0.2em] text-brand-charcoal">
                              相关产品
                            </h3>

                            <div className="flex flex-wrap gap-x-6 gap-y-8">
                              {currentProducts.map((product, index) => {
                                // 产品图标占位符映射 - 根据产品名匹配或按索引循环

                                const isOptional = !!product.optional;
                                const cleanName = product.name;
                                const iconPath = getCategoryIconPath(cleanName);

                                return (
                                  <button
                                    key={cleanName}
                                    type="button"
                                    onClick={() => handleProductClick(cleanName)}
                                    className="group flex flex-col items-center gap-3 transition-transform hover:-translate-y-1"
                                  >
                                    <div className="relative flex items-center justify-center drop-shadow-sm transition-all group-hover:drop-shadow-md">
                                      <div className="scale-110">
                                        {iconPath ? (
                                          <Image
                                            src={iconPath}
                                            alt={cleanName}
                                            width={48}
                                            height={48}
                                            className="h-12 w-12"
                                          />
                                        ) : (
                                          DEFAULT_ICONS[index % DEFAULT_ICONS.length]
                                        )}
                                      </div>
                                    </div>
                                    {/* 产品名称 */}
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-sm font-normal text-brand-charcoal/85 transition-colors group-hover:text-brand-charcoal">
                                        {cleanName}
                                      </span>
                                      {isOptional && (
                                        <span className="text-[10px] font-light tracking-wide text-brand-charcoal/50">
                                          (可选)
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Meta Item: Benefits (Tags) */}
                          <div className="flex flex-col">
                            <h3 className="font-display mb-4 text-[11px] uppercase tracking-[0.2em] text-brand-charcoal">
                              核心优势
                            </h3>
                            <div className="flex flex-wrap gap-x-6 gap-y-3">
                              {(
                                selectedSubPlan?.benefits ||
                                selectedScheme.benefits || ["保湿锁水", "屏障增强"]
                              ).map((tag) => (
                                <div key={tag} className="group flex items-center gap-2">
                                  <span className="text-[10px] text-brand-charcoal/25">
                                    ✦
                                  </span>
                                  <span className="text-sm font-light tracking-[0.12em] text-brand-charcoal/80 transition-colors group-hover:text-brand-charcoal">
                                    {tag}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Meta Item: Certifications */}
                          <div className="flex flex-col">
                            <h3 className="font-display mb-4 text-[11px] uppercase tracking-[0.2em] text-brand-charcoal">
                              检测认证
                            </h3>
                            <div className="flex items-center gap-5">
                              <Image
                                src="/images/sgs.svg"
                                alt="SGS"
                                title="SGS 权威认证"
                                width={28}
                                height={28}
                                className="h-7 w-auto"
                              />
                              <Image
                                src="/images/intertek-logo.svg"
                                alt="Intertek"
                                title="Intertek 质量认证"
                                width={28}
                                height={28}
                                className="h-6 w-auto"
                              />
                            </div>
                          </div>

                          {/* Meta Item: Special Support */}
                          {(() => {
                            const supportText =
                              selectedSubPlan?.specialSupport !== undefined
                                ? selectedSubPlan.specialSupport
                                : (selectedScheme.specialSupport ?? "孕期、月子期、轻医美术后");
                            if (!supportText) return null;
                            const isRestricted = supportText.includes("不支持");

                            return (
                              <div className="flex flex-col">
                                <h3 className="font-display mb-4 text-[11px] uppercase tracking-[0.2em] text-brand-charcoal">
                                  特殊时期支持
                                </h3>
                                <div
                                  className={cn(
                                    "border-l-2 py-0.5 pl-3 transition-colors duration-300",
                                    isRestricted
                                      ? "border-orange-900/30"
                                      : "border-brand-primary/30"
                                  )}
                                >
                                  <p
                                    className={cn(
                                      "text-sm font-light tracking-wider",
                                      isRestricted ? "text-orange-900/70" : "text-brand-charcoal/70"
                                    )}
                                  >
                                    {supportText}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </m.aside>

                        {/* 右侧：步骤网格 (Steps Grid) - 使用 AnimatePresence 实现交叉淡入淡出 */}
                        <AnimatePresence mode="wait">
                          {selectedModule === "professional" ? (
                            <m.section
                              key={`${selectedModule}-content`}
                              className="flex w-full flex-col pb-8 pt-0"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              {/* 顶部标题区 */}
                              <header className="mb-8">
                                <div className="mb-1 flex items-center gap-3">
                                  <h3 className="text-3xl font-normal tracking-wide text-brand-charcoal">
                                    {selectedScheme?.id === "p1" ? "面部方案" : "全身方案"}
                                  </h3>
                                  <span className="rounded-sm bg-[#E6DCC3] px-1.5 py-0.5 text-xs font-medium text-brand-charcoal">
                                    招牌
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <p className="font-sans text-sm font-light tracking-[0.1em] text-brand-charcoal/60">
                                    {selectedScheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
                                  </p>
                                  <p className="flex items-center text-[12px] font-normal tracking-wide text-brand-charcoal/70">
                                    <Info className="mr-1.5 h-3.5 w-3.5 text-brand-charcoal/40" />
                                    找不到您所在城市的门店？银卡级别以上会员可
                                    <Link
                                      href="/contact?type=cooperation"
                                      className="group relative mx-1.5 overflow-hidden px-2 py-0.5"
                                    >
                                      <span className="relative z-10 font-semibold transition-colors duration-500 group-hover:text-brand-charcoal">
                                        申请入驻
                                      </span>
                                      <span className="absolute inset-0 z-0 w-0 bg-[#C3BC9F]/40 transition-all duration-500 ease-out group-hover:w-full" />
                                      <span className="absolute bottom-0 left-0 h-[1px] w-full bg-brand-charcoal/20" />
                                    </Link>
                                    您所在的城市。
                                  </p>
                                </div>
                              </header>

                              {/* 中间卡片区 - Grid Layout */}
                              <div className="mb-8 grid grid-cols-3 gap-x-6 gap-y-10">
                                {getProfessionalCards(selectedScheme?.id).map((item) => (
                                  <div
                                    key={item.image}
                                    className="group relative flex h-full w-full cursor-pointer flex-col"
                                  >
                                    {/* 图片区域 - 包含所有内容 */}
                                    <div className="relative isolation-auto aspect-[1/1] w-full overflow-hidden rounded-md bg-brand-charcoal/5">
                                      <Image
                                        src={item.image}
                                        alt={item.title}
                                        fill
                                        sizes="25vw"
                                        className="z-0 object-cover transition-transform duration-700 group-hover:scale-105"
                                      />

                                      {/* 渐变遮罩 - 底部黑色渐变 - 加强 */}
                                      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-100" />

                                      {/* 文字内容 - 覆盖在图片上 */}
                                      <div className="absolute bottom-0 left-0 z-20 flex w-full flex-col gap-3 p-6">
                                        {/* 标题与时长 */}
                                        <div className="flex items-baseline gap-2 text-white">
                                          <h4 className="text-2xl font-normal tracking-wide text-white drop-shadow-md">
                                            {item.title}
                                          </h4>
                                          <span className="mx-1 text-lg font-light text-white">
                                            /
                                          </span>
                                          <span className="font-sans text-xl font-light tracking-wide text-white drop-shadow-md">
                                            {item.duration}
                                          </span>
                                        </div>

                                        {/* 标签 - 胶囊样式 */}
                                        <div>
                                          <span className="inline-block rounded-full border border-white bg-white/10 px-3 py-1 text-xs font-normal tracking-wide text-white shadow-sm backdrop-blur-sm">
                                            {item.tags}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 底部 Logo 栏 - 无限滚动 */}
                              <HotelLogoMarquee variant="desktop" />
                            </m.section>
                          ) : selectedModule === "portable" ? (
                            <m.section
                              key={`${selectedModule}-content`}
                              className="scrollbar-thin flex h-full w-full flex-col overflow-y-auto pr-4"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              {/* Full width image container */}
                              <div className="relative mb-8 aspect-[21/10] w-full flex-shrink-0 overflow-hidden rounded-xl bg-brand-charcoal/5">
                                <Image
                                  src={
                                    selectedScheme.heroImage || "/images/portable-hero-update.webp"
                                  }
                                  alt="Portable Ritual"
                                  fill
                                  sizes="75vw"
                                  className="object-cover"
                                />
                                {/* Fallback color/pattern if image missing */}
                                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-beige/20 to-brand-charcoal/5" />
                              </div>

                              {/* Text Content */}
                              <div className="relative mt-2 h-[48px] w-full overflow-y-auto pr-2">
                                <p className="text-sm font-light leading-relaxed tracking-wide text-brand-charcoal/80">
                                  {selectedScheme.desc}
                                </p>
                              </div>
                            </m.section>
                          ) : currentSteps.length <= 3 ? (
                            /* <= 3 步骤：直接展示卡片 (无折叠逻辑) */
                            <m.section
                              key={`${selectedModule}-simple`}
                              className="relative flex h-[530px] w-full items-center justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[480px] w-full max-w-[1000px] items-stretch justify-center gap-3">
                                {currentSteps.map((step, index) => (
                                  <div
                                    key={`${step.title}-${index}`}
                                    className="group relative w-[280px] flex-none"
                                  >
                                    {/* 步骤序号 */}
                                    <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-[#FBF8F0] px-4 py-1 text-[10px] font-light tracking-[0.12em] text-brand-charcoal shadow-sm">
                                      步骤 {String(index + 1).padStart(2, "0")}
                                    </div>

                                    {/* 内容卡片 */}
                                    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-[#FCF9F2]">
                                      <div className="absolute inset-0 flex flex-col p-6 pt-10">
                                        {/* 图片区域 */}
                                        <div className="relative mb-6 flex h-[240px] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20">
                                          <Image
                                            src={
                                              step.imageUrl ||
                                              "/images/ritual-step-placeholder.webp"
                                            }
                                            alt={step.title}
                                            fill
                                            sizes="280px"
                                            className="object-contain mix-blend-multiply"
                                          />
                                        </div>

                                        {/* 文字区域 */}
                                        <div className="flex flex-1 flex-col items-center">
                                          <h3 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-light tracking-[0.12em] text-brand-charcoal">
                                            {step.title}
                                          </h3>
                                          <p className="text-left text-[14px] font-light tracking-[0.08em] text-brand-charcoal/80">
                                            {step.description}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </m.section>
                          ) : (
                            <m.section
                              key={`${selectedModule}-paginated`}
                              className="relative flex w-full flex-col items-center justify-start"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[520px] w-full max-w-[1000px] items-stretch justify-center gap-3 overflow-hidden pt-5">
                                <AnimatePresence mode="wait" initial={false}>
                                  <m.div
                                    key={currentStepIndex}
                                    className="flex w-full justify-center gap-3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                  >
                                    {currentSteps
                                      .slice(currentStepIndex * 3, (currentStepIndex + 1) * 3)
                                      .map((step, index) => {
                                        // Calculate actual index in the full array for the step number
                                        const actualIndex = currentStepIndex * 3 + index;

                                        return (
                                          <m.div
                                            key={`${step.title}-${actualIndex}`}
                                            className="group relative w-[280px] flex-none"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                              duration: 0.5,
                                              delay: index * 0.1,
                                              ease: [0.22, 1, 0.36, 1],
                                            }}
                                          >
                                            {/* 步骤序号 */}
                                            <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-[#FBF8F0] px-4 py-1 text-xs font-medium tracking-widest text-brand-charcoal shadow-sm">
                                              步骤 {String(actualIndex + 1).padStart(2, "0")}
                                            </div>

                                            {/* 内容卡片 */}
                                            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-[#FCF9F2] transition-all duration-300 hover:border-brand-charcoal/40">
                                              <div className="absolute inset-0 flex flex-col p-6 pt-10">
                                                {/* 图片区域 */}
                                                <div className="relative mb-6 flex h-[240px] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20 transition-colors group-hover:bg-brand-beige/30">
                                                  <Image
                                                    src={
                                                      step.imageUrl ||
                                                      "/images/ritual-step-placeholder.webp"
                                                    }
                                                    alt={step.title}
                                                    fill
                                                    sizes="280px"
                                                    className="object-contain mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
                                                  />
                                                </div>

                                                {/* 文字区域 */}
                                                <div className="flex flex-1 flex-col items-center">
                                                  <h3 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-light tracking-[0.12em] text-brand-charcoal">
                                                    {step.title}
                                                  </h3>
                                                  <p className="text-left text-[14px] font-light tracking-[0.08em] text-brand-charcoal/80">
                                                    {step.description}
                                                  </p>

                                                  {/* Tips */}
                                                  {step.tips && (
                                                    <div className="mt-6 flex items-start gap-2 rounded-lg bg-brand-charcoal/5 px-3 py-2 text-xs font-light text-brand-charcoal/60">
                                                      <span className="shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wider">
                                                        Tip:
                                                      </span>
                                                      <span className="text-left">{step.tips}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </m.div>
                                        );
                                      })}
                                  </m.div>
                                </AnimatePresence>
                              </div>

                              {/* 左右浮动翻页箭头 */}
                              {currentSteps.length > 3 && (
                                <>
                                  <button
                                    onClick={() => setCurrentStepIndex((p) => Math.max(0, p - 1))}
                                    disabled={currentStepIndex === 0}
                                    className="absolute -left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0"
                                  >
                                    <ChevronLeft className="h-5 w-5 text-[#00263e]" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCurrentStepIndex((p) =>
                                        Math.min(Math.ceil(currentSteps.length / 3) - 1, p + 1)
                                      )
                                    }
                                    disabled={
                                      currentStepIndex >= Math.ceil(currentSteps.length / 3) - 1
                                    }
                                    className="absolute -right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0"
                                  >
                                    <ChevronRight className="h-5 w-5 text-[#00263e]" />
                                  </button>
                                </>
                              )}
                            </m.section>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop Footer Copyright */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 pt-4 pb-6">
              <p className="text-center text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </DrawerPageContainer>

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外 */}

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}

      {/* 产品详情弹窗 */}
      <ProductDrawer
        isOpen={productDrawerOpen}
        onClose={handleCloseProductDrawer}
        product={selectedProduct}
      />
    </>
  );
}

/**
 * 合作酒店 Logo 无限滚动条（移动端/桌面端共用）
 * 第二组 Logo 仅用于无缝循环视觉，对屏幕阅读器隐藏
 */
function HotelLogoMarquee({ variant }: { variant: "mobile" | "desktop" }) {
  const isMobile = variant === "mobile";
  return (
    <div
      className={cn(
        "relative overflow-hidden border-t",
        isMobile
          ? "-mx-5 border-[#00263E]/10 px-5 pb-4 pt-6"
          : "mb-6 border-brand-charcoal/10 pt-8"
      )}
    >
      {/* 左右渐变遮罩 */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 top-0 z-10 bg-gradient-to-r from-[#FBF8F0] to-transparent",
          isMobile ? "w-8" : "w-16"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 right-0 top-0 z-10 bg-gradient-to-l from-[#FBF8F0] to-transparent",
          isMobile ? "w-8" : "w-16"
        )}
      />

      {/* 滚动容器（prefers-reduced-motion 时动画由全局 CSS 禁用） */}
      <div
        className={cn(
          "flex animate-marquee items-center",
          isMobile ? "w-max" : "hover:[animation-play-state:paused]"
        )}
      >
        {[0, 1].map((group) => (
          <div key={group} className="flex items-center" aria-hidden={group === 1}>
            {hotelLogoNumbers.map((num) => (
              <div
                key={num}
                className={cn(
                  "flex flex-shrink-0 items-center justify-center",
                  isMobile ? "mx-4 h-[28px]" : "mx-6 h-[36px]"
                )}
              >
                <Image
                  src={`/images/hotels/hotel${num}.svg`}
                  alt={`Hotel Partner ${num}`}
                  width={isMobile ? 90 : 120}
                  height={isMobile ? 20 : 24}
                  className={cn(
                    "w-auto object-contain",
                    isMobile ? "h-[28px] opacity-70 mix-blend-multiply" : "h-[36px]"
                  )}
                  style={{ maxHeight: isMobile ? "28px" : "36px" }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
