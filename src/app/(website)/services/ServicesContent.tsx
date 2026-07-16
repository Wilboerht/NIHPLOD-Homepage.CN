"use client";

import { useState } from "react";
import { BackToHome } from "@/components/ui/BackToHome";
import Link from "next/link";
import Image from "next/image";
import { Crown, ShieldCheck, Users, ScanFace, ExternalLink } from "lucide-react";
import type { ServicesPageContent } from "@/types/page-content";

interface ServicesContentProps {
  content: ServicesPageContent;
}

const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B";

function VipIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return <Crown className={className} stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR} strokeWidth="1.6" />;
}

function AuthIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return <ShieldCheck className={className} stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR} strokeWidth="1.6" />;
}

function InfluencerIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return <Users className={className} stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR} strokeWidth="1.6" />;
}

function AdvisorIcon({ className, isHovered }: { className?: string; isHovered?: boolean }) {
  return <ScanFace className={className} stroke={isHovered ? ICON_HOVER_COLOR : ICON_COLOR} strokeWidth="1.6" />;
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

  const advisorService = {
    id: "advisor",
    label: "测肤平台",
    title: "AI 素颜测肤智能平台",
    description: "通过 AI 技术分析面部肌肤状况，获取个性化护肤建议及产品推荐。",
    links: [{ label: "立即体验", url: "https://advisor.nihplod.cn", isAdmin: false, description: "" }],
  };

  const services = [...cmsServices, advisorService];

  return (
    <div className="bg-[#fefcf8] min-h-screen flex flex-col">
      {/* Header Section */}
      <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16 pt-16 md:pt-24 pb-8 md:pb-12">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-normal text-zinc-900">
            {pageTitle.zh}
          </h1>
        </div>
      </div>

      {/* Services Grid - centered vertically */}
      <div className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 gap-8 sm:gap-12 lg:grid-cols-4 place-items-center">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Page Footer */}
      <footer className="border-t border-zinc-200">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16 py-10 text-center">
          <p className="text-xs text-zinc-500 tracking-wide">
            &copy; {new Date().getFullYear()} 旎柏（上海）商贸有限公司 版权所有
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <Link
              href="https://beian.miit.gov.cn/"
              target="_blank"
              className="hover:text-zinc-600 transition-colors"
            >
              沪ICP备2026014764号-1
            </Link>
            <span className="text-zinc-300">|</span>
            <Link
              href="http://www.beian.gov.cn/portal/registerSystemInfo"
              target="_blank"
              className="inline-flex items-center gap-1 hover:text-zinc-600 transition-colors"
            >
              <Image
                src="/images/beian.webp"
                alt="公安备案"
                width={12}
                height={12}
                className="opacity-60"
              />
              <span>沪公网安备31010702010178号</span>
            </Link>
            <span className="text-zinc-300">|</span>
            <Link
              href="https://wap.scjgj.sh.gov.cn/businessCheck/verifKey.do?showType=extShow&serial=YOUR_SERIAL&signData=YOUR_SIGN_DATA"
              target="_blank"
              className="inline-flex items-center gap-1 hover:text-zinc-600 transition-colors"
            >
              <Image
                src="/images/aic_icon.png"
                alt="电子营业执照"
                width={12}
                height={12}
                className="opacity-50"
              />
              <span>电子营业执照</span>
            </Link>
          </div>
        </div>
      </footer>

      <BackToHome />
    </div>
  );
}

function ServiceCard({ service }: { service: any }) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getServiceIcon(service.id);
  const isDisabled = service.id === "vip" || service.id === "influencer";
  const targetLink = service.links?.find((l: any) => !l.isAdmin) || service.links?.[0];

  return (
    <Link
      href={isDisabled || !targetLink ? "#" : (targetLink?.url || "#")}
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
      <span className={`text-sm font-medium transition-colors duration-300 ${
        isHovered ? "text-zinc-900" : "text-[#00263E]"
      }`}>
        {service.label}
      </span>
    </Link>
  );
}
