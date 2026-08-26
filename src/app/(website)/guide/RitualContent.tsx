"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
  Sun,
  Compass,
  Sparkles,
  Flower,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCartStore } from "@/store/cart";
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

// 底部 Tab 栏图标语义映射
const TAB_ICONS: Record<string, LucideIcon> = {
  simple: Sun, // 精简方案
  outing: Compass, // 外出方案
  t1: Sun, // 日常外出
  t2: Compass, // 轻悦旅行
  t3: Sparkles, // 多效芳疗
  s1: Flower, // 面部方案 (spa)
  s2: Heart, // 全身方案 (spa)
  p1: Flower, // 面部护理套餐
  p2: Heart, // 全身护理套餐
};

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
 * 导航使用 window.history 驱动，避免 router.push/back 触发 RSC 重新获取数据导致卡顿
 */
interface RitualContentProps {
  products?: ProductData[];
}

/** 从浏览器 URL 解析 query 参数（纯客户端，不触发 RSC） */
function parseQueryParams(): { module: string | null; scheme: string | null; sub: string | null } {
  if (typeof window === "undefined") return { module: null, scheme: null, sub: null };
  const sp = new URLSearchParams(window.location.search);
  return { module: sp.get("module"), scheme: sp.get("scheme"), sub: sp.get("sub") };
}

/** 将 raw query 参数解析为结构化导航状态 */
function resolveNav(raw: { module: string | null; scheme: string | null; sub: string | null }) {
  const moduleId: ModuleId | null =
    raw.module && raw.module in defaultModuleData ? (raw.module as ModuleId) : null;
  const scheme: Scheme | null = moduleId
    ? (defaultModuleData[moduleId].find((s) => s.id === raw.scheme) ?? null)
    : null;
  const subPlan: SubPlan | null =
    scheme?.subPlans?.find((sp) => sp.id === raw.sub) ?? scheme?.subPlans?.[0] ?? null;
  return { module: moduleId, scheme, subPlan };
}

export function RitualContent({ products = [] }: RitualContentProps) {
  // 导航状态：从浏览器 URL 初始化，后续通过 window.history + popstate 驱动
  const [navRaw, setNavRaw] = useState(parseQueryParams);
  const nav = resolveNav(navRaw);

  // 当前层级: 1=模块选择, 2=方案选择, 3=步骤详情
  const currentLevel = !nav.module ? 1 : !nav.scheme ? 2 : 3;
  // 悬停的模块索引
  const { isDrawerOpen } = useLayout();
  const { user, openCheckout } = useAuth();
  const { success: showSuccess } = useToast();
  const { addToCart } = useCartStore();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 轮播导航状态（桌面端步骤分页）
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // 移动端滚动容器 & 渐隐遮罩（ref 直操 DOM，避免重渲染抖动）
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fadeMaskRef = useRef<HTMLDivElement>(null);
  const bottomFadeMaskRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mobileScrollRef.current;
    const mask = fadeMaskRef.current;
    const bottomMask = bottomFadeMaskRef.current;
    if (!el || !mask || !bottomMask) return;
    const sync = () => {
      mask.style.opacity = el.scrollTop > 8 ? "1" : "0";
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      bottomMask.style.opacity = atBottom ? "0" : "1";
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, []);

  // 层级切换时重置滚动位置 & 遮罩
  useEffect(() => {
    const el = mobileScrollRef.current;
    const mask = fadeMaskRef.current;
    const bottomMask = bottomFadeMaskRef.current;
    if (el) el.scrollTop = 0;
    if (mask) mask.style.opacity = "0";
    if (bottomMask) bottomMask.style.opacity = "1";
  }, [currentLevel]);

  // Tab 按钮 refs（方向键移动焦点用）
  const guideTabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // 左右方向键切换 Tab 并移动焦点（WAI-ARIA Tabs 模式，与 /products 一致）
  const handleGuideTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    itemCount: number,
    activeIndex: number,
    select: (index: number) => void
  ) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextIndex = (activeIndex + (e.key === "ArrowRight" ? 1 : -1) + itemCount) % itemCount;
    select(nextIndex);
    guideTabButtonsRef.current[nextIndex]?.focus();
    mobileScrollRef.current?.scrollTo({ top: 0 });
  };

  // 获取当前应该显示的步骤（优先使用子方案的步骤）
  const currentSteps = nav.subPlan?.steps || nav.scheme?.steps || [];
  // 获取当前应该显示的产品（优先使用子方案的产品）
  const currentProducts: RitualProductRef[] =
    nav.subPlan?.products || nav.scheme?.products || defaultRelatedProducts;

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
  const isMobile = useIsMobile();

  // 打开产品详情弹窗
  const handleProductClick = (productName: string) => {
    const product = findProduct(productName);
    if (product) {
      // 移动端直接跳转到产品详情页，不使用抽屉
      // 断点与 CSS 的 lg(1024px) 切换保持一致，避免 769~1023px 区间行为错配
      if (isMobile) {
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

  // 根据 ID 查找产品（用于登录后恢复抽屉）
  const findProductById = (productId: string) => {
    if (!products || products.length === 0) return null;
    return products.find((p) => p.id === productId) ?? null;
  };

  // 产品抽屉未登录操作：暂存意图，登录后回到 guide 自动恢复抽屉并执行
  const handleProductDrawerAuthRequired = useCallback(
    (productId: string, action: "addToCart" | "directBuy") => {
      if (typeof window === "undefined") return;
      sessionStorage.setItem("pendingProductDrawer", JSON.stringify({ productId, action }));
      window.location.href = `/login?return_to=${encodeURIComponent(
        "/guide?restoreProductDrawer=1"
      )}`;
    },
    []
  );

  // 登录后自动恢复 guide 页的产品抽屉
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 微任务延迟执行，避免 effect 内同步 setState
    deferInEffect(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("restoreProductDrawer") !== "1") return;

      const raw = sessionStorage.getItem("pendingProductDrawer");
      if (!raw) return;

      try {
        const pending = JSON.parse(raw) as {
          productId: string;
          action?: "addToCart" | "directBuy";
        };
        const product = findProductById(pending.productId);
        if (product && user) {
          setSelectedProduct(product);
          setProductDrawerOpen(true);
          if (pending.action === "addToCart") {
            addToCart(product.id, 1).then((ok) => {
              if (ok) showSuccess("已加入购物车");
            });
          } else if (pending.action === "directBuy") {
            openCheckout([product.id], { [product.id]: 1 });
          }
        }
      } catch {
        // ignore invalid sessionStorage data
      } finally {
        sessionStorage.removeItem("pendingProductDrawer");
        params.delete("restoreProductDrawer");
        const newQuery = params.toString();
        window.history.replaceState(null, "", `/guide${newQuery ? `?${newQuery}` : ""}`);
      }
    });
  }, [user, products, addToCart, openCheckout, showSuccess]);

  // 使用默认数据
  const moduleData = defaultModuleData;

  // Level 3 顶部 Tab 数量：≥3 时切换紧凑文字胶囊（去图标、收紧间距），避免窄屏溢出换行
  const guideTabCount =
    nav.scheme?.subPlans && nav.scheme.subPlans.length > 1
      ? nav.scheme.subPlans.length
      : nav.module && ["portable", "professional", "spa"].includes(nav.module)
        ? moduleData[nav.module].length
        : 0;
  const compactTabs = guideTabCount >= 3;

  // ====== 客户端导航函数（使用 window.history，避免 RSC 重新获取数据） ======

  const navigate = useCallback(
    (opts: {
      module?: string | null;
      scheme?: string | null;
      sub?: string | null;
      mode?: "push" | "replace";
    }) => {
      const params = new URLSearchParams();
      if (opts.module) params.set("module", opts.module);
      if (opts.scheme) params.set("scheme", opts.scheme);
      if (opts.sub) params.set("sub", opts.sub);
      const url = `/guide${params.size ? "?" + params.toString() : ""}`;
      const raw = {
        module: opts.module ?? null,
        scheme: opts.scheme ?? null,
        sub: opts.sub ?? null,
      };
      setNavRaw(raw);
      if (opts.mode === "replace") {
        window.history.replaceState(null, "", url);
      } else {
        window.history.pushState(null, "", url);
      }
    },
    []
  );

  // 监听浏览器前进/后退按钮
  useEffect(() => {
    const handler = () => {
      setNavRaw(parseQueryParams());
      setCurrentStepIndex(0);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // 选择模块：单品好物 (portable)、专业水疗 (professional)、居家仪式 (spa) 直接进入 Level 3 首个方案
  const selectModule = useCallback(
    (moduleId: ModuleId) => {
      const schemes = moduleData[moduleId];
      if (
        (moduleId === "portable" || moduleId === "professional" || moduleId === "spa") &&
        schemes &&
        schemes.length > 0
      ) {
        navigate({ module: moduleId, scheme: schemes[0].id });
      } else {
        navigate({ module: moduleId });
      }
    },
    [navigate]
  );

  // 选择方案（情景）
  const selectScheme = (scheme: Scheme) => {
    if (!nav.module) return;
    setCurrentStepIndex(0);
    navigate({ module: nav.module, scheme: scheme.id });
  };

  // 选择子方案（Tab）：用 replace，避免 Tab 切换堆叠浏览器历史
  const selectSubPlan = (subPlan: SubPlan) => {
    if (!nav.module || !nav.scheme) return;
    setCurrentStepIndex(0);
    navigate({ module: nav.module, scheme: nav.scheme.id, sub: subPlan.id, mode: "replace" });
  };

  // 跳过 Level 2 直接到 Level 3 的模块
  const SKIP_LEVEL2_MODULES: ModuleId[] = ["portable", "professional", "spa"];

  // 返回上一级：使用 navigate + replace，避免 window.history.back() 触发 popstate
  // 被 Next.js App Router 拦截导致 RSC 重新获取数据造成卡顿
  const goBack = useCallback(() => {
    setCurrentStepIndex(0);
    if (nav.scheme && nav.module) {
      if (SKIP_LEVEL2_MODULES.includes(nav.module)) {
        // portable / professional / spa 直接 Level 3 → Level 1
        navigate({ mode: "replace" });
      } else {
        // daily 等模块 Level 3 → Level 2：保留模块，清除方案
        navigate({ module: nav.module, mode: "replace" });
      }
    } else if (nav.module) {
      // Level 2 → Level 1：清除全部
      navigate({ mode: "replace" });
    }
  }, [nav.module, nav.scheme, navigate]);

  // 返回 Level 1 模块选择
  const goHome = useCallback(() => {
    setCurrentStepIndex(0);
    navigate({ mode: "replace" });
  }, [navigate]);

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
          <div className="flex h-full flex-col bg-brand-cream lg:hidden">
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
                    className="absolute left-4 flex items-center gap-0.5 text-[13px] font-light tracking-[0.04em] text-brand-charcoal/50 transition-colors active:text-brand-charcoal/70"
                  >
                    <ChevronLeft size={16} strokeWidth={1.5} />
                    返回
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

            {/* Level 3 顶部 Tab 栏 - 紧贴 Header 下方吸顶（与 /products 移动端胶囊 Tab 对齐） */}
            {currentLevel === 3 &&
              nav.module &&
              nav.scheme &&
              ((nav.scheme.subPlans && nav.scheme.subPlans.length > 1) ||
                (["portable", "professional", "spa"].includes(nav.module) &&
                  moduleData[nav.module].length > 1)) && (
                <div className="sticky top-[88px] z-40 shrink-0 bg-brand-cream/95 backdrop-blur-sm">
                  {/* Texture Overlay for Tab bar to match drawer body */}
                  <div className="texture-overlay absolute inset-0 z-[-1]" />
                  <div
                    className={cn(
                      "flex items-center justify-center",
                      compactTabs ? "gap-2 px-3" : "gap-3 px-6"
                    )}
                    role="tablist"
                    aria-label="切换护理方案"
                  >
                    <LayoutGroup id="guide-mobile-tab">
                      {nav.scheme.subPlans && nav.scheme.subPlans.length > 1
                        ? nav.scheme.subPlans.map((subPlan, index) => {
                            const isActive = nav.subPlan?.id === subPlan.id;
                            const Icon = TAB_ICONS[subPlan.id] || Sun;
                            return (
                              <button
                                key={subPlan.id}
                                ref={(el) => {
                                  guideTabButtonsRef.current[index] = el;
                                }}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                tabIndex={isActive ? 0 : -1}
                                onKeyDown={(e) =>
                                  handleGuideTabKeyDown(
                                    e,
                                    nav.scheme!.subPlans!.length,
                                    index,
                                    (i) => selectSubPlan(nav.scheme!.subPlans![i])
                                  )
                                }
                                onClick={() => {
                                  selectSubPlan(subPlan);
                                  mobileScrollRef.current?.scrollTo({ top: 0 });
                                }}
                                className={cn(
                                  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-2.5 transition-colors",
                                  compactTabs ? "px-3.5" : "px-4",
                                  isActive
                                    ? "font-normal text-brand-primary"
                                    : "font-light text-brand-charcoal/40"
                                )}
                              >
                                {isActive && (
                                  <m.div
                                    layoutId="guide-tab-pill"
                                    className="absolute inset-0 rounded-full border border-[#00263e]/[0.08] bg-[#00263e]/[0.04]"
                                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                  />
                                )}
                                {!compactTabs && (
                                  <Icon size={18} strokeWidth={1.5} className="relative" />
                                )}
                                <span className="relative text-[12px] tracking-[0.06em]">
                                  {subPlan.name}
                                </span>
                              </button>
                            );
                          })
                        : moduleData[nav.module].map((scheme, index) => {
                            const isActive = scheme.id === nav.scheme!.id;
                            const Icon = TAB_ICONS[scheme.id] || Sun;
                            return (
                              <button
                                key={scheme.id}
                                ref={(el) => {
                                  guideTabButtonsRef.current[index] = el;
                                }}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                tabIndex={isActive ? 0 : -1}
                                onKeyDown={(e) =>
                                  handleGuideTabKeyDown(
                                    e,
                                    moduleData[nav.module!].length,
                                    index,
                                    (i) => selectScheme(moduleData[nav.module!][i])
                                  )
                                }
                                onClick={() => {
                                  selectScheme(scheme);
                                  mobileScrollRef.current?.scrollTo({ top: 0 });
                                }}
                                className={cn(
                                  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-2.5 transition-colors",
                                  compactTabs ? "px-3.5" : "px-4",
                                  isActive
                                    ? "font-normal text-brand-primary"
                                    : "font-light text-brand-charcoal/40"
                                )}
                              >
                                {isActive && (
                                  <m.div
                                    layoutId="guide-tab-pill"
                                    className="absolute inset-0 rounded-full border border-[#00263e]/[0.08] bg-[#00263e]/[0.04]"
                                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                  />
                                )}
                                {!compactTabs && (
                                  <Icon size={18} strokeWidth={1.5} className="relative" />
                                )}
                                <span className="relative text-[12px] tracking-[0.06em]">
                                  {scheme.name}
                                </span>
                              </button>
                            );
                          })}
                    </LayoutGroup>
                  </div>
                </div>
              )}

            {/* 移动端内容区域 - 隐藏滚动条并移除多余 padding */}
            <div className="relative flex-1 overflow-hidden">
              {/* Top Fade Mask - 仅在滚动后显示 */}
              <div
                ref={fadeMaskRef}
                className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6 transition-opacity duration-300"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--brand-cream, #FBF8F0), transparent)",
                  opacity: 0,
                }}
              />
              {/* Bottom Fade Mask - 未滚到底时显示，滚到底后淡出 */}
              <div
                ref={bottomFadeMaskRef}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-8 transition-opacity duration-300"
                style={{
                  background:
                    "linear-gradient(to top, var(--brand-cream, #FBF8F0), transparent)",
                  opacity: 1,
                }}
              />
              <div
                ref={mobileScrollRef}
                className="relative z-20 h-full overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex min-h-full flex-col">
                  <AnimatePresence mode="wait">
                    {/* Level 1: 模块选择 - 2x2 精致网格 */}
                    {currentLevel === 1 && (
                      <m.div
                        key="mobile-l1"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-1 flex-col justify-start"
                      >
                        <div className="mb-8 flex flex-col items-center pt-7">
                          <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                            护肤仪式指南
                          </h2>
                          <div className="mt-2 w-[70px] border-b border-brand-primary" />
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
                              className="relative flex h-full flex-col items-start justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-brand-warm-light p-5 text-left shadow-[0_1px_0_rgba(0,0,0,0.02),0_6px_20px_-4px_rgba(0,38,62,0.04)] transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-charcoal/30 active:scale-[0.97]"
                            >
                              <div className="relative z-10 flex flex-col">
                                <module.icon
                                  className="mb-4 h-8 w-8 text-brand-buff"
                                  strokeWidth={1}
                                />
                                <span className="text-lg font-light tracking-[0.12em] text-brand-charcoal">
                                  {module.label}
                                </span>
                                <p className="mt-1.5 line-clamp-1 text-[11px] font-light leading-relaxed text-brand-charcoal/50">
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
                    {currentLevel === 2 && nav.module && (
                      <m.div
                        key="mobile-l2"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-1 flex-col justify-center"
                      >
                        {/* 模块标题 - 与 Level 1 统一风格 */}
                        <div className="mb-8 flex flex-col items-center pt-7">
                          <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                            {modules.find((m) => m.id === nav.module)?.label}
                          </h2>
                          <div className="mt-2 w-[70px] border-b border-brand-primary" />
                          <p className="mt-3 text-[13px] font-light leading-relaxed tracking-[0.06em] text-brand-charcoal/50">
                            {modules.find((m) => m.id === nav.module)?.description}
                          </p>
                        </div>

                        <div className="flex flex-col gap-3">
                          {moduleData[nav.module].map((scheme, idx) => (
                            <m.button
                              key={scheme.id}
                              initial={{ opacity: 0, x: -20 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true, margin: "-10px" }}
                              transition={{ duration: 0.4, delay: idx * 0.08, ease: "easeOut" }}
                              onClick={() => selectScheme(scheme)}
                              className={cn(
                                "group relative flex items-center overflow-hidden rounded-xl border border-brand-charcoal/[0.06] px-5 py-5 shadow-[0_2px_12px_-4px_rgba(0,38,62,0.03)] transition-all duration-300 active:scale-[0.98]",
                                idx === 0 ? "bg-[#C3BC9F]/[0.13]" : "bg-[#00263E]/[0.05]"
                              )}
                            >
                              {/* 左侧情景图标（晨间太阳 / 晚间月亮） */}
                              <div className="mr-3 shrink-0">{scheme.icon}</div>

                              {/* 装饰线 */}
                              <div className="mr-4 h-10 w-[2px] shrink-0 rounded-full bg-brand-beige/60 transition-colors group-active:bg-brand-beige" />

                              {/* 中间内容：标题 + 时长 */}
                              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                                <h3 className="truncate text-[15px] font-normal tracking-[0.1em] text-brand-charcoal">
                                  {scheme.name}
                                </h3>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3 w-3 text-brand-charcoal/40" />
                                  <span className="text-[11px] font-light tracking-[0.06em] text-brand-charcoal/50">
                                    {scheme.totalDuration || "15分钟"}
                                  </span>
                                </div>
                              </div>

                              {/* 右侧箭头 */}
                              <ChevronRight className="ml-3 h-4 w-4 shrink-0 text-brand-charcoal/20 transition-colors group-active:text-brand-charcoal/50" />
                            </m.button>
                          ))}
                        </div>

                        {/* AI 护肤顾问引导 */}
                        <div className="mt-8" />
                      </m.div>
                    )}

                    {/* Level 3: 步骤详情 - 垂直精修指南 */}
                    {currentLevel === 3 && nav.scheme && (
                      <m.div
                        key="mobile-l3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col"
                      >
                        {/* 顶部概览信息 (隐藏于 portable) */}
                        {nav.module !== "portable" ? (
                          <div className="mb-8 flex flex-col items-center pt-7">
                            <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                              {nav.scheme.name}
                            </h2>
                            <div className="mt-2 w-[70px] border-b border-brand-primary" />

                            {/* 相关产品 */}
                            <div className="mt-6 w-full">
                              <div className="flex flex-wrap justify-center gap-x-5 gap-y-4">
                                {currentProducts.map((product, index) => {
                                  const cleanName = product.name;
                                  const isOptional = !!product.optional;
                                  return (
                                    <button
                                      key={cleanName}
                                      type="button"
                                      onClick={() => handleProductClick(cleanName)}
                                      className="flex flex-col items-center gap-1.5 transition-transform active:scale-95"
                                    >
                                      <div className="flex h-[52px] w-[52px] items-center justify-center">
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
                                      <span className="max-w-[68px] truncate text-[12px] font-light leading-[16px] tracking-[0.04em] text-brand-charcoal/60">
                                        {cleanName}
                                        {isOptional ? " ·" : ""}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="mt-8 flex items-center justify-center gap-6">
                              <div className="flex flex-col items-center">
                                <span className="mb-1.5 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/50">
                                  预计时长
                                </span>
                                <span className="text-[14px] font-normal leading-[22px] tracking-[0.04em] text-brand-charcoal/80">
                                  {nav.scheme.totalDuration?.replace("min", "分钟") || "15-20 分钟"}
                                </span>
                              </div>
                              <div className="h-6 w-px bg-brand-charcoal/10" />
                              <div className="flex flex-col items-center">
                                <span className="mb-1.5 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/50">
                                  护理阶段
                                </span>
                                <span className="text-[14px] font-normal leading-[22px] tracking-[0.04em] text-brand-charcoal/80">
                                  {currentSteps.length} 个核心步骤
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mb-8 flex flex-col items-center pt-7">
                            <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                              {nav.scheme.name}
                            </h2>
                            <div className="mt-2 w-[70px] border-b border-brand-primary" />
                          </div>
                        )}

                        {/* Content Rendering based on Module */}
                        {nav.module === "portable" ? (
                          // Portable Module Layout
                          <div className="flex flex-col">
                            {/* Hero Image */}
                            <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-xl">
                              <Image
                                src={nav.scheme.heroImage || "/images/portable-hero-update.webp"}
                                alt={nav.scheme.name}
                                fill
                                sizes="100vw"
                                className="object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal/70 via-transparent to-transparent opacity-80" />
                              <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  {nav.scheme.benefits?.slice(0, 3).map((benefit, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-light tracking-[0.06em] text-white/90 backdrop-blur-sm"
                                    >
                                      {benefit}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Description Content */}
                            <div>
                              <p className="mb-4 text-[13px] font-light leading-[1.8] tracking-[0.04em] text-brand-charcoal/60">
                                {nav.scheme.desc}
                              </p>

                              {/* Products Meta - 图标+文字，无框线 */}
                              <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 border-t border-brand-charcoal/[0.06] pt-4">
                                {nav.scheme.products?.map((prod, idx) => (
                                  <button
                                    key={prod.name}
                                    type="button"
                                    onClick={() => handleProductClick(prod.name)}
                                    className="flex flex-col items-center gap-1.5 transition-transform active:scale-95"
                                  >
                                    <div className="flex h-[52px] w-[52px] items-center justify-center">
                                      {getCategoryIconPath(prod.name) ? (
                                        <Image
                                          src={getCategoryIconPath(prod.name)!}
                                          alt={prod.name}
                                          width={40}
                                          height={40}
                                          className="h-10 w-10"
                                        />
                                      ) : (
                                        DEFAULT_ICONS[idx % DEFAULT_ICONS.length]
                                      )}
                                    </div>
                                    <span className="max-w-[68px] truncate text-[12px] font-light leading-[16px] tracking-[0.04em] text-brand-charcoal/60">
                                      {prod.name}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : nav.module === "professional" ? (
                          <div className="flex w-full flex-col">
                            <div className="mb-3 flex items-center gap-2">
                              <h3 className="text-[17px] font-normal tracking-[0.1em] text-brand-charcoal">
                                {nav.scheme?.id === "p1" ? "面部方案" : "全身方案"}
                              </h3>
                              <span className="rounded-sm bg-brand-ecru px-1.5 py-0.5 text-[11px] font-light tracking-[0.06em] text-brand-charcoal/60">
                                招牌
                              </span>
                            </div>
                            <div className="mb-6">
                              <p className="text-[11px] font-light tracking-[0.12em] text-brand-charcoal/45">
                                {nav.scheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
                              </p>
                            </div>

                            {/* 中间卡片区 - 纵向列表 */}
                            <div className="mb-6 flex flex-col gap-6">
                              {getProfessionalCards(nav.scheme?.id).map((item) => (
                                <div
                                  key={item.image}
                                  className="relative aspect-[4/3] w-full overflow-hidden rounded-xl"
                                >
                                  <Image
                                    src={item.image}
                                    alt={item.title}
                                    fill
                                    sizes="100vw"
                                    className="z-0 object-cover"
                                  />
                                  {/* 渐变遮罩 */}
                                  <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
                                  {/* 文字内容 */}
                                  <div className="pointer-events-none absolute bottom-0 left-0 z-20 flex w-full flex-col gap-2 p-4">
                                    <div className="flex items-baseline gap-1.5 text-white">
                                      <h4 className="text-[17px] font-normal tracking-[0.08em] text-white drop-shadow-sm">
                                        {item.title}
                                      </h4>
                                      <span className="text-[12px] font-light text-white/70">
                                        /
                                      </span>
                                      <span className="text-[13px] font-light tracking-[0.06em] text-white/85 drop-shadow-sm">
                                        {item.duration}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="inline-block rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-light tracking-[0.06em] text-white/85 backdrop-blur-sm">
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
                          <div className="space-y-8">
                            {currentSteps.map((step, index) => (
                              <div key={index} className="group relative flex flex-col">
                                {/* 图片展示区 + 胶囊定位容器 */}
                                <div className="relative mb-4">
                                  {/* 步骤胶囊 */}
                                  <div className="border-brand-charcoal/12 absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border bg-brand-cream px-3.5 py-1 text-[11px] font-light tracking-[0.08em] text-brand-charcoal/50">
                                    步骤 {String(index + 1).padStart(2, "0")}
                                  </div>
                                  {/* 图片展示区 */}
                                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-brand-warm-white transition-transform duration-500 group-active:scale-[0.99]">
                                    <Image
                                      src={step.imageUrl || "/images/ritual-step-placeholder.webp"}
                                      alt={step.title}
                                      fill
                                      sizes="100vw"
                                      className="object-contain p-4 mix-blend-multiply"
                                    />
                                  </div>
                                </div>

                                {/* 文本描述区 */}
                                <div>
                                  <h3 className="mb-2 text-center text-[15px] font-normal leading-[24px] tracking-[0.1em] text-brand-charcoal">
                                    {step.title}
                                  </h3>
                                  <p className="text-[13px] font-light leading-[1.8] tracking-[0.04em] text-brand-charcoal/60">
                                    {step.description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 底部信息收尾 */}
                        {nav.module !== "portable" && (
                          <div className="mt-10 flex flex-col items-center text-center">
                            <div className="flex flex-col items-center gap-4">
                              {/* 核心优势 - 纯文字 */}
                              <p className="text-[12px] font-light leading-[20px] tracking-[0.06em] text-brand-charcoal/50">
                                {(
                                  nav.subPlan?.benefits ||
                                  nav.scheme.benefits || ["保湿锁水", "屏障增强"]
                                ).join(" · ")}
                              </p>

                              {/* 特殊时期 + 认证 - 合并为一行辅助信息 */}
                              {(() => {
                                const supportText =
                                  nav.subPlan?.specialSupport !== undefined
                                    ? nav.subPlan.specialSupport
                                    : (nav.scheme.specialSupport ?? "孕期、月子期、轻医美术后");
                                return supportText ? (
                                  <p
                                    className={cn(
                                      "text-[11px] font-light leading-[18px] tracking-[0.06em]",
                                      supportText.includes("不支持")
                                        ? "text-orange-900/50"
                                        : "text-brand-charcoal/45"
                                    )}
                                  >
                                    {supportText}
                                    {supportText.includes("不支持") ? "" : "可用"}
                                  </p>
                                ) : null;
                              })()}

                              {/* 认证 Logo */}
                              <div className="flex items-center gap-4 pt-1 opacity-40 mix-blend-multiply">
                                <Image
                                  src="/images/sgs.svg"
                                  alt="SGS"
                                  width={20}
                                  height={20}
                                  className="h-[18px] w-auto"
                                />
                                <Image
                                  src="/images/intertek-logo.svg"
                                  alt="Intertek"
                                  width={20}
                                  height={20}
                                  className="h-[16px] w-auto"
                                />
                              </div>

                              {/* 专业门店入驻 - 纯文字 */}
                              {nav.module === "professional" && (
                                <p className="pt-1 text-[12px] font-light leading-[18px] tracking-[0.04em] text-brand-charcoal/50">
                                  找不到您所在城市的门店？
                                  <br />
                                  银卡级别以上会员可
                                  <Link
                                    href="/contact?type=cooperation"
                                    className="mx-0.5 text-brand-charcoal/60 underline decoration-brand-charcoal/15 underline-offset-2 active:opacity-70"
                                  >
                                    申请入驻
                                  </Link>
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </m.div>
                    )}
                  </AnimatePresence>

                  {/* 移动端版权信息 - 滚动区内 mt-auto 贴底 */}
                  <div className="mt-auto flex flex-col items-center justify-center pb-4 pt-4">
                    <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========== 桌面端布局 - 保持原有样式 ========== */}
          <div className="hidden h-full flex-col lg:flex">
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
                        className="group flex items-center gap-1.5 text-sm font-light tracking-[0.08em] text-brand-charcoal/60 transition-all duration-300 hover:text-brand-charcoal"
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
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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
                            className="group relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-brand-warm-light shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_16px_-2px_rgba(0,38,62,0.04)] transition-all duration-700 ease-out hover:-translate-y-[2px] hover:border-brand-beige/70 hover:shadow-[0_2px_0_rgba(0,38,62,0.02),0_8px_24px_-4px_rgba(0,38,62,0.06),0_16px_40px_-10px_rgba(0,38,62,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-charcoal/30"
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
                                  className="h-12 w-12 text-brand-buff transition-colors duration-500"
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
                {currentLevel === 2 && nav.module && (
                  <m.div
                    key="level2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center overflow-visible p-5"
                  >
                    <div className="flex w-full max-w-5xl items-center justify-center gap-8 lg:gap-12">
                      {moduleData[nav.module].map((scheme, index) => (
                        <m.button
                          key={scheme.id}
                          type="button"
                          onClick={() => selectScheme(scheme)}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={cn(
                            // Bento Box 样式：正方形卡片，宽高固定
                            "group relative flex aspect-square w-full max-w-[320px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand-beige/60 bg-brand-warm-light shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_16px_-2px_rgba(0,38,62,0.04)] transition-all duration-700 ease-out",
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
                            <div className="mb-6 text-brand-buff [&>svg]:h-12 [&>svg]:w-12 [&>svg]:stroke-[1]">
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
                            <span className="text-[13px] font-light tracking-[0.1em]">
                              {scheme.totalDuration}
                            </span>
                          </div>
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}

                {/* Level 3: 详细步骤 - 桌面端左右分栏 */}
                {currentLevel === 3 && nav.scheme && nav.module && (
                  <m.div
                    key="level3"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
                    className="absolute inset-0 flex flex-col px-10 xl:px-[8%]"
                  >
                    <div className="flex h-full w-full flex-col pt-10">
                      {/* Level 3 Header: 标题与切换器 */}
                      <header className="flex flex-shrink-0 items-center pb-4">
                        {/* 左侧标题组 */}
                        <div className="flex flex-row items-center gap-5">
                          <h2 className="relative pb-4 font-sans text-3xl font-light leading-none tracking-[0.08em] text-brand-charcoal after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-brand-beige/60">
                            {nav.module === "portable" || nav.module === "professional"
                              ? modules.find((m) => m.id === nav.module)?.label
                              : nav.scheme.name}
                          </h2>
                          {nav.module !== "portable" && nav.module !== "professional" && (
                            <div className="flex items-center gap-2 text-brand-charcoal/50">
                              <Clock className="h-3.5 w-3.5" />
                              <span className="font-sans text-sm tracking-[0.1em]">
                                {nav.scheme.totalDuration || "5-10分钟"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 右侧子方案 Tab */}
                        {nav.scheme.subPlans && nav.scheme.subPlans.length > 0 ? (
                          <nav className="ml-auto flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                            <LayoutGroup id={`desktop-tab-${nav.module}`}>
                              {nav.scheme.subPlans.map((subPlan) => {
                                const isActive = nav.subPlan?.id === subPlan.id;
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
                                        layoutId={`desktop-activeTab-${nav.module}`}
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
                          nav.module !== "daily" && (
                            <nav className="ml-auto flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                              <LayoutGroup id={`desktop-tab-${nav.module}`}>
                                {moduleData[nav.module].map((scheme) => {
                                  const isActive = scheme.id === nav.scheme!.id;
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
                                          layoutId={`desktop-activeTab-${nav.module}`}
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
                            </nav>
                          )
                        )}
                      </header>

                      {/* 内容主体：左侧边栏 + 右侧网格 */}
                      <div className="flex min-h-0 w-full flex-1 flex-row gap-12">
                        {/* 左侧：信息侧边栏 (Info Sidebar) */}
                        <m.aside
                          className="flex min-h-0 w-[25%] flex-shrink-0 flex-col gap-10 overflow-y-auto pr-4 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.05, ease: [0.19, 1, 0.22, 1] }}
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
                                nav.subPlan?.benefits ||
                                nav.scheme.benefits || ["保湿锁水", "屏障增强"]
                              ).map((tag) => (
                                <div key={tag} className="group flex items-center gap-2">
                                  <span className="text-[10px] text-brand-charcoal/25">✦</span>
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
                              nav.subPlan?.specialSupport !== undefined
                                ? nav.subPlan.specialSupport
                                : (nav.scheme.specialSupport ?? "孕期、月子期、轻医美术后");
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
                          {nav.module === "professional" ? (
                            <m.section
                              key={`${nav.module}-content`}
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
                                    {nav.scheme?.id === "p1" ? "面部方案" : "全身方案"}
                                  </h3>
                                  <span className="rounded-sm bg-brand-ecru px-1.5 py-0.5 text-xs font-medium text-brand-charcoal">
                                    招牌
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <p className="font-sans text-sm font-light tracking-[0.1em] text-brand-charcoal/60">
                                    {nav.scheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
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
                                      <span className="absolute inset-0 z-0 w-0 bg-brand-sage/40 transition-all duration-500 ease-out group-hover:w-full" />
                                      <span className="absolute bottom-0 left-0 h-[1px] w-full bg-brand-charcoal/20" />
                                    </Link>
                                    您所在的城市。
                                  </p>
                                </div>
                              </header>

                              {/* 中间卡片区 - Grid Layout */}
                              <div className="mb-8 grid grid-cols-3 gap-x-6 gap-y-10">
                                {getProfessionalCards(nav.scheme?.id).map((item) => (
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
                          ) : nav.module === "portable" ? (
                            <m.section
                              key={`${nav.module}-content`}
                              className="scrollbar-thin flex h-full w-full flex-col overflow-y-auto pr-4"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              {/* Full width image container */}
                              <div className="relative mb-8 aspect-[21/10] w-full flex-shrink-0 overflow-hidden rounded-xl bg-brand-charcoal/5">
                                <Image
                                  src={nav.scheme.heroImage || "/images/portable-hero-update.webp"}
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
                                  {nav.scheme.desc}
                                </p>
                              </div>
                            </m.section>
                          ) : currentSteps.length <= 3 ? (
                            /* <= 3 步骤：直接展示卡片 (无折叠逻辑) */
                            <m.section
                              key={`${nav.module}-simple`}
                              className="relative flex h-[min(530px,calc(100dvh-220px))] w-full items-center justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[min(480px,calc(100dvh-270px))] w-full max-w-[1000px] items-stretch justify-center gap-3">
                                {currentSteps.map((step, index) => (
                                  <div
                                    key={`${step.title}-${index}`}
                                    className="group relative w-[280px] flex-none"
                                  >
                                    {/* 步骤序号 */}
                                    <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-brand-cream px-4 py-1 text-[10px] font-light tracking-[0.12em] text-brand-charcoal shadow-sm">
                                      步骤 {String(index + 1).padStart(2, "0")}
                                    </div>

                                    {/* 内容卡片 */}
                                    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-brand-warm-light">
                                      <div className="absolute inset-0 flex flex-col p-6 pt-10 [@media(max-height:700px)]:p-4 [@media(max-height:700px)]:pt-8">
                                        {/* 图片区域 */}
                                        <div className="relative mb-6 flex h-[clamp(96px,22dvh,240px)] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20 [@media(max-height:700px)]:mb-3">
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
                                        <div className="flex flex-1 flex-col items-center min-h-0 overflow-y-auto">
                                          <h3 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-light tracking-[0.12em] text-brand-charcoal [@media(max-height:700px)]:mb-2 [@media(max-height:700px)]:text-xl">
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
                              key={`${nav.module}-paginated`}
                              className="relative flex w-full flex-col items-center justify-start"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[min(520px,calc(100dvh-240px))] w-full max-w-[1000px] items-stretch justify-center gap-3 overflow-hidden pt-5">
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
                                            <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-brand-cream px-4 py-1 text-xs font-medium tracking-widest text-brand-charcoal shadow-sm">
                                              步骤 {String(actualIndex + 1).padStart(2, "0")}
                                            </div>

                                            {/* 内容卡片 */}
                                            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-brand-warm-light transition-all duration-300 hover:border-brand-charcoal/40">
                                              <div className="absolute inset-0 flex flex-col p-6 pt-10 [@media(max-height:700px)]:p-4 [@media(max-height:700px)]:pt-8">
                                                {/* 图片区域 */}
                                                <div className="relative mb-6 flex h-[clamp(96px,22dvh,240px)] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20 transition-colors group-hover:bg-brand-beige/30 [@media(max-height:700px)]:mb-3">
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
                                                <div className="flex flex-1 flex-col items-center min-h-0 overflow-y-auto">
                                                  <h3 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-light tracking-[0.12em] text-brand-charcoal [@media(max-height:700px)]:mb-2 [@media(max-height:700px)]:text-xl">
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
                                    <ChevronLeft className="h-5 w-5 text-brand-charcoal" />
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
                                    <ChevronRight className="h-5 w-5 text-brand-charcoal" />
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

            {/* Advisor CTA - 桌面端 */}
            <div className="flex shrink-0 flex-col items-center px-10 pt-4 xl:px-[8%]" />

            {/* Desktop Footer Copyright */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 pb-6 pt-4">
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
        onAuthRequired={handleProductDrawerAuthRequired}
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
          ? "-mx-5 border-brand-charcoal/10 px-5 pb-4 pt-6"
          : "mb-6 border-brand-charcoal/10 pt-8"
      )}
    >
      {/* 左右渐变遮罩 */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 top-0 z-10 bg-gradient-to-r from-brand-cream to-transparent",
          isMobile ? "w-8" : "w-16"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 right-0 top-0 z-10 bg-gradient-to-l from-brand-cream to-transparent",
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
