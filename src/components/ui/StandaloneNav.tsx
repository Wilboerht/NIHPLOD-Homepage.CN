"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Home, BookOpen } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";

/**
 * 独立子页面（terms/privacy 等）的通用顶部导航栏。
 * 移动端：居中 Logo + 左侧汉堡菜单 → 滑入面板
 * 桌面端：左侧 Logo + 右侧导航链接
 */
interface NavLink {
  href: string;
  label: string;
}

interface StandaloneNavProps {
  title?: string;
  links?: NavLink[];
  leftButton?: { label: string; onClick: () => void };
}

export function StandaloneNav({ title, links = [], leftButton }: StandaloneNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("click", handleClick);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const navLinks = [
    { href: "/products", label: "产品系列" },
    { href: "/guide", label: "护肤指南" },
    { href: "/about", label: "品牌故事" },
    { href: "/faq", label: "常见问题" },
  ];

  return (
    <>
      <nav
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-6 backdrop-blur-md md:px-20"
        aria-label="主导航"
      >
        <div className="relative flex w-full items-center justify-center md:justify-between">
          {/* Logo + Page Title */}
          <div className="flex items-center gap-4">
            <Link href="/" className="relative shrink-0">
              <div className="relative h-[30px] w-[107px] md:h-[40px] md:w-[143px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-center md:object-left"
                  priority
                />
              </div>
            </Link>
            {title && (
              <>
                <div className="h-5 w-px bg-[#00263E]/20 md:h-6" />
                <span className="text-[13px] font-light tracking-[0.15em] text-[#00263E]/60 md:text-[15px]">
                  {title}
                </span>
              </>
            )}
          </div>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {links.length > 0 ? (
              links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
                >
                  {link.label}
                  <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
                </Link>
              ))
            ) : (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
                  >
                    {link.label}
                    <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
                  </Link>
                ))}
              </>
            )}
            <Link
              href="/"
              className="group relative inline-flex items-center gap-1.5 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              <Home className="h-4 w-4" /> 返回首页
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
          </div>

          {/* Mobile left button (e.g. TOC) */}
          {leftButton && (
            <button
              type="button"
              onClick={leftButton.onClick}
              className="absolute right-0 flex h-10 w-10 items-center justify-center md:hidden"
              aria-label={leftButton.label}
            >
              <BookOpen className="h-5 w-5 text-[#00263E]" strokeWidth={1.5} />
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="absolute left-0 flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5 text-[#00263E]" />
          </button>
        </div>
      </nav>

      {/* Mobile slide-in panel */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm md:hidden"
            />
            <m.div
              ref={panelRef}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: [0.8, 0, 0.13, 1] }}
              className="fixed bottom-0 left-0 top-0 z-[70] w-[min(300px,80vw)] rounded-r-3xl bg-[#fefcf8] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="导航菜单"
            >
              <div className="flex h-full flex-col px-6">
                {/* Logo + 关闭按钮同行 */}
                <div className="mb-8 flex items-center justify-between rounded-xl px-4 py-4">
                  <Link href="/" onClick={() => setMobileOpen(false)}>
                    <div className="relative h-[30px] w-[107px]">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD"
                        fill
                        className="object-contain object-left"
                      />
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                    aria-label="关闭菜单"
                  >
                    <X className="h-5 w-5 text-[#00263E]" strokeWidth={1.5} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(links.length > 0 ? links : navLinks).map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-[#00263E] transition-colors active:bg-brand-charcoal/5"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <Link
                  href="/products"
                  onClick={() => setMobileOpen(false)}
                  className="mt-8 flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-[#00263E] transition-colors active:bg-brand-charcoal/5"
                >
                  <Home className="h-5 w-5" />
                  返回产品页
                </Link>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
