"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { sanitizeHtml } from "@/lib/html-sanitize";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import { ChevronLeft, ChevronRight, ShoppingBag, Loader2 } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { XiaohongshuLink } from "@/components/website";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useCartStore } from "@/store/cart";
import { getPlatformIcon } from "./PlatformIcons";

/**
 * 购买链接类型
 */
interface PurchaseLink {
  id: string;
  platform: string;
  url: string;
}

/**
 * 产品数据类型
 */
interface ProductData {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity?: string;
  purchaseUrl?: string;
  purchaseLinks?: PurchaseLink[];
  images: { url: string; alt?: string }[];
  category: { name: string };
  ingredients?: string;
  usage?: string;
  benefits: string[];
  allowDirectBuy?: boolean;
  stock?: number;
}

interface ProductDrawerProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 产品数据 */
  product: ProductData | null;
  /** 未登录时触发，由父组件决定重定向方式（如 SSO 登录后恢复抽屉） */
  onAuthRequired?: (productId: string, action: "addToCart" | "directBuy") => void;
}

/**
 * 平台图标组件
 * 每个平台 Logo 的视觉重量不同，需要单独调整大小以保持视觉平衡
 */
export function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.trim();
  if (p.includes("天猫") || p.toLowerCase().includes("tmall")) {
    return <>{getPlatformIcon("tmall")}</>;
  }
  if (
    p.includes("小红书") ||
    p.toLowerCase().includes("xiaohongshu") ||
    p.toLowerCase().includes("xhs")
  ) {
    return <>{getPlatformIcon("xiaohongshu")}</>;
  }
  if (
    p.includes("抖音") ||
    p.toLowerCase().includes("douyin") ||
    p.toLowerCase().includes("tiktok")
  ) {
    return <>{getPlatformIcon("douyin")}</>;
  }
  return <ShoppingBag className="h-4 w-4" />;
}

/**
 * 产品详情全屏弹窗组件
 * 基于 Products Page.html 设计
 * 功能：
 * - 全屏从下滑入动画
 * - ESC 键关闭
 * - 锁定背景滚动
 * - 左右分栏布局
 */
export function ProductDrawer({ isOpen, onClose, product, onAuthRequired }: ProductDrawerProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"description" | "ingredients" | "usage">(
    "description"
  );

  const [purchaseMenuOpen, setPurchaseMenuOpen] = useState(false);
  const purchaseMenuRef = useRef<HTMLDivElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);

  // 切换 Tab 时重置滚动位置
  const handleTabChange = (tab: "description" | "ingredients" | "usage") => {
    setActiveTab(tab);
    if (mobileContentRef.current) {
      mobileContentRef.current.scrollTop = 0;
    }
  };

  // 点击外部关闭购买菜单
  useEffect(() => {
    if (!purchaseMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (purchaseMenuRef.current && !purchaseMenuRef.current.contains(e.target as Node)) {
        setPurchaseMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [purchaseMenuOpen]);

  // 手风琴切换
  const toggleAccordion = (id: string) => {
    setOpenAccordion(openAccordion === id ? null : id);
  };

  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  // 锁定背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // 关闭时重置状态（渲染阶段同步，避免 effect 内 setState）
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setCurrentImageIndex(0);
      setOpenAccordion(null);
      setPurchaseMenuOpen(false);
      setActiveTab("description");
    }
  }

  // 切换图片
  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) => (prev === 0 ? product.images.length - 1 : prev - 1));
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) => (prev === product.images.length - 1 ? 0 : prev + 1));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && product && (
        <>
          <div
            className="fixed inset-0 z-[210] flex items-center justify-center lg:p-6"
            onClick={onClose}
          >
            {/* 遮罩层 */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-[#FFFFFF] lg:bg-black/40 lg:backdrop-blur-sm"
            />
            <m.div
              className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-none bg-transparent shadow-2xl lg:h-[700px] lg:flex-row lg:rounded-3xl lg:bg-[#FBF8F0]"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 z-[220] hidden h-8 w-8 items-center justify-center text-2xl font-light text-brand-charcoal transition-opacity hover:opacity-60 lg:right-6 lg:top-6 lg:flex"
                aria-label="关闭"
              >
                &times;
              </button>

              {/* 手机端背景水印 */}
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden lg:hidden">
                <Image
                  src="/images/watermark-mobile.webp"
                  alt=""
                  fill
                  className="object-cover opacity-75 blur-[7.5px]"
                  sizes="100vw"
                />
              </div>

              {/* 手机端顶部栏 */}
              <div className="relative flex h-[88px] w-full flex-shrink-0 items-center justify-center lg:hidden">
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute bottom-0 left-0 top-0 flex items-center justify-center px-4 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-brand-charcoal" />
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

              {/* 左侧 - 产品图片区域 */}
              <div className="relative mx-4 h-[50%] max-h-[45vh] w-[calc(100%-2rem)] flex-shrink-0 self-center overflow-hidden rounded-2xl lg:mx-0 lg:h-full lg:max-h-none lg:w-[45%] lg:self-auto lg:rounded-none">
                <AnimatePresence mode="wait">
                  {product.images[currentImageIndex] ? (
                    <m.div
                      key={currentImageIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={product.images[currentImageIndex].url}
                        alt={product.images[currentImageIndex].alt || product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        quality={90}
                        priority
                      />
                    </m.div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-brand-charcoal/30">
                      <span className="text-sm">暂无图片</span>
                    </div>
                  )}
                </AnimatePresence>

                {/* 左右切换按钮 */}
                {product.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevImage}
                      className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-charcoal/50 transition-all hover:text-brand-charcoal lg:left-4"
                    >
                      <ChevronLeft className="h-6 w-6 lg:h-8 lg:w-8" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-charcoal/50 transition-all hover:text-brand-charcoal lg:right-4"
                    >
                      <ChevronRight className="h-6 w-6 lg:h-8 lg:w-8" />
                    </button>
                  </>
                )}

                {/* 图片指示器 */}
                {product.images.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 lg:bottom-6">
                    {product.images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          "h-[2px] rounded-full border-none p-0 transition-all duration-300",
                          currentImageIndex === index ? "w-5 bg-white" : "w-2 bg-white/40"
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 右侧 - 产品信息区域 */}
              <div className="flex-1 overflow-hidden lg:overflow-y-auto lg:px-10 lg:py-10">
                {/* PC 端内容 */}
                <div className="hidden h-full lg:block">
                  <div className="max-w-none">
                    {/* 基本信息 */}
                    <section className="mb-8">
                      <h2 className="mb-3 text-2xl font-bold leading-tight text-brand-charcoal lg:text-3xl">
                        {product.name}
                      </h2>
                      <div className="mb-3 text-xs tracking-wide text-brand-charcoal/50">
                        规格: {product.capacity || "N/A"} | 产地: 法国
                      </div>
                      <div className="text-lg font-medium text-brand-charcoal">
                        {formatPrice(product.price)}
                      </div>
                    </section>

                    {/* 描述 */}
                    <section className="mb-8">
                      <div
                        className="text-justify text-[15px] leading-[1.8] text-brand-charcoal/70"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(product.description),
                        }}
                      />
                    </section>

                    {/* 小红书链接 */}
                    <section className="mb-8">
                      <XiaohongshuLink categoryName={product.category.name} />
                    </section>

                    {/* 折叠面板 */}
                    <section className="border-t border-brand-charcoal/10">
                      {product.ingredients && (
                        <div className="border-b border-brand-charcoal/10">
                          <button
                            type="button"
                            onClick={() => toggleAccordion("ingredients")}
                            className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-[15px] font-semibold uppercase tracking-wider text-brand-charcoal"
                          >
                            <span>主要成分</span>
                            <span
                              className={cn(
                                "text-[18px] transition-transform duration-200",
                                openAccordion === "ingredients" && "rotate-45"
                              )}
                            >
                              +
                            </span>
                          </button>
                          <AnimatePresence>
                            {openAccordion === "ingredients" && (
                              <m.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div
                                  className="pb-4 text-[15px] leading-[1.8] text-brand-charcoal/60"
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizeHtml(product.ingredients),
                                  }}
                                />
                              </m.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {product.usage && (
                        <div className="border-b border-brand-charcoal/10">
                          <button
                            type="button"
                            onClick={() => toggleAccordion("usage")}
                            className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-[15px] font-semibold uppercase tracking-wider text-brand-charcoal"
                          >
                            <span>使用方法</span>
                            <span
                              className={cn(
                                "text-[18px] transition-transform duration-200",
                                openAccordion === "usage" && "rotate-45"
                              )}
                            >
                              +
                            </span>
                          </button>
                          <AnimatePresence>
                            {openAccordion === "usage" && (
                              <m.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div
                                  className="pb-4 text-[15px] leading-[1.8] text-brand-charcoal/60"
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizeHtml(product.usage),
                                  }}
                                />
                              </m.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* 官方旗舰店 */}
                      <div className="py-4">
                        <div className="mb-4 text-[15px] font-semibold text-brand-charcoal">
                          官方旗舰店
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          {product.allowDirectBuy && product.stock !== undefined && (
                            <div className="relative" ref={purchaseMenuRef}>
                              <button
                                type="button"
                                onClick={() => setPurchaseMenuOpen(!purchaseMenuOpen)}
                                className="flex items-center gap-2 rounded-lg border border-brand-primary bg-transparent px-4 py-2 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary/10"
                              >
                                <ShoppingBag className="h-4 w-4" />
                                官网购买
                                <span
                                  className={cn(
                                    "ml-1 text-xs transition-transform",
                                    purchaseMenuOpen ? "rotate-180" : ""
                                  )}
                                >
                                  ▼
                                </span>
                              </button>

                              {purchaseMenuOpen && (
                                <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/5">
                                  <DrawerAddToCartButton
                                    productId={product.id}
                                    stock={product.stock!}
                                    quantity={1}
                                    onClose={onClose}
                                    onAuthRequired={onAuthRequired}
                                    compact
                                  />
                                  <div className="my-1.5 border-t border-brand-charcoal/5" />
                                  <DrawerDirectBuyButton
                                    productId={product.id}
                                    stock={product.stock!}
                                    quantity={1}
                                    onClose={onClose}
                                    onAuthRequired={onAuthRequired}
                                    compact
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {product.purchaseLinks && product.purchaseLinks.length > 0
                            ? product.purchaseLinks.map((link) => (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="transition-opacity hover:opacity-60"
                                >
                                  <PlatformIcon platform={link.platform} />
                                </a>
                              ))
                            : !product.allowDirectBuy && (
                                <span className="text-[14px] text-brand-charcoal/50">
                                  暂无购买链接
                                </span>
                              )}
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                {/* 手机端内容 */}
                <div
                  ref={mobileContentRef}
                  className="flex h-full flex-col overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
                >
                  {/* 标题与规格 */}
                  <div className="mb-1 flex items-start justify-between">
                    <h2 className="text-xl font-medium text-brand-charcoal">{product.name}</h2>
                    <span className="mt-0.5 text-sm text-brand-charcoal/60">
                      {product.capacity || "N/A"}
                    </span>
                  </div>

                  {/* 价格与产地 */}
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-lg font-medium text-brand-charcoal">
                      {formatPrice(product.price)}
                    </span>
                    <span className="text-xs text-brand-charcoal/50">产地：法国</span>
                  </div>

                  {/* Tab 切换 */}
                  <div className="relative z-40 mb-4 shrink-0">
                    <nav className="flex h-[37px] items-center rounded-full bg-[#FFFFFF] p-[4px]">
                      <button
                        type="button"
                        onClick={() => handleTabChange("description")}
                        className={cn(
                          "relative flex flex-1 items-center justify-center whitespace-nowrap text-[13px] font-normal leading-[20px] transition-all duration-300",
                          activeTab === "description"
                            ? "text-brand-charcoal"
                            : "text-[#4A6272]/60 hover:text-[#4A6272]/80"
                        )}
                        style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                      >
                        <span
                          className={cn(
                            activeTab === "description"
                              ? "rounded-full bg-white px-2 py-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                              : ""
                          )}
                        >
                          产品简介
                        </span>
                      </button>
                      {product.ingredients && (
                        <button
                          type="button"
                          onClick={() => handleTabChange("ingredients")}
                          className={cn(
                            "relative flex flex-1 items-center justify-center whitespace-nowrap text-[13px] font-normal leading-[20px] transition-all duration-300",
                            activeTab === "ingredients"
                              ? "text-brand-charcoal"
                              : "text-[#4A6272]/60 hover:text-[#4A6272]/80"
                          )}
                          style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                        >
                          <span
                            className={cn(
                              activeTab === "ingredients"
                                ? "rounded-full bg-white px-2 py-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                                : ""
                            )}
                          >
                            主要成分
                          </span>
                        </button>
                      )}
                      {product.usage && (
                        <button
                          type="button"
                          onClick={() => handleTabChange("usage")}
                          className={cn(
                            "relative flex flex-1 items-center justify-center whitespace-nowrap text-[13px] font-normal leading-[20px] transition-all duration-300",
                            activeTab === "usage"
                              ? "text-brand-charcoal"
                              : "text-[#4A6272]/60 hover:text-[#4A6272]/80"
                          )}
                          style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                        >
                          <span
                            className={cn(
                              activeTab === "usage"
                                ? "rounded-full bg-white px-2 py-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                                : ""
                            )}
                          >
                            使用方法
                          </span>
                        </button>
                      )}
                    </nav>
                  </div>

                  {/* Tab 内容 */}
                  <div className="flex-1">
                    {activeTab === "description" && (
                      <>
                        <div
                          className="mb-4 text-[13px] leading-[1.8] text-brand-charcoal/70"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(product.description),
                          }}
                        />
                        <XiaohongshuLink categoryName={product.category.name} />
                      </>
                    )}
                    {activeTab === "ingredients" &&
                      (product.ingredients ? (
                        <div
                          className="text-[13px] leading-[1.8] text-brand-charcoal/70"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(product.ingredients),
                          }}
                        />
                      ) : (
                        <p className="py-4 text-[13px] text-brand-charcoal/40">暂无成分信息</p>
                      ))}
                    {activeTab === "usage" &&
                      (product.usage ? (
                        <div
                          className="text-[13px] leading-[1.8] text-brand-charcoal/70"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.usage) }}
                        />
                      ) : (
                        <p className="py-4 text-[13px] text-brand-charcoal/40">暂无使用方法</p>
                      ))}
                  </div>

                  {/* 购买渠道 */}
                  <div className="mt-6">
                    <div className="flex flex-wrap gap-2">
                      {product.allowDirectBuy && product.stock !== undefined && (
                        <div className="relative" ref={purchaseMenuRef}>
                          <button
                            type="button"
                            onClick={() => setPurchaseMenuOpen(!purchaseMenuOpen)}
                            className="flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-3 py-1.5 text-[12px] text-brand-charcoal"
                          >
                            <span className="font-medium">NIHPLOD</span>
                          </button>
                          {purchaseMenuOpen && (
                            <div className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/5">
                              <DrawerAddToCartButton
                                productId={product.id}
                                stock={product.stock!}
                                quantity={1}
                                onClose={onClose}
                                onAuthRequired={onAuthRequired}
                                compact
                              />
                              <div className="my-1.5 border-t border-brand-charcoal/5" />
                              <DrawerDirectBuyButton
                                productId={product.id}
                                stock={product.stock!}
                                quantity={1}
                                onClose={onClose}
                                onAuthRequired={onAuthRequired}
                                compact
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {product.purchaseLinks &&
                        product.purchaseLinks.length > 0 &&
                        product.purchaseLinks.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-3 py-1.5 text-[12px] text-brand-charcoal"
                          >
                            <PlatformIcon platform={link.platform} />
                            <span>{link.platform}</span>
                          </a>
                        ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-8 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(0,38,62,0.3)]">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>
                </div>
              </div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * 加入购物车按钮（ProductDrawer 专用）
 */
function DrawerAddToCartButton({
  productId,
  stock,
  quantity,
  compact,
  onClose,
  onAuthRequired,
}: {
  productId: string;
  stock: number;
  quantity: number;
  compact?: boolean;
  onClose?: () => void;
  onAuthRequired?: (productId: string, action: "addToCart" | "directBuy") => void;
}) {
  const [loading, setLoading] = useState(false);
  const { user, redirectToLogin } = useAuth();
  const { success, error: showError } = useToast();
  const { addToCart } = useCartStore();

  const handleAddToCart = async () => {
    if (!user) {
      if (onAuthRequired) {
        onAuthRequired(productId, "addToCart");
        return;
      }
      redirectToLogin();
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
        onClose?.();
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
        "flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
        compact ? "flex-1 py-2 text-sm" : "w-full py-3",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "bg-brand-primary text-white hover:bg-brand-primary/90"
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
      <span>{isOutOfStock ? "已售罄" : "加入购物车"}</span>
    </button>
  );
}

/**
 * 直接购买按钮（ProductDrawer 专用）
 */
function DrawerDirectBuyButton({
  productId,
  stock,
  quantity,
  compact,
  onClose,
  onAuthRequired,
}: {
  productId: string;
  stock: number;
  quantity: number;
  compact?: boolean;
  onClose?: () => void;
  onAuthRequired?: (productId: string, action: "addToCart" | "directBuy") => void;
}) {
  const [loading, setLoading] = useState(false);
  const { user, openCheckout, redirectToLogin } = useAuth();
  const { error: showError } = useToast();

  const handleDirectBuy = () => {
    if (!user) {
      if (onAuthRequired) {
        onAuthRequired(productId, "directBuy");
        return;
      }
      redirectToLogin();
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
      onClose?.();
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
        "flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
        compact ? "flex-1 py-2 text-sm" : "w-full py-3",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "border border-brand-primary text-brand-primary hover:bg-brand-primary/10"
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
      <span>{isOutOfStock ? "已售罄" : "直接购买"}</span>
    </button>
  );
}

/**
 * 数量选择器组件（ProductDrawer 专用）
 */
export type { ProductData, ProductDrawerProps };
