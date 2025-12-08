"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ExternalLink, Home, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// 自定义图标组件
const VipIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
    <path d="M16 3l2 2-2 2" />
    <path d="M20 3l-2 2 2 2" />
  </svg>
);

const WebsiteIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const InfluencerIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// 标签页配置
type ServiceId = "vip" | "website" | "influencer";

interface ServiceConfig {
  id: ServiceId;
  label: string;
  icon: React.FC<{ className?: string }>;
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
            src="/images/privacy-bg.jpg"
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
            <div className="w-full flex-1 overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl">
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
                        {services.map((service, index) => {
                          const Icon = service.icon;
                          return (
                            <m.button
                              key={service.id}
                              type="button"
                              onClick={() => setActiveService(service.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
                                index < services.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
                                <Icon className="h-10 w-10 text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" />
                              </div>
                              <span className="text-xs font-medium text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm md:text-base lg:text-lg">
                                {service.label}
                              </span>
                            </m.button>
                          );
                        })}
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
                      className="flex h-full flex-col"
                    >
                      {/* 返回按钮和标题 */}
                      <div className="mb-4 flex items-center justify-between sm:mb-6">
                        <m.button
                          type="button"
                          onClick={() => setActiveService(null)}
                          className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                        >
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="text-sm sm:text-base">返回</span>
                        </m.button>
                        <m.h2 className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl">
                          {serviceDetails[activeService].title}
                        </m.h2>
                        <div className="w-16 sm:w-20" />
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        <div className="space-y-6">
                          {/* 服务描述 */}
                          <m.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <p className="text-xs uppercase tracking-widest text-brand-charcoal/50 sm:text-sm">
                              {serviceDetails[activeService].nameEn}
                            </p>
                            <p className="mt-3 text-sm leading-relaxed text-brand-charcoal/70 sm:text-base">
                              {serviceDetails[activeService].description}
                            </p>
                          </m.div>

                          {/* 链接卡片 */}
                          {serviceDetails[activeService].links.map((link, index) => (
                            <m.a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-xl border border-brand-beige bg-white p-5 transition-all hover:border-brand-gold/50 hover:shadow-md"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.1 + index * 0.1 }}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-full",
                                    link.isAdmin ? "bg-brand-charcoal/10" : "bg-brand-gold/10"
                                  )}>
                                    {link.isAdmin ? (
                                      <Shield className="h-5 w-5 text-brand-charcoal" />
                                    ) : (
                                      <ExternalLink className="h-5 w-5 text-brand-gold" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-brand-charcoal">{link.label}</span>
                                      {link.isAdmin && (
                                        <span className="rounded bg-brand-charcoal/10 px-1.5 py-0.5 text-xs text-brand-charcoal/70">
                                          需授权
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 text-sm text-brand-charcoal/60">{link.description}</p>
                                  </div>
                                </div>
                                <ExternalLink className="h-4 w-4 text-brand-charcoal/40" />
                              </div>
                            </m.a>
                          ))}

                          {/* 提示信息 */}
                          <m.div
                            className="rounded-xl bg-brand-gold/10 p-4"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.3 }}
                          >
                            <p className="text-center text-xs text-brand-charcoal/60 sm:text-sm">
                              <Shield className="mr-1 inline-block h-4 w-4" />
                              管理端入口仅供授权人员访问，需要相应的账号权限
                            </p>
                          </m.div>
                        </div>
                      </div>
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

