"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m } from "framer-motion";
import {
  ChevronLeft,
  ExternalLink,
  ShoppingCart,
  Loader2,
  Home,
} from "lucide-react";
import { ProductCard } from "@/components/website";
import { cn, formatPrice } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
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
export function ProductDetailContent({
  product,
  relatedProducts,
}: ProductDetailContentProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [quantity, setQuantity] = useState(1);

  const currentImage = product.images[currentImageIndex];

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

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="safe-area-content !pointer-events-none max-lg:!inset-0"
      >
        <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
          {/* 主内容卡片容器 */}
          <div className="w-full flex-1 overflow-hidden rounded-none lg:rounded-3xl bg-[#F0EDE1] lg:bg-[#F8F7F3] pointer-events-auto relative">
            {/* 手机端背景水印 */}
            <div className="lg:hidden absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <Image
                src="/images/watermark-mobile.svg"
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

            <div className="relative z-10 flex h-full flex-col p-4 sm:p-6 lg:p-8">
              {/* 顶栏 / Logo 区 */}
              <header className="flex-shrink-0 text-center sm:px-4 sm:pt-2 sm:pb-6 lg:pt-4 lg:pb-8">
                {/* 手机端顶部栏 */}
                <div className="lg:hidden relative flex-shrink-0 h-[88px] w-full flex items-center justify-center pointer-events-auto">
                  <button
                    onClick={() =>
                      typeof window !== "undefined" && window.history.back()
                    }
                    className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                  >
                    <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                  </button>
                  <Link
                    href="/"
                    className="flex items-center justify-center py-[30px]"
                  >
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
                  className="hidden lg:flex justify-center"
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
              <div className="hidden lg:block mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

              {/* 内容区域 */}
              <div className="flex-1 relative min-h-0">
                <main className="h-full overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <div className="pb-12">
                    {/* 图片轮播区域 + 指示器 */}
                    <div className="mx-4 md:m-0 md:mx-auto w-[calc(100%-2rem)] md:w-full max-w-4xl">
                      <m.div
                        className="relative aspect-[3/4] bg-brand-beige/30 lg:aspect-[16/9] w-full rounded-2xl overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4 }}
                      >
                        {currentImage && (
                          <Image
                            src={currentImage.url}
                            alt={currentImage.alt || product.name}
                            fill
                            priority
                            className="object-cover"
                            sizes="100vw"
                          />
                        )}
                      </m.div>

                      {/* 图片指示器 */}
                      {product.images.length > 0 && (
                        <div className="flex gap-2 justify-center mt-7">
                          {product.images.map((_, index) => (
                            <div
                              key={index}
                              className={cn(
                                "h-[2px] w-8 transition-all duration-300",
                                currentImageIndex === index
                                  ? "bg-[#00263E]"
                                  : "bg-[#00263E]/20"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 产品信息 */}
                    <m.div
                      className="mx-auto max-w-2xl px-6 pt-7 pb-0 max-lg:px-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                      {/* 产品名称 + 容量 */}
                      <div className="flex items-end justify-between">
                        <h1 className="font-serif text-[20px] sm:text-[24px] lg:text-[28px] text-brand-charcoal max-lg:text-[#00263E] max-lg:font-medium max-lg:tracking-[0.2em]">
                          {product.name}
                        </h1>
                        {product.capacity && (
                          <span className="text-sm font-light text-[#00263E]/60 shrink-0 ml-3">
                            {product.capacity}
                          </span>
                        )}
                      </div>

                      {/* 价格 */}
                      <p className="mt-2 text-[18px] font-medium text-brand-charcoal max-lg:text-[#00263E]">
                        {formatPrice(product.price)}
                      </p>

                      {/* 功效标签 */}
                      {product.benefits.length > 0 && (
                        <div className="mt-6 hidden lg:flex flex-wrap gap-2">
                          {product.benefits.map((benefit, index) => (
                            <span
                              key={index}
                              className="rounded-full border border-brand-beige bg-brand-cream px-3 py-1 text-[14px] font-light text-[#00263E]"
                            >
                              {benefit}
                            </span>
                          ))}
                        </div>
                      )}

                    </m.div>

                    {/* 购买按钮区域 */}
                    <div className="mx-auto max-w-2xl px-6 py-7 max-lg:px-4">
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

                        {/* 外部购买链接 - 多平台优先 */}
                        {product.purchaseLinks &&
                        product.purchaseLinks.length > 0 ? (
                          product.purchaseLinks.map((link) => (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors",
                                product.allowDirectBuy
                                  ? "border border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                                  : "bg-brand-gold text-white hover:bg-brand-gold/90"
                              )}
                            >
                              <span>{link.platform}</span>
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ))
                        ) : product.purchaseUrl ? (
                          <a
                            href={product.purchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors",
                              product.allowDirectBuy
                                ? "border border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                                : "bg-brand-gold text-white hover:bg-brand-gold/90"
                            )}
                          >
                            <span>
                              {product.allowDirectBuy
                                ? "其他购买渠道"
                                : "立即购买"}
                            </span>
                            <ExternalLink className="h-4 w-4" />
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

                    {/* Tab 区域 */}
                    <div className="mx-auto max-w-2xl px-6 pb-7 max-lg:px-4">
                      {/* Tab 切换 */}
                      <div className="mt-8 border-b border-brand-beige">
                        <div className="flex gap-6" role="tablist">
                          {tabs.map((tab) => (
                            <div
                              key={tab.key}
                              role="tab"
                              aria-selected={activeTab === tab.key}
                              onClick={() => setActiveTab(tab.key)}
                              className={cn(
                                "relative pb-3 text-[13px] font-normal transition-colors cursor-pointer",
                                activeTab === tab.key
                                  ? "text-brand-charcoal"
                                  : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                              )}
                            >
                              {tab.label}
                              {activeTab === tab.key && (
                                <m.div
                                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold"
                                  layoutId="tab-indicator"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tab 内容 */}
                      <div className="mt-6">
                        {tabs.map((tab) => (
                          <div
                            key={tab.key}
                            className={cn(
                              "transition-opacity duration-300",
                              activeTab === tab.key
                                ? "block opacity-100"
                                : "hidden opacity-0"
                            )}
                          >
                            {tabContent[tab.key] ? (
                              <p className="whitespace-pre-line text-[14px] font-light leading-[1.8] tracking-wide text-[#00263e]/90 text-justify">
                                {tabContent[tab.key]}
                              </p>
                            ) : (
                              <p className="text-[14px] font-light text-[#00263e]/40">
                                暂无内容
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 相关产品推荐 */}
                    {relatedProducts.length > 0 && (
                      <div className="mt-8 border-t border-brand-beige pt-8 max-w-4xl mx-auto w-full px-6 max-lg:px-4">
                        <h2 className="mb-6 text-center font-serif text-xl max-lg:font-medium max-lg:tracking-[0.2em] text-brand-charcoal max-lg:text-[#00263E]">
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
              <div className="mt-auto pt-4 pb-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12 max-lg:border-0 max-lg:pt-4">
                <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[#7B726C]/30 max-lg:tracking-[0.12em] max-lg:font-medium">
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights
                  Reserved.
                </p>
              </div>
            </div>
          </div>

          {/* 返回首页按钮 - 仅桌面端 */}
          <Link
            href="/"
            className="hidden lg:flex group items-center justify-center gap-2 rounded-b-2xl bg-[#F8F7F3] px-10 py-2.5 lg:px-14 lg:py-3 pointer-events-auto"
          >
            <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
            <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">
              返回首页
            </span>
          </Link>
        </div>
      </m.div>
    </>
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
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "bg-brand-gold text-white hover:bg-brand-gold/90"
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
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "border border-brand-gold text-brand-gold hover:bg-brand-gold/10"
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
      <span className="text-sm text-brand-charcoal/60">数量</span>
      <div className="flex items-center rounded-lg border border-brand-beige bg-brand-cream">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={quantity <= 1}
          className="flex h-9 w-9 items-center justify-center text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30 rounded-l-lg"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          max={stock}
          value={quantity}
          onChange={handleInputChange}
          className="h-9 w-12 border-x border-brand-beige bg-transparent text-center text-sm text-brand-charcoal outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={handleIncrease}
          disabled={quantity >= stock}
          className="flex h-9 w-9 items-center justify-center text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30 rounded-r-lg"
        >
          +
        </button>
      </div>
      <span className="text-xs text-brand-charcoal/40">库存 {stock} 件</span>
    </div>
  );
}
