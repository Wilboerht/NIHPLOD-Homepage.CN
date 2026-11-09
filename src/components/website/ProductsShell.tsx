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
import { ProductDetailSkeleton } from "@/components/website/ProductDetailSkeleton";
import { ProductsListSkeleton } from "@/components/website/ProductsListSkeleton";

export interface ProductsCategory {
  id: string;
  name: string;
  slug: string;
  productSlug?: string | null;
}

type ProductsTab = "featured" | "all";
type MobileView = "products" | "categories";
type PendingTarget = { href: string; kind: "detail" | "list" };
type NavigateEventLike = Event & { navigationType?: string };

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
  const [pending, setPending] = useState<PendingTarget | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);
  const [slowPending, setSlowPending] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);
  const listScrollTopRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setPending(null);
    setSlowPending(false);
  }

  const isNavigating = pending !== null && lastPathname === pathname;
  const showDetailChrome = isDetail || (isNavigating && pending?.kind === "detail");

  const cancelPendingNavigation = useCallback(() => {
    if (!pending) return;

    shouldRestoreFocusRef.current = true;
    setPending(null);
    setSlowPending(false);
    router.push(pathname);
  }, [pending, pathname, router]);

  const navigate = useCallback(
    (href: string, kind: PendingTarget["kind"]) => {
      if (pending?.href === href) {
        router.push(href);
        return;
      }

      if (pathname === href) {
        if (!pending) return;

        cancelPendingNavigation();
        return;
      }

      shouldRestoreFocusRef.current = true;
      setHasNavigated(true);
      setPending({ href, kind });
      setSlowPending(false);
      router.push(href);
    },
    [cancelPendingNavigation, pathname, pending, router]
  );

  const navigateToProduct = useCallback(
    (slug: string) => {
      navigate(`/products/${slug}`, "detail");
    },
    [navigate]
  );

  const navigateToList = useCallback(() => {
    navigate("/products", "list");
  }, [navigate]);

  useEffect(() => {
    if (!pending) return;

    const timer = window.setTimeout(() => setSlowPending(true), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (isNavigating) {
      shouldRestoreFocusRef.current = true;
      return;
    }
    if (!shouldRestoreFocusRef.current) return;

    shouldRestoreFocusRef.current = false;
    contentRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [isNavigating, pathname]);

  useEffect(() => {
    if (!pending) return;

    const navigation = (
      window as typeof window & {
        navigation?: {
          addEventListener: (
            type: "navigate",
            listener: (event: NavigateEventLike) => void
          ) => void;
          removeEventListener: (
            type: "navigate",
            listener: (event: NavigateEventLike) => void
          ) => void;
        };
      }
    ).navigation;
    if (!navigation) return;

    const handleNavigate = (event: NavigateEventLike) => {
      if (event.navigationType !== "traverse") return;

      event.preventDefault();
      cancelPendingNavigation();
    };

    navigation.addEventListener("navigate", handleNavigate);
    return () => navigation.removeEventListener("navigate", handleNavigate);
  }, [pending, cancelPendingNavigation]);

  useEffect(() => {
    const handlePopState = () => {
      if (pending) {
        cancelPendingNavigation();
        return;
      }

      if (isDetail && window.location.pathname === "/products") {
        shouldRestoreFocusRef.current = true;
        setHasNavigated(true);
        setPending({ href: "/products", kind: "list" });
        setSlowPending(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [pending, cancelPendingNavigation, isDetail]);

  useEffect(() => {
    const handleProductsError = () => {
      if (pending) {
        shouldRestoreFocusRef.current = true;
      }
      setPending(null);
      setSlowPending(false);
    };

    window.addEventListener("nihplod:products-error", handleProductsError);
    return () => window.removeEventListener("nihplod:products-error", handleProductsError);
  }, [pending]);

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
            {showDetailChrome && (
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
              {showDetailChrome && (
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
          <div className="relative min-h-0 flex-1 overflow-hidden" aria-busy={isNavigating}>
            {isNavigating && pending ? (
              pending.kind === "detail" ? (
                <ProductDetailSkeleton />
              ) : (
                <ProductsListSkeleton mobileView={mobileView} />
              )
            ) : (
              <m.div
                ref={contentRef}
                key={pathname}
                initial={hasNavigated && !prefersReducedMotion ? { opacity: 0.85 } : false}
                animate={{ opacity: 1 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex h-full min-h-0 flex-col"
              >
                {children}
              </m.div>
            )}

            {isNavigating && pending && slowPending && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-brand-charcoal/10 bg-white/95 px-4 py-2 text-[12px] font-light tracking-[0.04em] text-brand-charcoal/70 shadow-sm backdrop-blur">
                  <span role="status">加载时间较长，请稍候…</span>
                  <button
                    type="button"
                    onClick={() => router.push(pending.href)}
                    className="font-normal text-brand-primary underline-offset-2 hover:underline"
                  >
                    重试
                  </button>
                  <span className="text-brand-charcoal/20">|</span>
                  <button
                    type="button"
                    onClick={cancelPendingNavigation}
                    className="font-normal text-brand-charcoal/70 underline-offset-2 hover:underline"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
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
