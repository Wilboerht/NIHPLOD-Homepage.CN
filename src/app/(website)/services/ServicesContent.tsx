"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m } from "framer-motion";
import { ChevronLeft, Home, ScanFace, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServicesPageContent, ServiceDetail as CMSServiceDetail } from "@/types/page-content";

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 自定义图标组件 - 支持 hover 状态及自定义颜色
const VipIcon = ({ className, isHovered, color: customColor }: { className?: string; isHovered?: boolean; color?: string }) => {
  const color = customColor || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR);
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M17.6455 3.83496C17.8543 3.85866 18.0468 3.96395 18.1797 4.12988L21.8838 8.75977C22.1211 9.0565 22.1171 9.47948 21.874 9.77148L12.6143 20.8828C12.4624 21.0648 12.2371 21.1708 12 21.1709C11.7627 21.1708 11.5367 21.0651 11.3848 20.8828L2.12598 9.77148C1.88275 9.47961 1.87819 9.0566 2.11523 8.75977L5.81934 4.12988L5.87988 4.0625C6.02881 3.91442 6.2319 3.83017 6.44434 3.83008H17.5557L17.6455 3.83496ZM17.0156 9.21094C16.7068 8.95371 16.2476 8.99602 15.9902 9.30469L11.999 14.0928L8.00977 9.30469C7.75249 8.99611 7.29317 8.95399 6.98438 9.21094C6.67567 9.46819 6.63365 9.92749 6.89062 10.2363L11.4404 15.6963C11.5787 15.8622 11.784 15.958 12 15.958C12.2158 15.9579 12.4204 15.862 12.5586 15.6963L17.1084 10.2363C17.3656 9.92749 17.3244 9.46825 17.0156 9.21094Z" fill={color} />
    </svg>
  );
};

const WebsiteIcon = ({ className, isHovered, color: customColor }: { className?: string; isHovered?: boolean; color?: string }) => {
  const color = customColor || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR);
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7.90137 17.7627C8.05522 18.3374 8.23149 18.8751 8.42871 19.3682C8.81289 20.3286 9.29026 21.1597 9.86133 21.7637C9.86354 21.766 9.86595 21.7682 9.86816 21.7705C8.19712 21.4076 6.68306 20.6275 5.43848 19.5439C5.45731 19.5283 5.47648 19.5127 5.49414 19.4951C6.19408 18.7952 7.00677 18.2088 7.90137 17.7627ZM16.0977 17.7627C16.9923 18.2088 17.8048 18.7951 18.5049 19.4951C18.5225 19.5127 18.5408 19.5293 18.5596 19.5449C17.3151 20.628 15.8016 21.4078 14.1309 21.7705C14.1332 21.768 14.1363 21.7662 14.1387 21.7637C14.7097 21.1597 15.1871 20.3286 15.5713 19.3682C15.7685 18.8752 15.9438 18.3373 16.0977 17.7627ZM12 16.7998C12.9025 16.7998 13.7738 16.9326 14.5977 17.1748C14.4488 17.7579 14.2779 18.2945 14.0859 18.7744C13.7464 19.6232 13.3614 20.256 12.9756 20.6641C12.5913 21.0704 12.2614 21.2002 12 21.2002C11.7386 21.2002 11.4087 21.0704 11.0244 20.6641C10.6386 20.256 10.2536 19.6232 9.91406 18.7744C9.72209 18.2945 9.55023 17.758 9.40137 17.1748C10.2256 16.9324 11.0972 16.7998 12 16.7998ZM7.21387 12.7998C7.25007 13.9804 7.36449 15.1118 7.54883 16.1602C6.35566 16.7007 5.27706 17.4495 4.36328 18.3633C4.349 18.3776 4.33524 18.3922 4.32227 18.4072C3.0328 16.8635 2.20222 14.9253 2.03418 12.7998H7.21387ZM21.9658 12.7998C21.7978 14.9255 20.9664 16.8634 19.6768 18.4072C19.6639 18.3923 19.6509 18.3774 19.6367 18.3633C18.7227 17.4493 17.6438 16.7007 16.4502 16.1602C16.6346 15.1118 16.7499 13.9804 16.7861 12.7998H21.9658ZM15.1855 12.7998C15.1532 13.7886 15.0622 14.7301 14.9219 15.6025C13.9924 15.3419 13.0126 15.2002 12 15.2002C10.987 15.2002 10.007 15.3416 9.07715 15.6025C8.93682 14.7301 8.84677 13.7885 8.81445 12.7998H15.1855ZM19.6758 5.5918C20.9661 7.13547 21.7963 9.07423 21.9648 11.2002H16.7861C16.7499 10.0188 16.6338 8.88685 16.4492 7.83789C17.643 7.29729 18.7226 6.54988 19.6367 5.63574C19.6507 5.62176 19.6631 5.60653 19.6758 5.5918ZM4.36328 5.63574C5.27718 6.54964 6.35647 7.29731 7.5498 7.83789C7.36526 8.88681 7.25009 10.0189 7.21387 11.2002H2.03516C2.20364 9.07445 3.03314 7.13539 4.32324 5.5918C4.33609 5.60669 4.34915 5.6216 4.36328 5.63574ZM14.9209 8.39551C15.0614 9.26855 15.1532 10.2106 15.1855 11.2002H8.81445C8.8468 10.2107 8.93761 9.26851 9.07812 8.39551C10.0078 8.6563 10.9873 8.79881 12 8.79883C13.0123 8.79881 13.9916 8.65608 14.9209 8.39551ZM12 2.7998C12.2614 2.7998 12.5913 2.92957 12.9756 3.33594C13.3614 3.74396 13.7464 4.37679 14.0859 5.22559C14.2778 5.7052 14.4489 6.24144 14.5977 6.82422C13.7738 7.06629 12.9025 7.1992 12 7.19922C11.0972 7.1992 10.2256 7.06644 9.40137 6.82422C9.55017 6.24134 9.72219 5.70526 9.91406 5.22559C10.2536 4.37679 10.6386 3.74396 11.0244 3.33594C11.4087 2.92957 11.7386 2.7998 12 2.7998ZM9.86133 2.23633C9.29026 2.8403 8.81289 3.6714 8.42871 4.63184C8.2316 5.12463 8.05517 5.66201 7.90137 6.23633C7.00687 5.79044 6.19402 5.20477 5.49414 4.50488C5.47667 4.48742 5.45807 4.47157 5.43945 4.45605C6.68334 3.37354 8.19651 2.59342 9.86621 2.23047C9.86446 2.23231 9.86307 2.23448 9.86133 2.23633ZM14.1328 2.23047C15.8022 2.59318 17.3148 3.37308 18.5586 4.45508C18.54 4.47057 18.5223 4.48745 18.5049 4.50488C17.805 5.20471 16.9921 5.78947 16.0977 6.23535C15.9439 5.66147 15.7683 5.1243 15.5713 4.63184C15.1871 3.6714 14.7097 2.8403 14.1387 2.23633C14.1368 2.23432 14.1347 2.23247 14.1328 2.23047Z" fill={color} />
    </svg>
  );
};

const InfluencerIcon = ({ className, isHovered, color: customColor }: { className?: string; isHovered?: boolean; color?: string }) => {
  const color = customColor || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR);
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M9.5 10C11.433 10 13 8.433 13 6.5C13 4.56701 11.433 3 9.5 3C7.567 3 6 4.56701 6 6.5C6 8.433 7.567 10 9.5 10Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.304 3.5C17.3204 4.11245 18.0002 5.22685 18.0002 6.5C18.0002 7.77315 17.3204 8.88755 16.304 9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 17.7573V20H17V17.7573C17 17.456 16.9366 17.155 16.7605 16.9105C15.9629 15.8034 13.7511 14 9.5 14C5.24886 14 3.03712 15.8034 2.23955 16.9105C2.06344 17.155 2 17.456 2 17.7573Z" fill={color} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 15.0781C20.6406 15.6602 21.3695 16.3685 21.7599 16.9102C21.9361 17.1546 21.9999 17.4564 21.9999 17.7576V20.0004H20" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};



// 授权验真图标
const AuthIcon = ({ className, isHovered, color: customColor }: { className?: string; isHovered?: boolean; color?: string }) => {
  const color = customColor || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR);
  return (
    <div className={cn("flex items-center justify-center transition-all duration-300", className)}>
      <ShieldCheck stroke={color} strokeWidth="1.6" className="h-full w-full" />
    </div>
  );
};

// 测肤图标
const AdvisorIcon = ({ className, isHovered, color: customColor }: { className?: string; isHovered?: boolean; color?: string }) => {
  const color = customColor || (isHovered ? ICON_HOVER_COLOR : ICON_COLOR);
  return (
    <div className={cn("flex items-center justify-center transition-all duration-300", className)}>
      <ScanFace stroke={color} strokeWidth="1.6" className="h-full w-full" />
    </div>
  );
};

// 图标映射
const iconMap: Record<string, React.FC<{ className?: string; isHovered?: boolean; color?: string }>> = {
  vip: VipIcon,
  auth: AuthIcon,
  influencer: InfluencerIcon,
  advisor: AdvisorIcon,
};

// 获取服务图标
const getServiceIcon = (serviceId: string) => {
  return iconMap[serviceId] || WebsiteIcon;
};

// 卡片按钮组件 - 直接跳转链接
const ServiceCard = ({
  service,
  index,
  mobileIconColor,
}: {
  service: CMSServiceDetail;
  index: number;
  mobileIconColor?: string;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getServiceIcon(service.id);

  // 判断是否为暂未开放的服务 (vip: 会员系统, influencer: 达人平台)
  const isDisabled = service.id === 'vip' || service.id === 'influencer';

  // 查找用户端链接（非管理端）作为默认跳转目标
  const targetLink = service.links.find(link => !link.isAdmin) || service.links[0];
  const href = isDisabled ? undefined : (targetLink?.url || "#");

  return (
    <m.a
      href={href}
      target={isDisabled ? undefined : "_blank"}
      rel={isDisabled ? undefined : "noopener noreferrer"}
      onClick={(e) => isDisabled && e.preventDefault()}
      onMouseEnter={() => !isDisabled && setIsHovered(true)}
      onMouseLeave={() => !isDisabled && setIsHovered(false)}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2 p-4 transition-all duration-500 sm:gap-4 sm:p-8 md:p-10",
        isDisabled ? "cursor-not-allowed opacity-30 grayscale" : "hover:bg-white/50"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
    >
      <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28">
        {/* PC 端图标 */}
        <Icon className="hidden lg:block h-10 w-10 sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-22 lg:w-22" isHovered={isHovered} />
        {/* 移动端深色图标 */}
        <Icon className="lg:hidden h-10 w-10 sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-22 lg:w-22" isHovered={isHovered} color={mobileIconColor} />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className={cn(
          "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
          isHovered ? "text-brand-charcoal" : "max-lg:text-brand-charcoal text-brand-charcoal/70"
        )}>
          {service.label}
        </span>
      </div>
    </m.a>
  );
};



// Props 接口
interface ServicesContentProps {
  content: ServicesPageContent;
}

/**
 * 服务入口页面内容组件
 * 样式参考 PrivacyContent
 */
// Main Content Component
export function ServicesContent({ content }: ServicesContentProps) {
  // 从 content 获取数据
  const pageTitle = content.pageTitle || { en: "SERVICES", zh: "服务入口" };
  const cmsServices = content.services || [];

  // 添加 AI 测肤服务
  const advisorService = {
    id: "advisor",
    label: "测肤平台",
    nameEn: "Skin Advisor",
    title: "测肤平台",
    description: "AI 智能测肤，定制您的专属护肤方案",
    links: [{ label: "立即体验", url: "https://advisor.nihplod.cn", isAdmin: false, description: "" }]
  } as CMSServiceDetail;

  const services = [...cmsServices, advisorService];

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="safe-area-content !pointer-events-none max-lg:!inset-0"
      >
        <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)] max-lg:drop-shadow-none">
          {/* 主内容卡片容器 */}
          <div className="w-full flex-1 overflow-hidden rounded-none lg:rounded-3xl bg-[#F0EDE1] lg:bg-[#F8F7F3] pointer-events-auto relative">
            <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
              {/* 顶栏 / Logo 区 */}
              <header className="flex-shrink-0 px-4 pt-8 pb-6 sm:pt-10 sm:pb-8 lg:pt-12 lg:pb-10">
                <div className="flex items-center">
                  {/* Logo - 移动端居中，与 /about 一致 */}
                  <div className="lg:hidden flex-1 flex justify-center">
                    <Link href="/" className="flex items-center justify-center mt-1">
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

                  {/* Logo - 桌面端居中 */}
                  <div className="hidden lg:flex flex-1 justify-center">
                    <m.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
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
                  </div>
                </div>
              </header>

              {/* 分割线 - 仅桌面端 */}
              <div className="hidden lg:block mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

              {/* 标题区 */}
              <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8">
                <div className="space-y-4 lg:space-y-2">
                  <m.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="font-serif text-[26px] text-brand-charcoal sm:text-[32px] tracking-widest"
                  >
                    {pageTitle.zh}
                  </m.h1>
                  {/* 装饰短横线 - 仅移动端 */}
                  <div className="lg:hidden mx-auto w-12 h-[1px] bg-brand-charcoal/30" />
                  <m.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60"
                  >
                    <span className="hidden lg:inline">NIHPLOD 旎柏以卓越品质与全方位服务，为您呈献逆转时光的奢华体验</span>
                    <span className="lg:hidden">NIHPLOD 旎柏以卓越品质与全方位服务<br />为您呈献逆转时光的奢华体验</span>
                  </m.p>
                </div>
              </div>

              {/* 内容区域 */}
              <main className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="mx-auto max-w-4xl h-full min-h-0 flex flex-col justify-center">

                  <div className="flex flex-col items-center w-full">
                    {/* 服务卡片列表 - 调整网格布局以适应4个卡片 */}
                    <div className="grid w-full grid-cols-2 gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl px-4 pb-12">
                      {services.map((service, index) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          index={index}
                          mobileIconColor="#00263E"
                        />
                      ))}
                    </div>


                  </div>

                </div>
              </main>

              {/* 底部版权信息 */}
              <div className="mt-auto pt-4 sm:pt-6 lg:pt-8 border-t border-brand-charcoal/5 mx-6 lg:mx-12 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 uppercase">
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                </p>
                <div className="hidden sm:block h-3 w-[1px] bg-brand-charcoal/20"></div>
                <Link
                  href="/terms"
                  className="hidden sm:block text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 hover:text-brand-gold transition-colors"
                >
                  服务条款
                </Link>
              </div>
            </div>
          </div>

          {/* 返回首页按钮 - 仅桌面端显示 */}
          <Link
            href="/"
            className="hidden lg:flex group items-center justify-center gap-2 rounded-b-2xl bg-[#F8F7F3] px-10 py-2.5 lg:px-14 lg:py-3 pointer-events-auto"
          >
            <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
            <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回首页</span>
          </Link>
        </div>
      </m.div>
    </>
  );
}
