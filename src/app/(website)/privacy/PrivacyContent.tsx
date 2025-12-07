"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { Shield, ChevronDown, ShoppingBag, BookMarked, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "商城", labelEn: "Products", icon: ShoppingBag },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: BookMarked },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: Sparkles },
];

// 自定义图标组件
const CollectIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

const UseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="21.17" y1="8" x2="12" y2="8" />
    <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
    <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
  </svg>
);

const ProtectIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const RightsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

// 标签页配置
type TabId = "collect" | "use" | "protect" | "rights";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: "collect", label: "信息收集", icon: CollectIcon },
  { id: "use", label: "信息使用", icon: UseIcon },
  { id: "protect", label: "信息保护", icon: ProtectIcon },
  { id: "rights", label: "您的权利", icon: RightsIcon },
];

// 各标签页内容
interface TabContent {
  title: string;
  content: string[];
}

const tabContents: Record<TabId, TabContent> = {
  collect: {
    title: "信息收集",
    content: [
      "**个人信息**\n• 姓名、电子邮箱地址（当您联系我们或订阅时）\n• 护肤咨询中您主动提供的肤质信息",
      "**自动收集的信息**\n• 设备信息（设备类型、操作系统、浏览器类型）\n• 访问日志（IP地址、访问时间、浏览页面）\n• Cookies 和类似技术收集的信息",
    ],
  },
  use: {
    title: "信息使用",
    content: [
      "我们使用收集的信息用于以下目的：",
      "• 提供和改进我们的服务\n• 响应您的咨询和请求\n• 发送产品更新和营销信息（需您授权）\n• 提供个性化的护肤建议\n• 分析网站使用情况以优化用户体验\n• 遵守法律法规要求",
    ],
  },
  protect: {
    title: "信息保护",
    content: [
      "我们采取多种安全措施保护您的个人信息：",
      "• 使用 SSL/TLS 加密传输数据\n• 限制员工访问个人信息的权限\n• 定期进行安全审计和漏洞检测\n• 与第三方服务商签订数据保护协议\n• 数据存储于安全的云服务器",
      "我们承诺不会出售、出租或以其他方式向第三方披露您的个人信息，除非获得您的明确同意或法律要求。",
    ],
  },
  rights: {
    title: "您的权利",
    content: [
      "根据适用的数据保护法律，您享有以下权利：",
      "• **访问权**：您可以请求获取我们持有的您的个人信息副本\n• **更正权**：您可以请求更正不准确的个人信息\n• **删除权**：您可以请求删除您的个人信息\n• **反对权**：您可以反对我们处理您的个人信息\n• **可携带权**：您可以请求以机器可读格式获取您的数据",
      "如需行使上述权利，请通过 privacy@nihplod.com 与我们联系。",
    ],
  },
};

/**
 * 隐私政策页面内容组件
 * 样式参考 StoryContent，使用独立的导航栏
 */
export function PrivacyContent() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const lastUpdated = "2024年12月1日";

  return (
    <>
      {/* 全屏背景容器 */}
      <div className={cn(
        "fixed inset-0 transition-all duration-500 ease-out",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/privacy-bg.jpg"
            alt="隐私政策"
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
          className={cn(
            "absolute left-6 right-6 top-4 z-20 transition-all duration-500 ease-out sm:left-10 sm:right-10 lg:left-16 lg:right-16 lg:top-6",
            isExpanded ? "bottom-4 lg:bottom-6" : ""
          )}
        >
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <div className={cn(
              "w-full overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl",
              "transition-all duration-500 ease-out",
              isExpanded ? "flex-1" : ""
            )}>
              <div className={cn(
                "flex flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
                isExpanded ? "h-full justify-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""
              )}>
                {/* 页面标题 */}
                {!activeTab && (
                  <div className={cn("text-center", isExpanded ? "mb-6 sm:mb-8" : "")}>
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      PRIVACY POLICY
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      隐私政策
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      我们重视并尊重您的隐私
                    </p>
                    <p className="mt-1 text-xs text-brand-charcoal/50 sm:text-sm">
                      最后更新：{lastUpdated}
                    </p>
                  </div>
                )}

                {/* 展开后显示的内容 */}
                <AnimatePresence mode="wait">
                  {isExpanded && !activeTab && (
                    <m.div
                      key="tabs"
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

                      {/* 4个大标签按钮 */}
                      <div className="flex w-full max-w-4xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
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
                                {tab.label}
                              </span>
                            </m.button>
                          );
                        })}
                      </div>
                    </m.div>
                  )}

                  {/* 选中标签后显示的内容 */}
                  {isExpanded && activeTab && (
                    <m.div
                      key={activeTab}
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
                          onClick={() => setActiveTab(null)}
                          className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                        >
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="text-sm sm:text-base">返回</span>
                        </m.button>
                        <m.h2 className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl">
                          {tabContents[activeTab].title}
                        </m.h2>
                        <div className="w-16 sm:w-20" />
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        <div className="space-y-6">
                          {tabContents[activeTab].content.map((paragraph, index) => (
                            <m.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: index * 0.1 }}
                              className="text-sm leading-relaxed text-brand-charcoal/70 sm:text-base"
                            >
                              <p className="whitespace-pre-line">{paragraph}</p>
                            </m.div>
                          ))}
                        </div>

                        {/* 联系方式 */}
                        <m.div
                          className="mt-8 rounded-xl bg-brand-gold/10 p-5"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.3 }}
                        >
                          <p className="text-center text-sm text-brand-charcoal/70">
                            如有任何疑问，请联系：
                            <a href="mailto:privacy@nihplod.com" className="ml-1 font-medium text-brand-gold hover:underline">
                              privacy@nihplod.com
                            </a>
                          </p>
                        </m.div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </div>

      {/* 底部导航栏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-4 left-6 right-6 z-50 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav className={cn("flex items-center justify-between", "rounded-2xl bg-white/95 px-5 py-4 shadow-lg backdrop-blur-md", "lg:rounded-3xl lg:px-8 lg:py-5")} aria-label="隐私政策页导航">
              <Link href="/privacy" className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <Shield className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">隐私政策</span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">Privacy</span>
                </div>
              </Link>

              <div className="flex items-center gap-3 sm:gap-5 lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                        <Icon className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                      </div>
                      <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">{item.label}</span>
                      <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">{item.labelEn}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}

