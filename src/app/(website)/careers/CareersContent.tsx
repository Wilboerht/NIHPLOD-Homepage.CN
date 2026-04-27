"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Briefcase,
  Clock,
  Mail,
  Home,
  X,
  Upload,
  User,
  Phone,
  FileText,
  Send,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CareersPageContent } from "@/types/page-content";

// 职位类型
export interface Job {
  id: string;
  title: string;
  titleEn: string | null;
  location: string;
  type: string;
  description: string;
  requirements: string;
  salary: string | null;
  longitude?: number | null;
  latitude?: number | null;
}

// 职位类型映射 - 使用品牌色系
const jobTypeMap: Record<string, { label: string; color: string }> = {
  fulltime: { label: "全职", color: "bg-brand-gold/15 text-brand-gold" },
  parttime: { label: "兼职", color: "bg-brand-charcoal/10 text-brand-charcoal/70" },
  intern: { label: "实习", color: "bg-brand-beige text-brand-charcoal/70" },
};

// 默认内容
const defaultContent: CareersPageContent = {
  title: { en: "JOIN US", zh: "加入我们" },
  description: "我们正在寻找那些希望将想法转化为创新体验和解决方案的人",
  submitTip: {
    title: "简历投递",
    content: "请将简历直接投递到在招岗位的投递提交表单中\n简历命名格式：【应聘】职位名称 - 姓名",
  },
  contactEmail: "hr@nihplod.com",
};

interface CareersContentProps {
  jobs: Job[];
  content?: CareersPageContent;
}

/**
 * 招聘页面内容组件
 * 直接显示开放职位
 */
export function CareersContent({ jobs, content }: CareersContentProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  // 脚本载入由父级页面 (page.tsx) 的 next/script 控制
  useEffect(() => {
    // 这里可以留空或做一些全局插件声明
  }, []);

  // 合并默认内容和传入内容
  const title = content?.title || defaultContent.title;
  const description = content?.description || defaultContent.description;
  const submitTip = content?.submitTip || defaultContent.submitTip;
  const contactEmail = content?.contactEmail || defaultContent.contactEmail;

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="safe-area-content !pointer-events-none"
      >
        <div className="flex h-full flex-col items-center pointer-events-none">
          {/* 主内容卡片容器 */}
          <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl pointer-events-auto relative shadow-2xl shadow-black/5">
            {/* 矿物纹理叠加层 */}
            <div
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
              }}
            />
            <div className="relative z-10 flex h-full flex-col p-4 sm:p-6 lg:p-8">
              {/* 顶栏 / Logo 区 */}
              <header className="flex-shrink-0 px-4 pt-8 pb-6 text-center sm:pt-10 sm:pb-8 lg:pt-12 lg:pb-10">
                {/* Logo 保持在顶端 */}
                <m.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center"
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
              </header>

              {/* 分割线 */}
              <div className="mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

              {/* 标题区 */}
              <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8">
                <div className="space-y-2">
                  <m.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="font-serif text-[26px] text-brand-charcoal sm:text-[32px]"
                  >
                    {title.zh}
                  </m.h1>
                  <m.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60"
                  >
                    {description}
                  </m.p>
                </div>
              </div>

              {/* 内容区域 */}
              <main className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] relative">
                {/* 左侧边栏 - absolute 定位不影响内容布局 */}
                <aside className="hidden w-48 lg:block absolute left-0 top-0 bottom-0 border-r border-brand-charcoal/5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <nav className="space-y-6 w-full px-6 pt-4">
                    <div className="flex items-center gap-3 px-2 opacity-80">
                      <p className="text-sm font-bold text-brand-charcoal">
                        筛选
                      </p>
                    </div>

                    <div className="flex flex-col space-y-1">
                      {[
                        { id: "all", label: "全部职位", count: jobs.length },
                        { id: "fulltime", label: "全职", count: jobs.filter(j => j.type === "fulltime").length },
                        { id: "parttime", label: "兼职", count: jobs.filter(j => j.type === "parttime").length },
                        { id: "intern", label: "实习", count: jobs.filter(j => j.type === "intern").length },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setFilterType(item.id)}
                          className={cn(
                            "group relative flex w-full items-center justify-between py-3 px-2 text-left transition-all duration-300 rounded-lg hover:bg-brand-charcoal/5",
                            filterType === item.id
                              ? "text-brand-charcoal"
                              : "text-brand-charcoal/60"
                          )}
                        >
                          <span className={cn(
                            "text-sm font-medium transition-all duration-300",
                            filterType === item.id ? "font-bold translate-x-1" : "group-hover:translate-x-1"
                          )}>
                            {item.label}
                          </span>
                          <span className={cn(
                            "text-xs tabular-nums transition-all duration-300",
                            filterType === item.id ? "opacity-100 font-semibold" : "opacity-50"
                          )}>
                            {item.count}
                          </span>

                          {filterType === item.id && (
                            <m.div
                              layoutId="careers-active-dot"
                              className="absolute left-0 h-4 w-0.5 rounded-full bg-brand-gold"
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </nav>
                </aside>

                <div className="mx-auto max-w-4xl pb-12">
                  {(() => {
                    const filteredJobs = filterType === "all"
                      ? jobs
                      : jobs.filter((job) => job.type === filterType);

                    if (filteredJobs.length === 0) {
                      return (
                        <div className="py-8 text-center">
                          <Briefcase className="mx-auto mb-3 h-10 w-10 text-brand-beige" />
                          <p className="text-brand-charcoal/60">暂无开放职位，请稍后再来查看</p>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 gap-3 sm:gap-4 max-w-2xl mx-auto w-full">
                        {filteredJobs.map((job, index) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            index={index}
                            onClick={() => setSelectedJob(job)}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </main>

              {/* 底部版权信息 */}
              <div className="mt-auto pt-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12">
                <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60">
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                </p>
              </div>
            </div>
          </div>

          {/* 返回首页按钮 */}
          <Link
            href="/"
            className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3 pointer-events-auto"
          >
            <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
            <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回首页</span>
          </Link>
        </div>
      </m.div>

      {/* 职位详情弹窗 */}
      <AnimatePresence>
        {selectedJob && (
          <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} _contactEmail={contactEmail} submitTip={submitTip} />
        )}
      </AnimatePresence>

      <style jsx global>{`
        .amap-marker-label {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
        }
        .amap-custom-label {
          padding: 6px 12px;
          background: white;
          border: 1px solid #EBE8DB;
          border-radius: 6px;
          font-size: 13px;
          color: #333;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          font-family: inherit;
        }
        .amap-custom-label::after {
          content: "";
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 6px solid white;
        }
      `}</style>
    </>
  );
}

/**
 * 职位卡片组件 - 简化版，点击打开弹窗
 */
// 提取城市名（只显示省份/城市，不显示具体地址）
const extractCity = (location: string) => {
  // 直辖市
  const directCity = location.match(/^(北京|上海|天津|重庆)/);
  if (directCity) return directCity[1];

  // 匹配城市名
  const cityMatch = location.match(/^(?:.*?省|.*?自治区)?(.*?市)/);
  if (cityMatch) return cityMatch[1].replace(/市$/, "");

  // 兜底
  return location.split(/[区县]/)[0]?.replace(/市$/, "") || location;
};

/**
 * 统一岗位 HTML 格式，把 <p>数字.内容</p> 转成有序列表，去掉空段落
 */
function normalizeJobHtml(html: string): string {
  let result = html;

  // 1. 去掉空段落和只含 br 的段落
  result = result.replace(/<p[^>]*>\s*(?:<br\s*\/?>)*\s*<\/p>/gi, "");

  // 2. 把连续的 <p>数字.内容</p> 转成 <ol><li>内容</li></ol>
  const pattern = /(<p[^>]*>\s*\d+[\.．。、\s]+.*?<\/p>\s*){2,}/gi;
  result = result.replace(pattern, (match) => {
    const items: string[] = [];
    const itemRegex = /<p[^>]*>\s*\d+[\.．。、\s]+(.*?)<\/p>/gi;
    let m;
    while ((m = itemRegex.exec(match)) !== null) {
      items.push(`<li>${m[1].trim()}</li>`);
    }
    return `<ol class="list-decimal pl-5">${items.join("")}</ol>`;
  });

  // 3. 统一已有 <ol> 的样式，去掉可能存在的内联 padding-left:0
  result = result.replace(/<ol[^>]*>/gi, '<ol class="list-decimal pl-5">');

  return result;
}

function JobCard({
  job,
  index,
  onClick,
}: {
  job: Job;
  index: number;
  onClick: () => void;
}) {
  const typeInfo = jobTypeMap[job.type] || {
    label: job.type,
    color: "bg-gray-100 text-gray-700",
  };

  const cityName = extractCity(job.location);

  // 提取描述纯文本摘要（去掉 HTML 标签）
  const plainDescription = job.description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const descriptionSummary =
    plainDescription.length > 80
      ? plainDescription.slice(0, 80) + "..."
      : plainDescription;

  return (
    <m.button
      type="button"
      onClick={onClick}
      className="group relative w-full text-left transition-colors duration-200 hover:bg-brand-charcoal/[0.02]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        {/* 第一行：职位名称 + 箭头 */}
        <div className="flex w-full items-center justify-between gap-3">
          <h3 className="font-serif text-base font-medium text-brand-charcoal leading-snug sm:text-lg">
            {job.title}
          </h3>
          <span className="flex-shrink-0 text-brand-charcoal/25 transition-all duration-300 group-hover:text-brand-gold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>

        {/* 第二行：Logo + 类型 | 地点 等元信息 */}
        <div className="mt-2.5 flex items-center gap-2.5 text-[13px] sm:text-sm text-brand-charcoal/45">
          {/* 小图标 */}
          <Briefcase className="h-4 w-4 text-brand-charcoal/50" />
          <span className="text-brand-charcoal/60 font-medium">{typeInfo.label}</span>
          <span className="text-brand-charcoal/20">|</span>
          {job.salary && (
            <>
              <span className="text-brand-gold/80">{job.salary}</span>
              <span className="text-brand-charcoal/20">|</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {cityName}
          </span>
        </div>

        {/* 第三行：描述摘要 */}
        {descriptionSummary && (
          <p className="mt-2.5 text-[13px] sm:text-sm leading-relaxed text-brand-charcoal/40 line-clamp-1">
            {descriptionSummary}
          </p>
        )}
      </div>

      {/* 底部分割线 */}
      <div className="mx-5 sm:mx-6 border-b border-brand-charcoal/8" />
    </m.button>
  );
}

/**
 * 职位详情弹窗组件
 */
function JobModal({ job, onClose, _contactEmail, submitTip }: { job: Job; onClose: () => void; _contactEmail?: string; submitTip?: { title: string; content: string } }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 20;

    const tryInitMap = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AMap = (window as any).AMap;
      if (!AMap) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryInitMap, 200);
        }
        return;
      }

      const container = document.getElementById(`map-${job.id}`);
      if (!container) return;

      AMap.plugin(["AMap.Geocoder", "AMap.PlaceSearch"], () => {
        const initRender = (lng: number, lat: number) => {
          const map = new AMap.Map(container, {
            zoom: 16,
            center: [lng, lat],
            viewMode: '2D'
          });
          const marker = new AMap.Marker({
            position: [lng, lat],
            title: job.location,
            label: {
              content: `<div class="amap-custom-label">${job.location}</div>`,
              direction: 'bottom',
              offset: new AMap.Pixel(0, 10)
            }
          });
          map.add(marker);
        };

        // 核心修正：如果数据库有坐标，直接用坐标秒开
        if (job.longitude && job.latitude) {
          initRender(job.longitude, job.latitude);
          return;
        }

        // 修正：多级解析策略，防止飘到豫园
        if (job.location) {
          const geocoder = new AMap.Geocoder({ city: "021" });

          // 1. 先尝试 PlaceSearch (对建筑物名更精准)
          const ps = new AMap.PlaceSearch({ city: "021", pageSize: 1 });
          // 剥离详细房号，只搜大楼关键词
          const rawLocation = job.location.split(' ').shift() || job.location;
          // 如果有层号房间号（如 T3-610），剥离掉
          const pureBuilding = rawLocation.split(/[a-zA-Z0-9-]/)[0] || rawLocation;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ps.search(pureBuilding, (status: string, result: any) => {
            if (status === "complete" && result.poiList && result.poiList.pois.length > 0) {
              const poi = result.poiList.pois[0];
              // 简单纠偏：经度 121.47 附近通常是高德的城隍庙回落点
              if (Math.abs(poi.location.lng - 121.47) > 0.01) {
                initRender(poi.location.lng, poi.location.lat);
                return;
              }
            }

            // 2. 备选：使用 Geocoder 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            geocoder.getLocation(job.location, (status: string, result: any) => {
              if (status === "complete" && result.geocodes.length > 0) {
                const loc = result.geocodes[0].location;
                initRender(loc.lng, loc.lat);
              } else {
                // 3. 最终兜底：缩减地址重试
                const fallback = job.location.includes("区") ? job.location.split("区").pop()?.substring(0, 10) : job.location;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                geocoder.getLocation(fallback || job.location, (s: string, r: any) => {
                  if (s === "complete" && r.geocodes.length > 0) {
                    const loc = r.geocodes[0].location;
                    initRender(loc.lng, loc.lat);
                  }
                });
              }
            });
          });
        }
      });
    };

    const timer = setTimeout(tryInitMap, 300);
    return () => clearTimeout(timer);
  }, [job]);

  const typeInfo = jobTypeMap[job.type] || {
    label: job.type,
    color: "bg-gray-100 text-gray-700",
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        setSubmitStatus("error");
        setErrorMessage("请上传 PDF 格式的简历");
        setResumeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setResumeFile(file);
      setSubmitStatus("idle");
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile) return;

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("jobId", job.id);
      formDataToSend.append("jobTitle", job.title);
      formDataToSend.append("name", formData.name);
      formDataToSend.append("phone", formData.phone);
      formDataToSend.append("resume", resumeFile);

      const response = await fetch("/api/careers/apply", {
        method: "POST",
        body: formDataToSend,
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitStatus("success");
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setSubmitStatus("error");
        if (result.details) {
          const firstFieldError = Object.values(result.details).flat()[0] as string;
          setErrorMessage(firstFieldError || result.error || "投递失败，请稍后重试");
        } else {
          setErrorMessage(result.error || "投递失败，请稍后重试");
        }
      }
    } catch {
      setSubmitStatus("error");
      setErrorMessage("网络错误，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <m.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={onClose}
      />

      <m.div
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_45px_80px_-16px_rgba(0,0,0,0.15)]"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div className="absolute top-4 right-6 z-20">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="p-10 pt-10 pb-6">
            <h2 className="font-sans text-xl font-bold text-slate-900 sm:text-2xl">
              {job.title}
            </h2>
            {job.titleEn && (
              <span className="mt-1 block text-sm text-slate-400">{job.titleEn}</span>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider", typeInfo.color)}>
                {typeInfo.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1 text-xs font-medium text-[#8B7355]">
                  <Clock className="h-3.5 w-3.5" />
                  {job.salary}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          <div className="border-b border-slate-100 px-10 pt-8 pb-8">
            <div className="mb-5">
              <h4 className="mb-3 font-sans text-sm font-bold tracking-widest text-[#8B7355]">职位描述</h4>
              <div
                className="text-sm leading-relaxed text-slate-600 [&>p]:mb-3 [&>blockquote]:border-l-4 [&>blockquote]:border-[#C6A87C] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:my-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: normalizeJobHtml(job.description) }}
              />
            </div>
            <div>
              <h4 className="mb-3 font-sans text-sm font-bold tracking-widest text-[#8B7355]">任职要求</h4>
              <div
                className="text-sm leading-relaxed text-slate-600 [&>p]:mb-3 [&>blockquote]:border-l-4 [&>blockquote]:border-[#C6A87C] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:my-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: normalizeJobHtml(job.requirements) }}
              />
            </div>

            {(job.longitude || job.location) && (
              <div className="mt-8">
                <h4 className="mb-3 font-sans text-sm font-bold tracking-widest text-[#8B7355]">工作地点</h4>
                <div id={`map-${job.id}`} className="relative h-48 w-full rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                  <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#C6A87C]/20" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-10 pb-10 pt-8">
            <h4 className="mb-6 flex items-center gap-2 text-base font-bold tracking-widest text-[#8B7355]">
              <Send className="h-4 w-4 text-[#8B7355]" />
              投递简历
            </h4>

            <div className="relative">
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-slate-500">姓名 <span className="text-red-500">*</span></span>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="block w-full rounded-xl border border-slate-100 bg-slate-50 py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 focus:border-[#C6A87C]/40 focus:bg-white focus:ring-4 focus:ring-[#C6A87C]/15"
                    placeholder="请输入您的姓名"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-slate-500">手机号 <span className="text-red-500">*</span></span>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={formData.phone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 11);
                      setFormData({ ...formData, phone: value });
                    }}
                    className="block w-full rounded-xl border border-slate-100 bg-slate-50 py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 focus:border-[#C6A87C]/40 focus:bg-white focus:ring-4 focus:ring-[#C6A87C]/15"
                    placeholder="请输入11位手机号"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-slate-500">简历 <span className="text-red-500">*</span></span>
                    <span className="group/tooltip relative cursor-help">
                      <HelpCircle className="h-4 w-4 text-slate-300 transition-colors group-hover/tooltip:text-[#8B7355]" />
                      <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-700 opacity-0 shadow-lg transition-opacity group-hover/tooltip:opacity-100">
                        简历命名格式：【应聘】职位名称 - 姓名
                      </span>
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-3.5 text-[13px] transition-all duration-300",
                      resumeFile
                        ? "border-[#C6A87C]/40 bg-[#C6A87C]/5 text-slate-900"
                        : "border-slate-100 text-slate-400 hover:border-[#C6A87C]/30"
                    )}
                  >
                    {resumeFile ? (
                      <>
                        <FileText className="h-4 w-4 text-[#8B7355]" />
                        {resumeFile.name}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        点击上传简历（PDF 格式）
                      </>
                    )}
                  </button>
                </div>

                {submitStatus === "error" && (
                  <div className="rounded-xl bg-red-50 p-3 text-[13px] text-red-600">
                    {errorMessage || "投递失败"}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !resumeFile}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-[13px] font-bold tracking-widest transition-all duration-300",
                    isSubmitting || !resumeFile
                      ? "border-slate-200 bg-slate-100 text-slate-400"
                      : "border-[#8B7355]/40 bg-[#8B7355]/10 text-[#8B7355] hover:border-[#8B7355]/70 hover:bg-[#8B7355]/20"
                  )}
                >
                  {isSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <>提交申请</>
                  )}
                </button>
              </form>

              {/* 悬浮成功层 */}
              <AnimatePresence>
                {submitStatus === "success" && (
                  <m.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-x-[-8px] inset-y-[-8px] z-50 flex flex-col items-center justify-center rounded-[28px] bg-white p-6 text-center"
                  >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#8B7355]/10">
                      <m.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                      >
                        <svg className="h-8 w-8 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </m.div>
                    </div>
                    <h3 className="mb-2 text-lg font-bold tracking-widest text-[#8B7355]">投递成功</h3>
                    <p className="text-sm text-slate-500">
                      简历已送达，我们会尽快与您联系
                    </p>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </m.div>
    </m.div>
  );
}
