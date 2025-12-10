"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { Home, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 自定义图标组件 - 支持 hover 状态
const VipIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M17.6455 3.83496C17.8543 3.85866 18.0468 3.96395 18.1797 4.12988L21.8838 8.75977C22.1211 9.0565 22.1171 9.47948 21.874 9.77148L12.6143 20.8828C12.4624 21.0648 12.2371 21.1708 12 21.1709C11.7627 21.1708 11.5367 21.0651 11.3848 20.8828L2.12598 9.77148C1.88275 9.47961 1.87819 9.0566 2.11523 8.75977L5.81934 4.12988L5.87988 4.0625C6.02881 3.91442 6.2319 3.83017 6.44434 3.83008H17.5557L17.6455 3.83496ZM17.0156 9.21094C16.7068 8.95371 16.2476 8.99602 15.9902 9.30469L11.999 14.0928L8.00977 9.30469C7.75249 8.99611 7.29317 8.95399 6.98438 9.21094C6.67567 9.46819 6.63365 9.92749 6.89062 10.2363L11.4404 15.6963C11.5787 15.8622 11.784 15.958 12 15.958C12.2158 15.9579 12.4204 15.862 12.5586 15.6963L17.1084 10.2363C17.3656 9.92749 17.3244 9.46825 17.0156 9.21094Z" fill={color}/>
    </svg>
  );
};

const WebsiteIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7.90137 17.7627C8.05522 18.3374 8.23149 18.8751 8.42871 19.3682C8.81289 20.3286 9.29026 21.1597 9.86133 21.7637C9.86354 21.766 9.86595 21.7682 9.86816 21.7705C8.19712 21.4076 6.68306 20.6275 5.43848 19.5439C5.45731 19.5283 5.47648 19.5127 5.49414 19.4951C6.19408 18.7952 7.00677 18.2088 7.90137 17.7627ZM16.0977 17.7627C16.9923 18.2088 17.8048 18.7951 18.5049 19.4951C18.5225 19.5127 18.5408 19.5293 18.5596 19.5449C17.3151 20.628 15.8016 21.4078 14.1309 21.7705C14.1332 21.768 14.1363 21.7662 14.1387 21.7637C14.7097 21.1597 15.1871 20.3286 15.5713 19.3682C15.7685 18.8752 15.9438 18.3373 16.0977 17.7627ZM12 16.7998C12.9025 16.7998 13.7738 16.9326 14.5977 17.1748C14.4488 17.7579 14.2779 18.2945 14.0859 18.7744C13.7464 19.6232 13.3614 20.256 12.9756 20.6641C12.5913 21.0704 12.2614 21.2002 12 21.2002C11.7386 21.2002 11.4087 21.0704 11.0244 20.6641C10.6386 20.256 10.2536 19.6232 9.91406 18.7744C9.72209 18.2945 9.55023 17.758 9.40137 17.1748C10.2256 16.9324 11.0972 16.7998 12 16.7998ZM7.21387 12.7998C7.25007 13.9804 7.36449 15.1118 7.54883 16.1602C6.35566 16.7007 5.27706 17.4495 4.36328 18.3633C4.349 18.3776 4.33524 18.3922 4.32227 18.4072C3.0328 16.8635 2.20222 14.9253 2.03418 12.7998H7.21387ZM21.9658 12.7998C21.7978 14.9255 20.9664 16.8634 19.6768 18.4072C19.6639 18.3923 19.6509 18.3774 19.6367 18.3633C18.7227 17.4493 17.6438 16.7007 16.4502 16.1602C16.6346 15.1118 16.7499 13.9804 16.7861 12.7998H21.9658ZM15.1855 12.7998C15.1532 13.7886 15.0622 14.7301 14.9219 15.6025C13.9924 15.3419 13.0126 15.2002 12 15.2002C10.987 15.2002 10.007 15.3416 9.07715 15.6025C8.93682 14.7301 8.84677 13.7885 8.81445 12.7998H15.1855ZM19.6758 5.5918C20.9661 7.13547 21.7963 9.07423 21.9648 11.2002H16.7861C16.7499 10.0188 16.6338 8.88685 16.4492 7.83789C17.643 7.29729 18.7226 6.54988 19.6367 5.63574C19.6507 5.62176 19.6631 5.60653 19.6758 5.5918ZM4.36328 5.63574C5.27718 6.54964 6.35647 7.29731 7.5498 7.83789C7.36526 8.88681 7.25009 10.0189 7.21387 11.2002H2.03516C2.20364 9.07445 3.03314 7.13539 4.32324 5.5918C4.33609 5.60669 4.34915 5.6216 4.36328 5.63574ZM14.9209 8.39551C15.0614 9.26855 15.1532 10.2106 15.1855 11.2002H8.81445C8.8468 10.2107 8.93761 9.26851 9.07812 8.39551C10.0078 8.6563 10.9873 8.79881 12 8.79883C13.0123 8.79881 13.9916 8.65608 14.9209 8.39551ZM12 2.7998C12.2614 2.7998 12.5913 2.92957 12.9756 3.33594C13.3614 3.74396 13.7464 4.37679 14.0859 5.22559C14.2778 5.7052 14.4489 6.24144 14.5977 6.82422C13.7738 7.06629 12.9025 7.1992 12 7.19922C11.0972 7.1992 10.2256 7.06644 9.40137 6.82422C9.55017 6.24134 9.72219 5.70526 9.91406 5.22559C10.2536 4.37679 10.6386 3.74396 11.0244 3.33594C11.4087 2.92957 11.7386 2.7998 12 2.7998ZM9.86133 2.23633C9.29026 2.8403 8.81289 3.6714 8.42871 4.63184C8.2316 5.12463 8.05517 5.66201 7.90137 6.23633C7.00687 5.79044 6.19402 5.20477 5.49414 4.50488C5.47667 4.48742 5.45807 4.47157 5.43945 4.45605C6.68334 3.37354 8.19651 2.59342 9.86621 2.23047C9.86446 2.23231 9.86307 2.23448 9.86133 2.23633ZM14.1328 2.23047C15.8022 2.59318 17.3148 3.37308 18.5586 4.45508C18.54 4.47057 18.5223 4.48745 18.5049 4.50488C17.805 5.20471 16.9921 5.78947 16.0977 6.23535C15.9439 5.66147 15.7683 5.1243 15.5713 4.63184C15.1871 3.6714 14.7097 2.8403 14.1387 2.23633C14.1368 2.23432 14.1347 2.23247 14.1328 2.23047Z" fill={color}/>
    </svg>
  );
};

const InfluencerIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M9.5 10C11.433 10 13 8.433 13 6.5C13 4.56701 11.433 3 9.5 3C7.567 3 6 4.56701 6 6.5C6 8.433 7.567 10 9.5 10Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.304 3.5C17.3204 4.11245 18.0002 5.22685 18.0002 6.5C18.0002 7.77315 17.3204 8.88755 16.304 9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 17.7573V20H17V17.7573C17 17.456 16.9366 17.155 16.7605 16.9105C15.9629 15.8034 13.7511 14 9.5 14C5.24886 14 3.03712 15.8034 2.23955 16.9105C2.06344 17.155 2 17.456 2 17.7573Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.5 15.0781C20.6406 15.6602 21.3695 16.3685 21.7599 16.9102C21.9361 17.1546 21.9999 17.4564 21.9999 17.7576V20.0004H20" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// 用户端图标 - 组合样式（填充+描边），与 InfluencerIcon 保持一致
const UsersIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M9.5 10C11.433 10 13 8.433 13 6.5C13 4.56701 11.433 3 9.5 3C7.567 3 6 4.56701 6 6.5C6 8.433 7.567 10 9.5 10Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.304 3.5C17.3204 4.11245 18.0002 5.22685 18.0002 6.5C18.0002 7.77315 17.3204 8.88755 16.304 9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 17.7573V20H17V17.7573C17 17.456 16.9366 17.155 16.7605 16.9105C15.9629 15.8034 13.7511 14 9.5 14C5.24886 14 3.03712 15.8034 2.23955 16.9105C2.06344 17.155 2 17.456 2 17.7573Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.5 15.0781C20.6406 15.6602 21.3695 16.3685 21.7599 16.9102C21.9361 17.1546 21.9999 17.4564 21.9999 17.7576V20.0004H20" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// 管理端图标 - 组合样式（填充+描边）
const LockIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7 11.4609V7.46094C7 4.69951 9.2386 2.46094 12 2.46094C14.7614 2.46094 17 4.69951 17 7.46094V11.4609" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.5576 9.33203C20.7011 9.33217 21.5029 10.3082 21.5029 11.3506V20.5186C21.5029 21.561 20.7012 22.537 19.5576 22.5371H4.44238C3.29889 22.5369 2.49805 21.561 2.49805 20.5186V11.3506C2.4981 10.3082 3.29893 9.33223 4.44238 9.33203H19.5576ZM12 14.0654C11.5582 14.0654 11.2002 14.4234 11.2002 14.8652V18.8652C11.2002 19.3071 11.5582 19.665 12 19.665C12.4418 19.665 12.7998 19.3071 12.7998 18.8652V14.8652C12.7998 14.4234 12.4418 14.0654 12 14.0654Z" fill={color}/>
    </svg>
  );
};

// 标签页配置
type ServiceId = "vip" | "website" | "influencer";

interface ServiceConfig {
  id: ServiceId;
  label: string;
  icon: React.FC<{ className?: string; isHovered?: boolean }>;
}

const services: ServiceConfig[] = [
  { id: "vip", label: "会员系统", icon: VipIcon },
  { id: "website", label: "官方网站", icon: WebsiteIcon },
  { id: "influencer", label: "达人平台", icon: InfluencerIcon },
];

// 各服务详细信息
interface ServiceDetail {
  title: string;
  nameEn: string;
  description: string;
  links: Array<{ label: string; url: string; isAdmin: boolean; description: string }>;
}

const serviceDetails: Record<ServiceId, ServiceDetail> = {
  vip: {
    title: "旎柏会员系统",
    nameEn: "VIP System",
    description: "会员积分、权益管理与专属服务平台，为尊贵会员提供积分查询、等级权益、专属优惠等服务。",
    links: [
      { label: "用户端", url: "https://vip.nihplod.cn", isAdmin: false, description: "会员登录、积分查询、权益兑换" },
      { label: "管理端", url: "https://adminvip.nihplod.cn", isAdmin: true, description: "会员管理、积分发放、活动配置" },
    ],
  },
  website: {
    title: "官方网站",
    nameEn: "Official Website",
    description: "NIHPLOD 旎柏品牌官方网站，展示品牌故事、产品系列、护肤仪式等内容。",
    links: [
      { label: "用户端", url: "https://nihplod.cn", isAdmin: false, description: "品牌展示、产品浏览、AI护肤顾问" },
      { label: "管理端", url: "https://nihplod.cn/admin", isAdmin: true, description: "内容管理、产品管理、数据分析" },
    ],
  },
  influencer: {
    title: "达人合作平台",
    nameEn: "Influencer Platform",
    description: "KOL/KOC合作平台，提供达人招募、内容共创、合作管理等功能。",
    links: [
      { label: "用户端", url: "https://influencer.nihplod.cn", isAdmin: false, description: "达人注册、合作申请、任务领取" },
      { label: "管理端", url: "https://admininfluencer.nihplod.cn", isAdmin: true, description: "达人审核、任务发布、数据统计" },
    ],
  },
};

// Tab 按钮组件 - 支持 hover 状态
const ServiceButton = ({
  service,
  index,
  isLast,
  onClick
}: {
  service: ServiceConfig;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = service.icon;

  return (
    <m.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
        !isLast && "border-r border-brand-charcoal/20"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
        <Icon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" isHovered={isHovered} />
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
        isHovered ? "text-brand-charcoal" : "text-brand-charcoal/70"
      )}>
        {service.label}
      </span>
    </m.button>
  );
};

// 服务链接按钮组件 - 用户端/管理端按钮
const ServiceLinkButton = ({
  link,
  index,
  isLast,
}: {
  link: { label: string; url: string; isAdmin: boolean; description: string };
  index: number;
  isLast: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <m.a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 transition-all duration-300 sm:gap-4 sm:px-8 sm:py-10 md:py-12",
        !isLast && "border-r border-brand-charcoal/20"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.08, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
        {link.isAdmin ? (
          <LockIcon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" isHovered={isHovered} />
        ) : (
          <UsersIcon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" isHovered={isHovered} />
        )}
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <span className={cn(
            "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
            isHovered ? "text-brand-charcoal" : "text-brand-charcoal/70"
          )}>
            {link.label}
          </span>
          {link.isAdmin && (
            <span className="rounded bg-brand-charcoal/10 px-1.5 py-0.5 text-[10px] text-brand-charcoal/70 sm:text-xs">
              需授权
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-brand-charcoal/50 sm:text-sm">
          {link.description}
        </p>
      </div>
    </m.a>
  );
};

/**
 * 服务入口页面内容组件
 * 样式参考 PrivacyContent
 */
export function ServicesContent() {
  const [activeService, setActiveService] = useState<ServiceId | null>(null);

  return (
    <>
      {/* 全屏背景容器 - 始终展开到底部 */}
      <div className="fixed inset-0 bottom-0">
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/bg.png"
            alt="服务入口"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 主内容区域 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute bottom-4 left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16 lg:top-6"
        >
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl">
              <div className="flex h-full flex-col justify-center overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                {/* 页面标题 - 仅在未选中服务时显示 */}
                {!activeService && (
                  <div className="mb-6 text-center sm:mb-8">
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      SERVICE PORTAL
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      服务入口
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      快速访问 NIHPLOD 旎柏各服务系统
                    </p>
                  </div>
                )}

                {/* 内容区域 */}
                <AnimatePresence mode="wait">
                  {!activeService && (
                    <m.div
                      key="services"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex flex-col items-center"
                    >
                      {/* Logo */}
                      <m.div
                        className="mb-8 flex justify-center sm:mb-10"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                      >
                        <div className="relative h-16 w-32 sm:h-20 sm:w-40 md:h-24 md:w-48">
                          <Image src="/images/logo.png" alt="NIHPLOD Logo" fill className="object-contain" />
                        </div>
                      </m.div>

                      {/* 3个大服务按钮 */}
                      <div className="flex w-full max-w-3xl items-stretch justify-center">
                        {services.map((service, index) => (
                          <ServiceButton
                            key={service.id}
                            service={service}
                            index={index}
                            isLast={index === services.length - 1}
                            onClick={() => setActiveService(service.id)}
                          />
                        ))}
                      </div>
                    </m.div>
                  )}

                  {/* 选中服务后显示的内容 */}
                  {activeService && (
                    <m.div
                      key={activeService}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex flex-col items-center"
                    >
                      {/* 返回按钮 - 居中显示 */}
                      <m.button
                        type="button"
                        onClick={() => setActiveService(null)}
                        className="mb-6 flex items-center gap-1.5 rounded-full border border-brand-charcoal/20 px-4 py-1.5 text-brand-charcoal/60 transition-all duration-300 hover:border-brand-charcoal/40 hover:text-brand-charcoal sm:mb-8 sm:px-5 sm:py-2"
                      >
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        <span className="text-xs sm:text-sm">返回服务列表</span>
                      </m.button>

                      {/* 标题区域 */}
                      <div className="mb-6 text-center sm:mb-8">
                        <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                          {serviceDetails[activeService].nameEn.toUpperCase()}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                          {serviceDetails[activeService].title}
                        </h2>
                        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base">
                          {serviceDetails[activeService].description}
                        </p>
                      </div>

                      {/* 两个大按钮：用户端 / 管理端 */}
                      <div className="flex w-full max-w-2xl items-stretch justify-center">
                        {serviceDetails[activeService].links.map((link, index) => (
                          <ServiceLinkButton
                            key={link.url}
                            link={link}
                            index={index}
                            isLast={index === serviceDetails[activeService].links.length - 1}
                          />
                        ))}
                      </div>

                      {/* 提示信息 */}
                      <m.div
                        className="mt-6 sm:mt-8"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <p className="text-center text-xs text-brand-charcoal/50 sm:text-sm">
                          <Shield className="mr-1 inline-block h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          管理端入口仅供授权人员访问，需要相应的账号权限
                        </p>
                      </m.div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 回到首页按钮 */}
            <Link
              href="/"
              className="group flex items-center justify-center gap-2 rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
              <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回首页</span>
            </Link>
          </div>
        </m.div>
      </div>
    </>
  );
}

