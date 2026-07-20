"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Crown, ShieldCheck, Users, ScanFace, Home, Menu, X } from "lucide-react";
import type { ServicesPageContent, ServiceDetail, ServiceLink } from "@/types/page-content";

interface ServicesContentProps {
  content: ServicesPageContent;
}

const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B";

function VipIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return (
    <Crown
      className={className}
      stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR}
      strokeWidth="1.6"
    />
  );
}

function AuthIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return (
    <ShieldCheck
      className={className}
      stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR}
      strokeWidth="1.6"
    />
  );
}

function InfluencerIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return (
    <Users
      className={className}
      stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR}
      strokeWidth="1.6"
    />
  );
}

function AdvisorIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return (
    <ScanFace
      className={className}
      stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR}
      strokeWidth="1.6"
    />
  );
}

const iconMap: Record<string, React.FC<{ className?: string; isHovered?: boolean }>> = {
  vip: VipIcon,
  auth: AuthIcon,
  influencer: InfluencerIcon,
  advisor: AdvisorIcon,
};

function getServiceIcon(serviceId: string) {
  return iconMap[serviceId] || VipIcon;
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex min-h-screen animate-fade-in flex-col bg-[#fefcf8]">
      {/* Top Bar */}
      <nav
        aria-label="服务页导航"
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-3 backdrop-blur-md md:px-20 md:py-6"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="relative flex w-full items-center justify-center md:justify-between"
          style={{ pointerEvents: "auto" }}
        >
          <Link href="/">
            <div className="relative h-[30px] w-[130px] md:h-[40px] md:w-[160px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain object-center md:object-left"
                priority
              />
            </div>
          </Link>

          <div className="hidden items-center gap-10 md:flex">
            <Link
              href="/contact"
              className="text-sm tracking-wider text-[#00263E] transition-colors hover:text-brand-charcoal-light"
            >
              联系我们
            </Link>
            <Link
              href="/terms"
              className="text-sm tracking-wider text-[#00263E] transition-colors hover:text-brand-charcoal-light"
            >
              服务条款
            </Link>
            <Link
              href="/privacy"
              className="text-sm tracking-wider text-[#00263E] transition-colors hover:text-brand-charcoal-light"
            >
              隐私政策
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm tracking-wider text-[#00263E] transition-colors hover:text-brand-charcoal-light"
            >
              <Home className="h-3.5 w-3.5" /> 返回首页
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
            <Menu className="h-5 w-5 text-[#00263E]" />
          </button>
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
          className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#FBF8F0] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col px-6">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="mb-8 flex h-10 w-10 items-center justify-center self-end rounded-full transition-colors hover:bg-brand-charcoal/5"
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5 text-[#00263E]" strokeWidth={1.5} />
            </button>

            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="mb-10">
              <div className="relative h-[30px] w-[130px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-center md:object-left"
                />
              </div>
            </Link>

            <div className="flex flex-col gap-2">
              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                联系我们
              </Link>
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                服务条款
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                隐私政策
              </Link>
            </div>

            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-auto flex items-center gap-2 rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
            >
              <Home className="h-5 w-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>

      {/* Spacer for fixed navbar */}
      <div className="h-[62px] shrink-0 md:h-[88px]" />

      {/* Services Grid - centered vertically */}
      <main className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-4 text-3xl font-light tracking-wider text-[#00263E] md:text-4xl">
          {pageTitle.zh}
        </h1>
        <p className="mb-12 text-sm text-zinc-500 md:mb-16 md:text-base">
          NIHPLOD 旎柏以卓越品质与全方位服务，为您呈献逆转时光的奢华体验
        </p>
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-2 place-items-center gap-8 sm:gap-12 lg:grid-cols-4">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="border-t border-brand-charcoal/10">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 lg:px-12 xl:px-16">
          <p className="text-xs tracking-wider text-brand-charcoal/50">
            &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceDetail }) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getServiceIcon(service.id);
  const isDisabled = service.id === "vip" || service.id === "influencer";
  const targetLink = service.links?.find((l: ServiceLink) => !l.isAdmin) || service.links?.[0];

  return (
    <Link
      href={isDisabled || !targetLink ? "#" : targetLink?.url || "#"}
      target={isDisabled ? undefined : "_blank"}
      rel={isDisabled ? undefined : "noopener noreferrer"}
      onClick={(e) => isDisabled && e.preventDefault()}
      onMouseEnter={() => !isDisabled && setIsHovered(true)}
      onMouseLeave={() => !isDisabled && setIsHovered(false)}
      className={`group flex flex-col items-center justify-center gap-3 p-6 transition-colors duration-300 ${
        isDisabled ? "cursor-not-allowed opacity-40 grayscale" : "hover:bg-white/50"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24">
        <Icon className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16" isHovered={isHovered} />
      </div>
      <span className="text-sm font-medium text-[#00263E]">{service.label}</span>
    </Link>
  );
}
