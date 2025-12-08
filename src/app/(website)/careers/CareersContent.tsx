"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Briefcase,
  Clock,
  Mail,
  ChevronDown,
  ShoppingBag,
  BookMarked,
  Sparkles,
  Home,
} from "lucide-react";
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
const CultureIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const JobsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
  </svg>
);

const BenefitsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
);

// 职位类型
interface Job {
  id: string;
  title: string;
  titleEn: string;
  location: string;
  type: string;
  description: string;
  requirements: string;
  salary: string | null;
}

// 职位类型映射
const jobTypeMap: Record<string, { label: string; color: string }> = {
  fulltime: { label: "全职", color: "bg-green-100 text-green-700" },
  parttime: { label: "兼职", color: "bg-blue-100 text-blue-700" },
  intern: { label: "实习", color: "bg-purple-100 text-purple-700" },
};

// 标签页配置
type TabId = "culture" | "jobs" | "benefits";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: "culture", label: "企业文化", icon: CultureIcon },
  { id: "jobs", label: "开放职位", icon: JobsIcon },
  { id: "benefits", label: "员工福利", icon: BenefitsIcon },
];

// 企业文化内容
const cultures = [
  { title: "追求卓越", description: "对产品品质的极致追求，对细节的严苛把控" },
  { title: "热爱生活", description: "相信美的力量，享受每一个护肤时刻" },
  { title: "国际视野", description: "摩纳哥基因，东方智慧，全球化思维" },
  { title: "协作共创", description: "扁平化管理，开放沟通，共同成长" },
];

// 员工福利内容
const benefits = [
  { title: "竞争力薪酬", description: "行业领先的薪资待遇，年终奖金丰厚" },
  { title: "五险一金", description: "完善的社会保险与住房公积金" },
  { title: "弹性工作", description: "灵活的工作时间，支持远程办公" },
  { title: "培训发展", description: "专业技能培训，清晰的职业发展路径" },
  { title: "健康关怀", description: "年度体检，健身补贴，心理咨询" },
  { title: "产品福利", description: "员工专属折扣，新品试用机会" },
];

interface CareersContentProps {
  jobs: Job[];
}

/**
 * 招聘页面内容组件
 * 样式参考 StoryContent，使用独立的导航栏
 */
export function CareersContent({ jobs }: CareersContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const toggleJobExpand = (id: string) => {
    setExpandedJobId((prev) => (prev === id ? null : id));
  };

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
            src="/images/careers-bg.jpg"
            alt="加入我们"
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
                      JOIN US
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      加入我们
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      与热爱美好事物的人一起，创造高端护肤的未来
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

                      {/* 3个大标签按钮 */}
                      <div className="flex w-full max-w-3xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 transition-all duration-300 sm:gap-4 sm:px-8 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <div className="flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-28 lg:w-28">
                                <Icon className="h-12 w-12 text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24" />
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
                          {tabs.find(t => t.id === activeTab)?.label}
                        </m.h2>
                        <div className="w-16 sm:w-20" />
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        {/* 企业文化内容 */}
                        {activeTab === "culture" && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            {cultures.map((culture, index) => (
                              <m.div
                                key={culture.title}
                                className="rounded-xl border border-brand-beige bg-white p-4 text-center sm:p-6"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                              >
                                <h3 className="font-serif text-lg text-brand-charcoal">{culture.title}</h3>
                                <p className="mt-2 text-sm text-brand-charcoal/70">{culture.description}</p>
                              </m.div>
                            ))}
                          </div>
                        )}

                        {/* 开放职位内容 */}
                        {activeTab === "jobs" && (
                          <div className="space-y-4">
                            {jobs.length === 0 ? (
                              <div className="py-8 text-center">
                                <Briefcase className="mx-auto mb-3 h-10 w-10 text-brand-beige" />
                                <p className="text-brand-charcoal/60">暂无开放职位，请稍后再来查看</p>
                                <p className="mt-2 text-sm text-brand-charcoal/40">
                                  或发送简历至 <a href="mailto:hr@nihplod.com" className="text-brand-gold hover:underline">hr@nihplod.com</a>
                                </p>
                              </div>
                            ) : (
                              jobs.map((job, index) => (
                                <JobCard
                                  key={job.id}
                                  job={job}
                                  index={index}
                                  isExpanded={expandedJobId === job.id}
                                  onToggle={() => toggleJobExpand(job.id)}
                                />
                              ))
                            )}

                            {/* 投递方式 */}
                            <m.div
                              className="mt-6 rounded-xl bg-brand-gold/10 p-5"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: 0.2 }}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold">
                                  <Mail className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                  <h3 className="font-serif text-base text-brand-charcoal">简历投递</h3>
                                  <p className="mt-1 text-sm text-brand-charcoal/70">
                                    请将简历发送至 <a href="mailto:hr@nihplod.com" className="font-medium text-brand-gold hover:underline">hr@nihplod.com</a>
                                    <br />邮件标题格式：【应聘】职位名称 - 姓名
                                  </p>
                                </div>
                              </div>
                            </m.div>
                          </div>
                        )}

                        {/* 员工福利内容 */}
                        {activeTab === "benefits" && (
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {benefits.map((benefit, index) => (
                              <m.div
                                key={benefit.title}
                                className="rounded-xl border border-brand-beige bg-white p-4 text-center sm:p-6"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                              >
                                <h3 className="font-serif text-lg text-brand-charcoal">{benefit.title}</h3>
                                <p className="mt-2 text-sm text-brand-charcoal/70">{benefit.description}</p>
                              </m.div>
                            ))}
                          </div>
                        )}
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
            <nav className={cn("flex items-center justify-between", "rounded-2xl bg-white/95 px-5 py-4 shadow-lg backdrop-blur-md", "lg:rounded-3xl lg:px-8 lg:py-5")} aria-label="招聘页导航">
              <Link href="/careers" className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <Briefcase className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">加入我们</span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">Careers</span>
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
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                    <Home className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">首页</span>
                  <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">Home</span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * 职位卡片组件
 */
function JobCard({
  job,
  index,
  isExpanded,
  onToggle,
}: {
  job: Job;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeInfo = jobTypeMap[job.type] || {
    label: job.type,
    color: "bg-gray-100 text-gray-700",
  };

  return (
    <m.div
      className="overflow-hidden rounded-xl border border-brand-beige bg-white"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      {/* 职位标题栏 */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-brand-cream/50"
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-base text-brand-charcoal">
              {job.title}
            </h3>
            <span className="text-xs text-brand-charcoal/50">{job.titleEn}</span>
            <span
              className={cn("rounded-full px-2 py-0.5 text-xs", typeInfo.color)}
            >
              {typeInfo.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-brand-charcoal/60">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {job.location}
            </span>
            {job.salary && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {job.salary}
              </span>
            )}
          </div>
        </div>
        <m.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-5 w-5 text-brand-charcoal/40" />
        </m.div>
      </button>

      {/* 展开详情 */}
      <AnimatePresence>
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-brand-beige bg-brand-cream/30 p-4">
              {/* 职责描述 */}
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium text-brand-charcoal">
                  职位描述
                </h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-brand-charcoal/70">
                  {job.description}
                </p>
              </div>

              {/* 任职要求 */}
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium text-brand-charcoal">
                  任职要求
                </h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-brand-charcoal/70">
                  {job.requirements}
                </p>
              </div>

              {/* 投递按钮 */}
              <a
                href={`mailto:hr@nihplod.com?subject=${encodeURIComponent(`【应聘】${job.title} - `)}`}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm text-white transition-colors hover:bg-brand-gold/90"
              >
                <Mail className="h-4 w-4" />
                <span>投递简历</span>
              </a>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

