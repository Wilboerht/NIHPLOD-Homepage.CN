"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 导航菜单项配置
 */
const navItems = [
  { href: "/products", label: "产品系列" },
  { href: "/story", label: "品牌故事" },
  { href: "/ritual", label: "护肤仪式" },
  { href: "/contact", label: "联系我们" },
  { href: "/careers", label: "加入我们" },
];

// 默认 Logo
const DEFAULT_LOGO = "/images/logo.png";

interface HeaderProps {
  /** 自定义 Logo URL (从设置获取) */
  logo?: string;
}

/**
 * 前台导航栏组件（底部固定）
 * 功能：
 * - Logo 点击返回首页
 * - 桌面端导航菜单（高亮当前页）
 * - 移动端汉堡菜单（点击展开/收起，动画流畅）
 * - AI 顾问入口（醒目 CTA 按钮）
 */
export function Header({ logo }: HeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Logo URL，优先使用传入的，否则使用默认
  const logoUrl = logo || DEFAULT_LOGO;

  // 客户端挂载后才执行
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 路由变化时关闭菜单
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // 菜单打开时禁止 body 滚动
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  /**
   * 检查链接是否为当前页面
   */
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // advisor 页面不显示导航栏
  const isAdvisorPage = pathname.startsWith("/advisor");
  if (isAdvisorPage) {
    return null;
  }

  // products 页面使用自己的导航栏（在 ProductsContent 中）
  const isProductsPage = pathname === "/products";
  if (isProductsPage) {
    return null;
  }

  // story 页面使用自己的导航栏（在 StoryContent 中）
  const isStoryPage = pathname === "/story";
  if (isStoryPage) {
    return null;
  }

  // ritual 页面使用自己的导航栏（在 RitualContent 中）
  const isRitualPage = pathname === "/ritual";
  if (isRitualPage) {
    return null;
  }

  // contact 页面使用自己的导航栏（在 ContactContent 中）
  const isContactPage = pathname === "/contact";
  if (isContactPage) {
    return null;
  }

  // careers 页面使用自己的导航栏（在 CareersContent 中）
  const isCareersPage = pathname === "/careers";
  if (isCareersPage) {
    return null;
  }

  // privacy 页面使用自己的导航栏（在 PrivacyContent 中）
  const isPrivacyPage = pathname === "/privacy";
  if (isPrivacyPage) {
    return null;
  }

  /**
   * 切换汉堡菜单
   */
  const toggleMenu = () => setIsMenuOpen((prev) => !prev);

  return (
    <>
      {/* Header 占位高度（底部） */}
      <div className="h-16 lg:h-20" />

      {/* 移动端菜单遮罩层 */}
      {isMounted && (
        <AnimatePresence>
          {isMenuOpen && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMenuOpen(false)}
            />
          )}
        </AnimatePresence>
      )}

      {/* 移动端抽屉菜单（从底部向上展开） */}
      {isMounted && (
        <AnimatePresence>
          {isMenuOpen && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed bottom-16 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-lg lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="导航菜单"
            >
              <nav className="container-wide px-s py-4" aria-label="移动端导航">
                <ul className="flex flex-col" role="list">
                  {navItems.map((item, index) => (
                    <m.li
                      key={item.href}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center border-b border-brand-beige/50 py-4 text-base font-medium transition-colors",
                          isActive(item.href)
                            ? "text-brand-gold"
                            : "text-brand-charcoal hover:text-brand-gold"
                        )}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {item.label}
                        {isActive(item.href) && (
                          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-brand-gold" />
                        )}
                      </Link>
                    </m.li>
                  ))}
                </ul>
              </nav>
            </m.div>
          )}
        </AnimatePresence>
      )}

      {/* 底部导航栏 */}
      <header
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-beige bg-white/95 backdrop-blur-md"
        role="banner"
      >
        <nav className="container-wide px-s" aria-label="主导航">
          <div className="flex h-16 items-center justify-between lg:h-20">
            {/* 移动端：汉堡菜单按钮 */}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-brand-charcoal transition-colors hover:bg-brand-beige/50 lg:hidden"
              onClick={toggleMenu}
              aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
              aria-expanded={isMenuOpen}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMenuOpen ? (
                  <m.div
                    key="close"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="h-6 w-6" />
                  </m.div>
                ) : (
                  <m.div
                    key="menu"
                    initial={{ opacity: 0, rotate: 90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: -90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="h-6 w-6" />
                  </m.div>
                )}
              </AnimatePresence>
            </button>

            {/* Logo */}
            <Link
              href="/"
              className={cn(
                "transition-opacity hover:opacity-80",
                // 移动端居中
                "absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0"
              )}
            >
              <Image
                src={logoUrl}
                alt="NIHPLOD"
                width={120}
                height={32}
                className="h-7 w-auto lg:h-8"
                priority
              />
            </Link>

            {/* 桌面端导航菜单 */}
            <ul className="hidden items-center gap-8 lg:flex" role="list">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "relative py-2 text-sm font-medium tracking-wide transition-colors",
                      isActive(item.href)
                        ? "text-brand-gold"
                        : "text-brand-charcoal hover:text-brand-gold"
                    )}
                  >
                    {item.label}
                    {/* 当前页高亮上划线 */}
                    {isActive(item.href) && (
                      <m.div
                        layoutId="nav-underline"
                        className="absolute -top-1 left-0 right-0 h-0.5 bg-brand-gold"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            {/* AI 护肤顾问入口 CTA */}
            <Link
              href="/advisor"
              className={cn(
                "group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                "bg-brand-gold text-white shadow-md hover:bg-brand-gold/90 hover:shadow-lg",
                "lg:px-5 lg:py-2.5"
              )}
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span className="hidden sm:inline">AI护肤顾问</span>
              <span className="sm:hidden">AI顾问</span>
            </Link>

            {/* 回到首页按钮 */}
            <Link
              href="/"
              className={cn(
                "group flex items-center justify-center rounded-full p-2 transition-all duration-300",
                "hover:bg-brand-beige/50",
                "lg:p-2.5"
              )}
              aria-label="返回首页"
            >
              <Home className="h-5 w-5 text-brand-gold transition-transform group-hover:scale-110 lg:h-6 lg:w-6" />
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
