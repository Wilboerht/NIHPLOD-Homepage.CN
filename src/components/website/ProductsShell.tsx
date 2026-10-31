"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

export interface ProductsCategory {
  id: string;
  name: string;
  slug: string;
  productSlug?: string | null;
}

type ProductsTab = "featured" | "all";
type MobileView = "products" | "categories";

interface ProductsShellContextValue {
  activeTab: ProductsTab;
  mobileView: MobileView;
  switchMobileView: (view: MobileView) => void;
  navigateToProduct: (slug: string) => void;
  navigateToList: () => void;
  listScrollTopRef: { current: number };
}

const ProductsShellContext = createContext<ProductsShellContextValue | undefined>(undefined);

export function useProductsShell() {
  const context = useContext(ProductsShellContext);
  if (!context) {
    throw new Error("useProductsShell must be used within ProductsShell");
  }
  return context;
}

/**
 * 产品路由共享外壳
 * 抽屉容器与顶部导航在列表页/详情页之间保持挂载，
 * 详情切换只替换 children。
 */
export function ProductsShell({
  categories,
  children,
}: {
  categories: ProductsCategory[];
  children: ReactNode;
}) {
  const { isDrawerOpen } = useLayout();
  const pathname = usePathname();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const isDetail = pathname.startsWith("/products/");
  const [activeTab] = useState<ProductsTab>("featured");
  const [mobileView, setMobileView] = useState<MobileView>("products");
  const [navigationState, setNavigationState] = useState<{
    pathname: string;
    pendingPath: string | null;
  }>({ pathname, pendingPath: null });

  if (navigationState.pathname !== pathname) {
    setNavigationState({ pathname, pendingPath: null });
  }

  const isNavigating =
    navigationState.pendingPath !== null && navigationState.pendingPath !== pathname;

  const navigateTimerRef = useRef<number | null>(null);
  const navigateResetTimerRef = useRef<number | null>(null);
  const listScrollTopRef = useRef(0);

  const clearNavigateTimers = useCallback(() => {
    if (navigateTimerRef.current) {
      window.clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = null;
    }
    if (navigateResetTimerRef.current) {
      window.clearTimeout(navigateResetTimerRef.current);
      navigateResetTimerRef.current = null;
    }
  }, []);

  const navigate = useCallback(
    (href: string) => {
      if (pathname === href || isNavigating) return;

      if (prefersReducedMotion) {
        router.push(href);
        return;
      }

      clearNavigateTimers();
      setNavigationState((prev) => ({ ...prev, pendingPath: href }));

      navigateTimerRef.current = window.setTimeout(() => {
        navigateTimerRef.current = null;
        router.push(href);
      }, 180);

      // router.push 异常时兜底恢复，避免内容一直停留在透明状态
      navigateResetTimerRef.current = window.setTimeout(() => {
        navigateResetTimerRef.current = null;
        setNavigationState((prev) => ({ ...prev, pendingPath: null }));
      }, 1500);
    },
    [pathname, isNavigating, prefersReducedMotion, router, clearNavigateTimers]
  );

  const navigateToProduct = useCallback(
    (slug: string) => {
      navigate(`/products/${slug}`);
    },
    [navigate]
  );

  const navigateToList = useCallback(() => {
    navigate("/products");
  }, [navigate]);

  const handleListNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateToList();
  };

  const handleCategoryNavClick = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateToProduct(slug);
  };

  const switchMobileView = useCallback((view: MobileView) => {
    setMobileView(view);
    listScrollTopRef.current = 0;
  }, []);

  // 路由变化后清理过渡定时器
  useEffect(() => {
    clearNavigateTimers();
  }, [pathname, clearNavigateTimers]);

  useEffect(() => clearNavigateTimers, [clearNavigateTimers]);

  const contextValue = useMemo<ProductsShellContextValue>(
    () => ({
      activeTab,
      mobileView,
      switchMobileView,
      navigateToProduct,
      navigateToList,
      listScrollTopRef,
    }),
    [activeTab, mobileView, switchMobileView, navigateToProduct, navigateToList]
  );

  return (
    <ProductsShellContext.Provider value={contextValue}>
      <DrawerPageContainer>
        {/* 矿物纹理覆盖层 */}
        <div className="texture-overlay absolute inset-0" />

        {/* 装饰线条 */}
        <AnimatePresence>
          {isDrawerOpen && (
            <>
              <m.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute bottom-0 left-[5%] top-0 hidden w-px origin-center lg:block"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)",
                }}
              />
              <m.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                className="pointer-events-none absolute bottom-0 right-[5%] top-0 hidden w-px origin-center lg:block"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)",
                }}
              />
            </>
          )}
        </AnimatePresence>

        {/* 内容区域 */}
        <div
          data-products-shell
          className={cn(
            "relative z-10 flex h-full flex-col overflow-hidden transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* 移动端 Header - 列表页与详情页共用 */}
          <div className="relative flex h-[88px] w-full shrink-0 items-center justify-center bg-brand-cream/95 px-6 lg:hidden">
            <div className="texture-overlay absolute inset-0 z-[-1]" />
            {isDetail && (
              <Link
                href="/products"
                onClick={handleListNavClick}
                className="absolute left-4 flex h-10 items-center gap-0.5 text-[13px] font-light tracking-[0.04em] text-brand-charcoal/60 transition-colors active:text-brand-charcoal"
                aria-label="返回产品列表"
              >
                <ChevronLeft size={16} strokeWidth={1.5} />
                返回
              </Link>
            )}
            <Link href="/" className="flex items-center justify-center">
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
          </div>

          {/* 桌面端顶栏 - 列表页与详情页共用 */}
          <nav className="relative hidden h-[88px] shrink-0 grid-cols-[150px_1fr_150px] items-center border-b border-brand-charcoal/[0.05] px-10 lg:grid xl:px-[8%]">
            <Link href="/">
              <div className="relative h-9 w-[150px] opacity-90 transition-opacity hover:opacity-70">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </Link>

            <div className="flex items-center justify-center gap-3 whitespace-nowrap xl:gap-6">
              {categories.map((cat) =>
                cat.productSlug ? (
                  <Link
                    key={cat.id}
                    href={`/products/${cat.productSlug}`}
                    onClick={(e) => handleCategoryNavClick(e, cat.productSlug!)}
                    className="group relative py-1 text-[13px] font-light tracking-[0.08em] text-brand-charcoal transition-all hover:opacity-80 xl:text-[15px] xl:tracking-[0.15em]"
                  >
                    {cat.name}
                    <span className="absolute bottom-0 left-0 h-px w-0 bg-brand-primary transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-full" />
                  </Link>
                ) : (
                  <span
                    key={cat.id}
                    className="group relative cursor-not-allowed py-1 text-[13px] font-light tracking-[0.08em] text-brand-charcoal/35 transition-all xl:text-[15px] xl:tracking-[0.15em]"
                  >
                    {cat.name}
                    <span className="absolute bottom-0 left-0 h-px w-0 bg-brand-primary" />
                  </span>
                )
              )}
            </div>

            <div className="flex justify-end">
              {isDetail && (
                <Link
                  href="/products"
                  onClick={handleListNavClick}
                  className="group inline-flex items-center gap-1.5 py-1 text-[13px] font-light tracking-[0.08em] text-brand-charcoal transition-opacity hover:opacity-70 xl:text-[15px] xl:tracking-[0.12em]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  返回产品列表
                </Link>
              )}
            </div>
          </nav>

          {/* 列表页 / 详情页内容 */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <m.div
              key={pathname}
              initial={false}
              animate={{ opacity: isNavigating ? 0 : 1 }}
              transition={{
                duration: prefersReducedMotion ? 0 : isNavigating ? 0.18 : 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn("flex h-full min-h-0 flex-col", isNavigating && "pointer-events-none")}
            >
              {children}
            </m.div>
          </div>
        </div>

        {/* PC 端水印 */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden items-center justify-center overflow-hidden md:flex">
          <Image
            src="/images/watermark.webp"
            alt=""
            width={2000}
            height={800}
            className="h-[120%] w-auto max-w-none opacity-[0.03]"
          />
        </div>
      </DrawerPageContainer>
    </ProductsShellContext.Provider>
  );
}
