"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { Crown, ShieldCheck, Users, ScanFace, Smartphone, Home, Menu, X, ChevronDown } from "lucide-react";
import type { ServicesPageContent, ServiceDetail, ServiceLink } from "@/types/page-content";

interface ServicesContentProps {
  content: ServicesPageContent;
}

const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B";
const ICON_MOBILE_COLOR = "rgba(0, 38, 62, 0.35)";

function DefaultIcon({
  className,
  isHovered,
  color,
}: {
  className?: string;
  isHovered?: boolean;
  color?: string;
}) {
  return (
    <Crown
      className={className}
      stroke={color || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR)}
      strokeWidth="1.6"
    />
  );
}

function AuthIcon({
  className,
  isHovered,
  color,
}: {
  className?: string;
  isHovered?: boolean;
  color?: string;
}) {
  return (
    <ShieldCheck
      className={className}
      stroke={color || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR)}
      strokeWidth="1.6"
    />
  );
}

function InfluencerIcon({
  className,
  isHovered,
  color,
}: {
  className?: string;
  isHovered?: boolean;
  color?: string;
}) {
  return (
    <Users
      className={className}
      stroke={color || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR)}
      strokeWidth="1.6"
    />
  );
}

function AdvisorIcon({
  className,
  isHovered,
  color,
}: {
  className?: string;
  isHovered?: boolean;
  color?: string;
}) {
  return (
    <ScanFace
      className={className}
      stroke={color || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR)}
      strokeWidth="1.6"
    />
  );
}

function MiniProgramIcon({
  className,
  isHovered,
  color,
}: {
  className?: string;
  isHovered?: boolean;
  color?: string;
}) {
  return (
    <Smartphone
      className={className}
      stroke={color || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR)}
      strokeWidth="1.6"
    />
  );
}

const iconMap: Record<
  string,
  React.FC<{ className?: string; isHovered?: boolean; color?: string }>
> = {
  auth: AuthIcon,
  influencer: InfluencerIcon,
  advisor: AdvisorIcon,
  miniprogram: MiniProgramIcon,
};

// 未上线服务：置灰禁用（达人平台、微信小程序）
function isServiceDisabled(id: string): boolean {
  return id === "influencer" || id === "miniprogram";
}

export function ServicesContent({ content }: ServicesContentProps) {
  const pageTitle = content.pageTitle || { en: "SERVICES", zh: "服务入口" };
  const cmsServices = content.services || [];

  const advisorService: ServiceDetail = {
    id: "advisor",
    label: "素颜测肤",
    title: "AI 素颜测肤智能平台",
    nameEn: "AI Skin Advisor",
    description: "通过 AI 技术分析面部肌肤状况，获取个性化护肤建议及产品推荐。",
    links: [
      { label: "立即体验", url: "https://advisor.nihplod.cn", isAdmin: false, description: "" },
    ],
  };

  const services = [...cmsServices, advisorService];
  // 移动端列表：素颜测肤插在授权验真之前（PC 端网格仍用 services 原顺序）
  const authIdx = cmsServices.findIndex((s) => s.id === "auth");
  const mobileServices =
    authIdx >= 0
      ? [
          ...cmsServices.slice(0, authIdx),
          advisorService,
          ...cmsServices.slice(authIdx),
        ]
      : services;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target as Node)) {
        setDesktopMenuOpen(false);
      }
    };
    if (desktopMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [desktopMenuOpen]);

  return (
    <div className="mb-[-7rem] flex min-h-dvh animate-fade-in flex-col bg-[#fefcf8] lg:mb-[-6rem]">
      {/* Top Bar */}
      <nav
        aria-label="服务页导航"
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-6 backdrop-blur-md md:px-20"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="relative flex w-full items-center justify-center md:justify-between"
          style={{ pointerEvents: "auto" }}
        >
          <Link href="/">
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

          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/contact"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              联系我们
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
            <Link
              href="/terms"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              服务条款
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
            <Link
              href="/privacy"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              隐私政策
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>

            {/* Desktop More Menu */}
            <div ref={desktopMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setDesktopMenuOpen((prev) => !prev)}
                className="group inline-flex items-center gap-1.5 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
                aria-expanded={desktopMenuOpen}
              >
                菜单
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-500 ${desktopMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {desktopMenuOpen && (
                  <m.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-brand-charcoal/5 bg-[#FBF8F0] p-2 shadow-[0_2px_4px_-1px_rgba(0,38,62,0.05),0_8px_16px_-2px_rgba(0,38,62,0.08),0_24px_48px_-6px_rgba(0,38,62,0.06)]"
                  >
                    <Link
                      href="/products"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      产品系列
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/guide"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      护肤指南
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/faq"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      常见问题
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/about"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                    >
                      品牌故事
                    </Link>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/"
              className="group relative inline-flex items-center gap-2 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              <Home className="h-4 w-4" /> 返回首页
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-brand-charcoal/5 md:hidden"
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="services-nav-panel"
          >
            <Menu className="h-5 w-5 text-brand-charcoal" />
          </button>

          {/* 手机端返回首页按钮 - 与左侧菜单镜像 */}
          <Link
            href="/"
            className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5 md:hidden"
            aria-label="返回首页"
          >
            <Home className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
          </Link>
        </div>
      </nav>

      <div
        id="services-nav-panel"
        ref={mobileMenuRef}
        role="dialog"
        aria-modal={mobileMenuOpen}
        aria-label="导航菜单"
        className={`fixed inset-0 z-[100] transition-all duration-500 md:hidden ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-[#00263E]/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#fefcf8] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col px-6">
            {/* Logo + 关闭按钮同行 */}
            <div className="mb-8 flex items-center justify-between rounded-xl px-4 py-4">
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
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
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                联系我们
              </Link>
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                服务条款
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                隐私政策
              </Link>
            </div>

            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-8 flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
            >
              <Home className="h-5 w-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>

      {/* Spacer for fixed navbar */}
      <div className="h-[88px] shrink-0 md:h-[88px]" />

      {/* Services Grid - centered vertically */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 md:px-0">
        <h1 className="mb-2 text-[19px] font-normal tracking-[0.15em] text-brand-charcoal md:mb-4 md:text-4xl md:font-light md:tracking-wider">
          {pageTitle.zh}
        </h1>
        <div className="mb-4 w-[70px] border-b border-brand-primary md:hidden" />
        <p className="mb-10 text-center text-[13px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/60 md:mb-16 md:text-base md:leading-normal md:tracking-[0.12em]">
          NIHPLOD 旎柏以卓越品质与全方位服务，
          <br className="md:hidden" />
          为您呈献逆转时光的奢华体验
        </p>
        <div className="container mx-auto px-0 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-4xl">
            {/* 移动端列表 - 已开放在上，未开放在下 */}
            <div className="flex flex-col divide-y divide-brand-charcoal/[0.06] md:hidden">
              {[...mobileServices]
                .sort((a, b) => {
                  return Number(isServiceDisabled(a.id)) - Number(isServiceDisabled(b.id));
                })
                .map((service, index) => (
                  <ServiceListItem key={service.id} service={service} index={index} />
                ))}
            </div>
            {/* PC端网格 */}
            <div className="hidden grid-cols-2 place-items-center gap-12 md:grid lg:grid-cols-4">
              {services.map((service, index) => (
                <ServiceCard key={service.id} service={service} index={index} />
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="md:border-t md:border-brand-charcoal/10">
        <div className="mx-auto overflow-visible px-6 py-6 text-center md:px-8 lg:px-12 xl:px-16">
          <div className="flex items-center justify-center gap-3">
            <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </span>
            <span className="text-[11px] font-light text-brand-charcoal/20">|</span>
            {/* 移动端：点击弹出模态框 */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] transition-colors active:text-brand-charcoal/70 md:hidden"
            >
              服务号
            </button>
            {/* PC端：hover 显示 */}
            <div className="group relative hidden cursor-pointer md:inline-flex">
              <span className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48] transition-colors group-hover:text-brand-charcoal/70">
                服务号
              </span>
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={160}
                height={160}
                unoptimized
                className="absolute bottom-full left-1/2 z-50 mb-2 hidden h-auto w-40 -translate-x-1/2 rounded-lg bg-white p-2 shadow-lg group-hover:block"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* 移动端二维码模态框 */}
      <AnimatePresence>
        {qrModalOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-charcoal/30 backdrop-blur-sm md:hidden"
            onClick={() => setQrModalOpen(false)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="mx-6 flex flex-col items-center rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={200}
                height={200}
                unoptimized
                className="h-[200px] w-[200px] rounded-lg"
              />
              <p className="mt-4 text-[13px] font-light tracking-[0.06em] text-brand-charcoal/60">
                扫码关注 NIHPLOD 服务号
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="mt-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭"
              >
                <X className="h-4 w-4 text-brand-charcoal/40" strokeWidth={1.5} />
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FreeTag() {
  return (
    <span className="shrink-0 rounded-full bg-[#B8A47B] px-2 py-0.5 text-[10px] font-normal tracking-[0.12em] text-[#FBF8F0]">
      free
    </span>
  );
}

function ServiceListItem({ service, index }: { service: ServiceDetail; index: number }) {
  // 直查模块级 iconMap，避免渲染期经函数调用获取组件类型
  const Icon = iconMap[service.id] || DefaultIcon;
  const isDisabled = isServiceDisabled(service.id);
  const targetLink = service.links?.find((l: ServiceLink) => !l.isAdmin) || service.links?.[0];

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.4, 0, 0.2, 1] }}
    >
      <Link
        href={isDisabled || !targetLink ? "#" : targetLink?.url || "#"}
        target={isDisabled ? undefined : "_blank"}
        rel={isDisabled ? undefined : "noopener noreferrer"}
        onClick={(e) => isDisabled && e.preventDefault()}
        className={`flex items-center gap-4 px-2 py-5 transition-all duration-200 active:scale-[0.98] active:bg-brand-charcoal/[0.03] ${
          isDisabled ? "cursor-not-allowed opacity-40 grayscale" : ""
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <Icon className="h-7 w-7" isHovered={false} color={ICON_MOBILE_COLOR} />
        </div>
        <span className="text-[14px] font-light tracking-[0.08em] text-brand-charcoal">
          {service.label}
        </span>
        {service.id === "advisor" && <FreeTag />}
        {!isDisabled && (
          <ChevronDown className="ml-auto h-4 w-4 -rotate-90 text-brand-charcoal/30" />
        )}
      </Link>
    </m.div>
  );
}

function ServiceCard({ service, index }: { service: ServiceDetail; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = iconMap[service.id] || DefaultIcon;
  const isDisabled = isServiceDisabled(service.id);
  const targetLink = service.links?.find((l: ServiceLink) => !l.isAdmin) || service.links?.[0];

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
      className="w-full"
    >
      <Link
        href={isDisabled || !targetLink ? "#" : targetLink?.url || "#"}
        target={isDisabled ? undefined : "_blank"}
        rel={isDisabled ? undefined : "noopener noreferrer"}
        onClick={(e) => isDisabled && e.preventDefault()}
        onMouseEnter={() => !isDisabled && setIsHovered(true)}
        onMouseLeave={() => !isDisabled && setIsHovered(false)}
        className={`group flex flex-col items-center justify-center gap-2 p-4 transition-all duration-300 active:scale-[0.97] active:bg-brand-charcoal/[0.03] md:gap-3 md:p-6 ${
          isDisabled ? "cursor-not-allowed opacity-40 grayscale" : "hover:bg-white/50"
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24">
          <Icon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16" isHovered={isHovered} />
        </div>
        <span className="flex items-center gap-2 text-[13px] font-light tracking-[0.08em] text-brand-charcoal md:text-[15px] md:tracking-[0.15em]">
          {service.label}
          {service.id === "advisor" && <FreeTag />}
        </span>
      </Link>
    </m.div>
  );
}
