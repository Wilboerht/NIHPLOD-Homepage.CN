"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, useMotionValue, animate } from "framer-motion";
import { ChevronLeft, ShoppingCart, Loader2 } from "lucide-react";
import { ProductCard, PlatformIcon, XiaohongshuLink } from "@/components/website";
import { cn, formatPrice } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useToast } from "@/components/ui/Toast";
import { useCartStore } from "@/store/cart";

interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
}

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  purchaseLinks: { id: string; platform: string; url: string }[];
  category: Category;
  images: ProductImage[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  allowDirectBuy: boolean;
  stock: number;
}

interface RelatedProduct {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: { name: string };
  images: { url: string; alt: string | null }[];
}

interface ProductDetailContentProps {
  product: Product;
  relatedProducts: RelatedProduct[];
}

type TabType = "description" | "ingredients" | "usage";

/**
 * 产品详情页内容组件
 * 样式对齐 Careers 页面
 */
export function ProductDetailContent({ product, relatedProducts }: ProductDetailContentProps) {
  const router = useRouter();
  const { setDrawerOpen } = useLayout();

  useEffect(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  // 标记从产品列表页导航过来，返回时跳过列表页抽屉动画
  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("products_animate", "1");
    }
  }, []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [quantity, setQuantity] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const x = useMotionValue(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

  const tabs: { key: TabType; label: string }[] = [
    { key: "description", label: "产品描述" },
    { key: "ingredients", label: "成分说明" },
    { key: "usage", label: "使用方法" },
  ];

  const tabContent: Record<TabType, string | null> = {
    description: product.description,
    ingredients: product.ingredients,
    usage: product.usage,
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((t) => t.key === activeTab);
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setActiveTab(tabs[nextIndex].key);
  };

  // 轮播容器宽度
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // 索引变化时吸附到目标位置
  useEffect(() => {
    if (containerWidth === 0) return;
    if (animationRef.current) animationRef.current.stop();
    animationRef.current = animate(x, -currentImageIndex * containerWidth, {
      type: "spring",
      stiffness: 300,
      damping: 30,
    });
  }, [currentImageIndex, containerWidth, x]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (animationRef.current) animationRef.current.stop();
    startXRef.current = e.touches[0].clientX;
    startTimeRef.current = Date.now();
    isDraggingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || containerWidth === 0) return;
    const currentX = e.touches[0].clientX;
    const diff = startXRef.current - currentX;

    // 边界阻尼
    let dampedDiff = diff;
    if (currentImageIndex === 0 && diff < 0) {
      dampedDiff = diff * 0.3;
    } else if (currentImageIndex === product.images.length - 1 && diff > 0) {
      dampedDiff = diff * 0.3;
    }

    x.set(-currentImageIndex * containerWidth - dampedDiff);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const endX = e.changedTouches[0].clientX;
    const diff = startXRef.current - endX;
    const duration = Date.now() - startTimeRef.current;
    const velocity = Math.abs(diff) / Math.max(duration, 1);

    const SWIPE_THRESHOLD = 50;
    const VELOCITY_THRESHOLD = 0.5; // px/ms

    let newIndex = currentImageIndex;

    if (diff > SWIPE_THRESHOLD || (diff > 0 && velocity > VELOCITY_THRESHOLD)) {
      if (currentImageIndex < product.images.length - 1) {
        newIndex = currentImageIndex + 1;
      }
    } else if (diff < -SWIPE_THRESHOLD || (diff < 0 && velocity > VELOCITY_THRESHOLD)) {
      if (currentImageIndex > 0) {
        newIndex = currentImageIndex - 1;
      }
    }

    if (newIndex !== currentImageIndex) {
      setCurrentImageIndex(newIndex);
    } else {
      // 回弹
      if (animationRef.current) animationRef.current.stop();
      animationRef.current = animate(x, -currentImageIndex * containerWidth, {
        type: "spring",
        stiffness: 300,
        damping: 30,
      });
    }
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="relative flex min-h-dvh flex-col bg-[#FBF8F0]"
    >
      {/* 手机端背景水印 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden lg:hidden">
        <Image
          src="/images/watermark-mobile.png"
          alt=""
          fill
          className="object-cover opacity-75 blur-[7.5px]"
          priority
        />
      </div>
      {/* 矿物纹理叠加层 */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
        {/* 顶栏 / Logo 区 */}
        <header className="flex-shrink-0 text-center sm:px-4 sm:pb-6 sm:pt-2 lg:pb-8 lg:pt-4">
          {/* 手机端顶部栏 */}
          <div className="pointer-events-auto relative flex h-[88px] w-full flex-shrink-0 items-center justify-center lg:hidden">
            <button
              onClick={() => typeof window !== "undefined" && window.history.back()}
              className="absolute bottom-0 left-0 top-0 flex items-center justify-center px-4 py-[10px]"
            >
              <ChevronLeft className="h-6 w-6 text-[#00263E]" />
            </button>
            <Link href="/" className="flex items-center justify-center py-[30px]">
              <div className="relative h-[28px] w-[100px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
          </div>
          {/* Logo - 桌面端 */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden justify-center lg:flex"
          >
            <div className="relative h-[32px] w-[152px] sm:h-10 sm:w-[200px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="公司标志"
                fill
                className="object-contain"
                priority
              />
            </div>
          </m.div>
        </header>

        {/* 分割线 - 仅桌面端 */}
        <div className="mx-auto hidden w-full max-w-7xl border-b border-brand-charcoal/10 lg:block" />

        {/* 内容区域 */}
        <div className="relative min-h-0 flex-1">
          <main className="h-full overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div>
              {/* 图片轮播区域 + 指示器 */}
              <div className="mx-4 w-[calc(100%-2rem)] max-w-4xl md:m-0 md:mx-auto md:w-full">
                <div
                  ref={containerRef}
                  className="relative aspect-[3/4] w-full touch-pan-y overflow-hidden rounded-2xl bg-brand-beige/30 lg:aspect-[16/9]"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <m.div
                    className="flex h-full"
                    style={{ x }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {product.images.map((img, index) => (
                      <div key={img.id} className="relative h-full w-full flex-shrink-0">
                        <Image
                          src={img.url}
                          alt={img.alt || product.name}
                          fill
                          priority={index === 0}
                          className="object-cover"
                          sizes="100vw"
                        />
                      </div>
                    ))}
                  </m.div>
                </div>

                {/* 图片指示器 */}
                {product.images.length > 1 && (
                  <div className="mt-7 flex items-center justify-center gap-2">
                    {product.images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          "h-[2px] min-h-[2px] w-5 min-w-5 border-none p-0 transition-all duration-300",
                          currentImageIndex === index ? "bg-[#00263E]" : "bg-[#00263E]/20"
                        )}
                        aria-label={`查看第 ${index + 1} 张图片`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 产品信息 */}
              <m.div
                className="mx-auto max-w-2xl px-6 pb-0 pt-7 max-lg:px-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                {/* 产品名称 + 容量 */}
                <div className="flex items-end justify-between">
                  <h1 className="font-serif text-[20px] text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-[#00263E] sm:text-[24px] lg:text-[28px]">
                    {product.name}
                  </h1>
                  {product.capacity && (
                    <span className="ml-3 shrink-0 text-sm font-light text-[#00263E]/60">
                      {product.capacity}
                    </span>
                  )}
                </div>

                {/* 价格与产地 */}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[18px] font-light tracking-[0.12em] text-brand-charcoal max-lg:text-[#00263E]">
                    {formatPrice(product.price)}
                  </span>
                  <span className="text-xs font-light text-[#00263E]/50">产地：法国</span>
                </div>

                {/* 功效标签 */}
                {product.benefits.length > 0 && (
                  <div className="mt-6 hidden flex-wrap gap-2 lg:flex">
                    {product.benefits.map((benefit, index) => (
                      <span
                        key={index}
                        className="rounded-full border border-brand-beige bg-[#FBF8F0] px-3 py-1 text-[14px] font-light text-[#00263E]"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                )}
              </m.div>

              {/* Tab 区域 */}
              <div className="mx-auto max-w-2xl px-6 py-7 max-lg:px-4">
                {/* Tab 切换 */}
                <div className="border-b border-brand-beige">
                  <div className="flex justify-start gap-8" role="tablist" aria-label="产品信息">
                    {tabs.map((tab) => (
                      <div
                        key={tab.key}
                        role="tab"
                        id={`tab-${tab.key}`}
                        aria-selected={activeTab === tab.key}
                        aria-controls={`panel-${tab.key}`}
                        tabIndex={activeTab === tab.key ? 0 : -1}
                        onClick={() => setActiveTab(tab.key)}
                        onKeyDown={handleTabKeyDown}
                        className={cn(
                          "relative cursor-pointer pb-3 text-[14px] font-light tracking-[0.12em] transition-colors",
                          activeTab === tab.key
                            ? "text-brand-charcoal"
                            : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                        )}
                      >
                        {tab.label}
                        {activeTab === tab.key && (
                          <m.div
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00263e]"
                            layoutId="tab-indicator"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tab 内容 */}
                <div className="mt-4">
                  {tabs.map((tab) => (
                    <div
                      key={tab.key}
                      role="tabpanel"
                      id={`panel-${tab.key}`}
                      aria-labelledby={`tab-${tab.key}`}
                      tabIndex={0}
                      className={cn(
                        "transition-opacity duration-300",
                        activeTab === tab.key ? "block opacity-100" : "hidden opacity-0"
                      )}
                    >
                      {tabContent[tab.key] ? (
                        <div
                          className="text-justify text-[14px] font-light leading-[1.8] tracking-[0.08em] text-[#00263e]/90"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(tabContent[tab.key]!),
                          }}
                        />
                      ) : (
                        <p className="text-[14px] font-light text-[#00263e]/40">暂无内容</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 小红书链接 */}
              <XiaohongshuLink
                categoryName={product.category.name}
                className="mx-auto flex max-w-2xl flex-col gap-1 px-6 pb-7 max-lg:px-4"
              />

              {/* 购买按钮区域 */}
              <div className="mx-auto max-w-2xl px-6 pb-3 max-lg:px-4">
                <div className="flex flex-col gap-3">
                  {product.allowDirectBuy && (
                    <>
                      <QuantitySelector
                        stock={product.stock}
                        quantity={quantity}
                        onChange={setQuantity}
                      />
                      <AddToCartButton
                        productId={product.id}
                        stock={product.stock}
                        quantity={quantity}
                      />
                      <DirectBuyButton
                        productId={product.id}
                        stock={product.stock}
                        quantity={quantity}
                      />
                    </>
                  )}

                  {/* 外部购买链接 - 图标形式 */}
                  <div className="flex flex-wrap items-center justify-start gap-4">
                    {product.purchaseLinks && product.purchaseLinks.length > 0 ? (
                      product.purchaseLinks.map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`在${link.platform}购买`}
                          className="-m-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-opacity hover:opacity-60"
                        >
                          <PlatformIcon platform={link.platform} />
                        </a>
                      ))
                    ) : product.purchaseUrl ? (
                      <a
                        href={product.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="在官网购买"
                        className="-m-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-opacity hover:opacity-60"
                      >
                        <PlatformIcon platform="官网" />
                      </a>
                    ) : (
                      !product.allowDirectBuy && (
                        <span className="text-[14px] font-light text-[#00263e]/50">
                          暂无购买链接
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* 相关产品推荐 */}
              {relatedProducts.length > 0 && (
                <div className="mx-auto mt-8 w-full max-w-4xl border-t border-brand-beige px-6 pt-8 max-lg:px-4">
                  <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-[#00263E]">
                    相关推荐
                  </h2>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {relatedProducts.map((rp) => (
                      <Link key={rp.id} href={`/products/${rp.slug}`}>
                        <ProductCard
                          product={{
                            id: rp.id,
                            name: rp.name,
                            nameEn: rp.nameEn,
                            slug: rp.slug,
                            price: rp.price,
                            capacity: rp.capacity || undefined,
                            images: rp.images.map((img) => ({
                              url: img.url,
                              alt: img.alt || undefined,
                            })),
                            category: { name: rp.category.name },
                          }}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* 底部版权信息 */}
        <div className="mx-6 mt-auto border-t border-brand-charcoal/5 pb-4 pt-4 text-center max-lg:border-0 max-lg:pt-4 sm:pt-6 lg:mx-12 lg:pt-8">
          <p className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
            &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
          </p>
        </div>
      </div>
    </m.div>
  );
}

/**
 * 加入购物车按钮组件
 */
function AddToCartButton({
  productId,
  stock,
  quantity,
}: {
  productId: string;
  stock: number;
  quantity: number;
}) {
  const [loading, setLoading] = useState(false);
  const { user, openLoginModal } = useAuth();
  const { success, error: showError } = useToast();
  const { addToCart } = useCartStore();

  const handleAddToCart = async () => {
    if (!user) {
      openLoginModal();
      return;
    }

    if (stock <= 0) {
      showError("商品已售罄");
      return;
    }

    setLoading(true);
    try {
      const result = await addToCart(productId, quantity);
      if (result) {
        success("已加入购物车");
      } else {
        showError("添加失败，请重试");
      }
    } catch {
      showError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = stock <= 0;

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={loading || isOutOfStock}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-light tracking-[0.12em] transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "bg-brand-primary text-white hover:bg-brand-primary/90"
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ShoppingCart className="h-4 w-4" />
      )}
      <span>{isOutOfStock ? "已售罄" : "加入购物车"}</span>
    </button>
  );
}

/**
 * 直接购买按钮组件 - 不经购物车直接结算
 */
function DirectBuyButton({
  productId,
  stock,
  quantity,
}: {
  productId: string;
  stock: number;
  quantity: number;
}) {
  const [loading, setLoading] = useState(false);
  const { user, openCheckout, openLoginModal } = useAuth();
  const { error: showError } = useToast();

  const handleDirectBuy = () => {
    if (!user) {
      openLoginModal();
      return;
    }

    if (stock <= 0) {
      showError("商品已售罄");
      return;
    }

    if (quantity > stock) {
      showError(`库存不足，仅剩 ${stock} 件`);
      return;
    }

    setLoading(true);
    try {
      openCheckout([productId], { [productId]: quantity });
    } catch {
      showError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = stock <= 0;

  return (
    <button
      type="button"
      onClick={handleDirectBuy}
      disabled={loading || isOutOfStock}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-light tracking-[0.12em] transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "border border-brand-primary text-brand-primary hover:bg-brand-primary/10"
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ShoppingCart className="h-4 w-4" />
      )}
      <span>{isOutOfStock ? "已售罄" : "直接购买"}</span>
    </button>
  );
}

/**
 * 数量选择器组件
 */
function QuantitySelector({
  stock,
  quantity,
  onChange,
}: {
  stock: number;
  quantity: number;
  onChange: (q: number) => void;
}) {
  const handleDecrease = () => {
    if (quantity > 1) onChange(quantity - 1);
  };
  const handleIncrease = () => {
    if (quantity < stock) onChange(quantity + 1);
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= stock) {
      onChange(val);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-light text-brand-charcoal/60">数量</span>
      <div className="flex items-center rounded-lg border border-brand-beige bg-[#FBF8F0]">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={quantity <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-l-lg text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          max={stock}
          value={quantity}
          onChange={handleInputChange}
          className="h-9 w-12 border-x border-brand-beige bg-transparent text-center text-sm text-brand-charcoal outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={handleIncrease}
          disabled={quantity >= stock}
          className="flex h-9 w-9 items-center justify-center rounded-r-lg text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
      <span className="text-xs text-brand-charcoal/40">库存 {stock} 件</span>
    </div>
  );
}
