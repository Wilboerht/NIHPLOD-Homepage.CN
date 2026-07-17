"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Crown, ShieldCheck, Users, ScanFace, Home } from "lucide-react";
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

  return (
    <div className="flex min-h-screen animate-fade-in flex-col bg-[#fefcf8]">
      {/* Top Bar */}
      <nav
        aria-label="服务页导航"
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center justify-between bg-[#fefcf8]/80 px-6 py-3 backdrop-blur-md md:px-20 md:py-6"
      >
        <Link href="/">
          <div className="relative h-[30px] w-[130px] md:h-[40px] md:w-[160px]">
            <Image
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
        </Link>
        <div className="flex items-center gap-6 md:gap-10">
          <Link href="/contact" className="text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">
            联系我们
          </Link>
          <Link href="/terms" className="text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">
            服务条款
          </Link>
          <Link href="/privacy" className="text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">
            隐私政策
          </Link>
          <Link href="/" className="inline-flex items-center gap-1 text-sm tracking-wider text-[#00263E] hover:text-brand-charcoal-light transition-colors">
            <Home className="h-3.5 w-3.5" /> 返回首页
          </Link>
        </div>
      </nav>

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
          <p className="text-xs text-brand-charcoal/50 tracking-wider">
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
