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
  description: "与热爱美好事物的人一起，创造高端护肤的未来",
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
              {/* 顶栏 / 标题区 */}
              <header className="flex-shrink-0 px-4 pb-8 text-center sm:pb-10 lg:pb-12">
                <div className="space-y-8">
                  {/* Logo 保持在顶端 */}
                  <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <div className="relative h-[26px] w-[124px] sm:h-8 sm:w-[160px]">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="公司标志"
                        fill
                        className="object-contain"
                        priority
                      />
                    </div>
                  </m.div>

                  <div className="space-y-2">
                    <m.h1
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="font-serif text-2xl text-brand-charcoal sm:text-3xl"
                    >
                      {title.zh}
                    </m.h1>
                    <m.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="mx-auto text-sm text-brand-charcoal/60"
                    >
                      {description}
                    </m.p>
                  </div>
                </div>
              </header>

              {/* 分割线 */}
              <div className="mx-auto mb-8 w-full max-w-7xl border-b border-brand-charcoal/10" />

              {/* 内容区域 */}
              <main className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="mx-auto max-w-4xl">
                  <div className="space-y-4">
                    {jobs.length === 0 ? (
                      <div className="py-8 text-center">
                        <Briefcase className="mx-auto mb-3 h-10 w-10 text-brand-beige" />
                        <p className="text-brand-charcoal/60">暂无开放职位，请稍后再来查看</p>
                      </div>
                    ) : (
                      jobs.map((job, index) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          index={index}
                          onClick={() => setSelectedJob(job)}
                        />
                      ))
                    )}

                    {/* 投递方式 */}
                    {submitTip && (
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
                            <h3 className="font-serif text-base text-brand-charcoal">{submitTip.title}</h3>
                            <p className="mt-1 whitespace-pre-line text-sm text-brand-charcoal/70">
                              {submitTip.content}
                            </p>
                          </div>
                        </div>
                      </m.div>
                    )}
                  </div>
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
          <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} _contactEmail={contactEmail} />
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

  return (
    <m.button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-white/60 bg-white/40 text-left shadow-sm backdrop-blur-md transition-all hover:bg-white/60 hover:shadow-xl hover:border-brand-gold/30 hover:-translate-y-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 矿物纹理叠加层 - 增加质感 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      <div className="relative z-10 flex w-full items-center justify-between p-4 sm:p-5 lg:p-6">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-base font-medium text-brand-charcoal sm:text-lg lg:text-xl">
              {job.title}
            </h3>
            <span className="text-xs text-brand-charcoal/40 sm:text-sm">{job.titleEn}</span>
            <span
              className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-medium sm:text-xs", typeInfo.color)}
            >
              {typeInfo.label}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-brand-charcoal/60 sm:gap-4 sm:text-sm">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand-gold/70" />
              {job.location}
            </span>
            {job.salary && (
              <span className="flex items-center gap-1.5 font-medium text-brand-gold">
                <Clock className="h-3.5 w-3.5" />
                {job.salary}
              </span>
            )}
          </div>
        </div>
        <div className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold/10 transition-all group-hover:bg-brand-gold group-hover:shadow-lg sm:h-12 sm:w-12">
          <FileText className="h-5 w-5 text-brand-gold transition-colors group-hover:text-white sm:h-6 sm:w-6" />
        </div>
      </div>
    </m.button>
  );
}

/**
 * 职位详情弹窗组件
 */
function JobModal({ job, onClose, _contactEmail }: { job: Job; onClose: () => void; _contactEmail?: string }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
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
          
          // 1. 先尝试 PlaceSearch (对“信泰中心”这种建筑物名更精准)
          const ps = new AMap.PlaceSearch({ city: "021" });
          // 剥离详细房号，只搜大楼
          const pureBuilding = job.location.includes("市") 
              ? job.location.split("区").pop()?.split(" ").shift()?.substring(0, 10) 
              : job.location.split(" ").shift();
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ps.search(pureBuilding || job.location, (status: string, result: any) => {
              if (status === "complete" && result.poiList && result.poiList.pois.length > 0) {
                  const poi = result.poiList.pois[0];
                  initRender(poi.location.lng, poi.location.lat);
              } else {
                  // 2. 备选：使用 Geocoder 
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  geocoder.getLocation(job.location, (status: string, result: any) => {
                      if (status === "complete" && result.geocodes.length > 0) {
                          const loc = result.geocodes[0].location;
                          initRender(loc.lng, loc.lat);
                      } else {
                          // 3. 最终兜底：去掉结尾重试
                          const fallback = job.location.substring(0, 15);
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          geocoder.getLocation(fallback, (s: string, r: any) => {
                              if (s === "complete" && r.geocodes.length > 0) {
                                  const loc = r.geocodes[0].location;
                                  initRender(loc.lng, loc.lat);
                              }
                          });
                      }
                  });
              }
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
      setResumeFile(file);
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
      formDataToSend.append("email", formData.email);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <m.div
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-brand-charcoal/10 transition-colors hover:bg-brand-charcoal/20"
        >
          <X className="h-4 w-4 text-brand-charcoal" />
        </button>

        <div className="max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="bg-gradient-to-r from-brand-gold/10 to-brand-cream p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-xl text-brand-charcoal sm:text-2xl">
                {job.title}
              </h2>
              <span className="text-sm text-brand-charcoal/50">{job.titleEn}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={cn("rounded-full px-2 py-0.5 text-xs", typeInfo.color)}>
                {typeInfo.label}
              </span>
              <span className="flex items-center gap-1 text-sm text-brand-charcoal/60">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1 text-sm text-brand-charcoal/60">
                  <Clock className="h-3.5 w-3.5" />
                  {job.salary}
                </span>
              )}
            </div>
          </div>

          <div className="border-b border-brand-beige p-6">
            <div className="mb-5">
              <h4 className="mb-3 text-sm font-medium text-brand-gold">职位描述</h4>
              <div
                className="text-sm leading-relaxed text-brand-charcoal/80 [&>p]:mb-3 [&>blockquote]:border-l-4 [&>blockquote]:border-brand-gold [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:my-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: job.description }}
              />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium text-brand-gold">任职要求</h4>
              <div
                className="text-sm leading-relaxed text-brand-charcoal/80 [&>p]:mb-3 [&>blockquote]:border-l-4 [&>blockquote]:border-brand-gold [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:my-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: job.requirements }}
              />
            </div>

            {(job.longitude || job.location) && (
              <div className="mt-8">
                <h4 className="mb-3 text-sm font-medium text-brand-gold">工作地点</h4>
                <div id={`map-${job.id}`} className="relative h-48 w-full rounded-xl overflow-hidden border border-brand-beige bg-gray-50 flex items-center justify-center">
                  <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-gold/20" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6">
            <h4 className="mb-4 flex items-center gap-2 text-base font-medium text-brand-charcoal">
              <Send className="h-4 w-4 text-brand-gold" />
              投递简历
            </h4>

            {submitStatus === "success" ? (
              <m.div
                className="rounded-xl bg-green-50 p-6 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-700">简历投递成功！我们会尽快与您联系。</p>
              </m.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                    <User className="h-3.5 w-3.5" />
                    姓名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none focus:border-brand-gold"
                    placeholder="请输入您的姓名"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                    <Phone className="h-3.5 w-3.5" />
                    手机号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none focus:border-brand-gold"
                    placeholder="请输入11位手机号"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                    <Mail className="h-3.5 w-3.5" />
                    邮箱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none focus:border-brand-gold"
                    placeholder="请输入您的邮箱"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                    <Upload className="h-3.5 w-3.5" />
                    简历 <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors",
                      resumeFile
                        ? "border-brand-gold bg-brand-gold/5 text-brand-charcoal"
                        : "border-brand-beige text-brand-charcoal/60 hover:border-brand-gold/50"
                    )}
                  >
                    {resumeFile ? (
                      <>
                        <FileText className="h-4 w-4 text-brand-gold" />
                        {resumeFile.name}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        点击上传简历（PDF、DOC、DOCX）
                      </>
                    )}
                  </button>
                </div>

                {submitStatus === "error" && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    {errorMessage || "投递失败"}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !resumeFile}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all",
                    isSubmitting || !resumeFile
                      ? "bg-brand-charcoal/30"
                      : "bg-brand-gold hover:bg-brand-gold/90"
                  )}
                >
                  {isSubmitting ? "提交中..." : "提交申请"}
                </button>
              </form>
            )}
          </div>
        </div>
      </m.div>
    </m.div>
  );
}
