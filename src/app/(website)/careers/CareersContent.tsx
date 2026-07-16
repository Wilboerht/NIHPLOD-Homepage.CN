"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { MapPin, Briefcase, X, Upload, FileText, Send, Loader2 } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { apiPost, ApiError } from "@/lib/api-client";

// ============================================
// Types
// ============================================

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

const jobTypeMap: Record<string, { label: string; color: string }> = {
  fulltime: { label: "全职", color: "bg-brand-gold/15 text-brand-gold" },
  parttime: { label: "兼职", color: "bg-brand-charcoal/10 text-brand-charcoal/70" },
  intern: { label: "实习", color: "bg-brand-beige text-brand-charcoal/70" },
};

interface CareersContentProps {
  jobs: Job[];
  content?: any;
}

// ============================================
// Utilities
// ============================================

const extractCity = (location: string) => {
  const directCity = location.match(/^(北京|上海|天津|重庆)/);
  if (directCity) return directCity[1];
  const cityMatch = location.match(/^(?:.*?省|.*?自治区)?(.*?市)/);
  if (cityMatch) return cityMatch[1].replace(/市$/, "");
  return location.split(/[区县]/)[0]?.replace(/市$/, "") || location;
};

function normalizeJobHtml(html: string): string {
  let result = html;
  result = result.replace(/<p[^>]*>\s*(?:<br\s*\/?>)*\s*<\/p>/gi, "");
  // 清理 <p> 上的内联样式和 class，统一由外层 CSS 控制
  result = result.replace(/<p\b[^>]*>/gi, "<p>");
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
  result = result.replace(/<ol[^>]*>/gi, '<ol class="list-decimal pl-5">');
  return result;
}

// ============================================
// Main Component
// ============================================

export function CareersContent({ jobs, content }: CareersContentProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const title = content?.title || { en: "JOIN US", zh: "加入我们" };
  const description =
    content?.description || "我们正在寻找那些希望将想法转化为创新体验和解决方案的人";
  const contactEmail = content?.contactEmail || "hr@nihplod.com";
  const submitTip = content?.submitTip || {
    title: "简历投递",
    content: "请将简历直接投递到在招岗位的投递提交表单中\n简历命名格式：【应聘】职位名称 - 姓名",
  };

  const filterItems = [
    { id: "all", label: "全部职位", count: jobs.length },
    { id: "fulltime", label: "全职", count: jobs.filter((j) => j.type === "fulltime").length },
    { id: "parttime", label: "兼职", count: jobs.filter((j) => j.type === "parttime").length },
    { id: "intern", label: "实习", count: jobs.filter((j) => j.type === "intern").length },
  ];

  const filteredJobs = filterType === "all" ? jobs : jobs.filter((job) => job.type === filterType);

  return (
    <>
      <div className="scrollbar-hide flex h-screen flex-col overflow-y-auto bg-[#fefcf8]">
        {/* Top Bar */}
        <nav className="fixed left-0 right-0 top-0 z-50 flex w-full items-center justify-between bg-white/50 py-3 backdrop-blur-md md:py-6">
          <Link href="/" className="ml-[30px] md:ml-[80px]">
            <img
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              className="h-[30px] w-auto md:h-[40px]"
            />
          </Link>
          <div className="mr-[30px] flex items-center gap-6 md:mr-[85px] md:gap-10">
            <Link href="/contact" className="text-xs text-[#00263E] md:text-sm">
              联系我们
            </Link>
            <Link href="/terms" className="text-xs text-[#00263E] md:text-sm">
              服务条款
            </Link>
            <Link href="/privacy" className="text-xs text-[#00263E] md:text-sm">
              隐私政策
            </Link>
            <Link href="/" className="text-xs text-[#00263E] md:text-sm">
              返回首页
            </Link>
          </div>
        </nav>

        {/* Spacer */}
        <div className="h-[62px] shrink-0 md:h-[88px]" />

        {/* Header */}
        <div className="pb-8 pt-12 text-center md:pb-12 md:pt-20">
          <h1 className="mb-4 text-3xl font-light tracking-wider text-[#00263E] md:text-4xl">
            {title.zh}
          </h1>
          <p className="mx-auto max-w-md text-sm text-zinc-500 md:text-base">{description}</p>
        </div>

        {/* Filter Tabs */}
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-2xl">
            <div className="mb-8 flex items-center justify-center gap-2">
              {filterItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFilterType(item.id)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    filterType === item.id
                      ? "bg-[#00263E]/10 text-[#00263E]"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 opacity-60">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Job List */}
        <main className="container mx-auto flex-1 px-6 pb-16 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-2xl">
            {filteredJobs.length === 0 ? (
              <div className="flex min-h-[30vh] flex-col items-center justify-center text-center">
                <Briefcase className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
                <p className="text-zinc-400">暂无开放职位，请稍后再来查看</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredJobs.map((job) => (
                  <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Page Footer */}
        <footer className="border-t border-zinc-200">
          <div className="container mx-auto px-6 py-10 text-center md:px-8 lg:px-12 xl:px-16">
            <p className="text-xs tracking-wide text-zinc-500">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <Link
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-zinc-600"
              >
                沪ICP备2026014764号-1
              </Link>
              <span className="text-zinc-300">|</span>
              <Link
                href="http://www.beian.gov.cn/portal/registerSystemInfo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-zinc-600"
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
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-zinc-600"
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
      </div>

      {/* Job Detail Modal */}
      <AnimatePresence>
        {selectedJob && (
          <JobModal
            job={selectedJob}
            onClose={() => setSelectedJob(null)}
            contactEmail={contactEmail}
            submitTip={submitTip}
          />
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
          border: 1px solid #ebe8db;
          border-radius: 6px;
          font-size: 13px;
          color: #333;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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

// ============================================
// Job Card
// ============================================

function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const typeInfo = jobTypeMap[job.type] || { label: job.type, color: "bg-gray-100 text-gray-700" };
  const cityName = extractCity(job.location);
  const plainDescription = job.description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const descriptionSummary =
    plainDescription.length > 80 ? plainDescription.slice(0, 80) + "..." : plainDescription;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-zinc-200/60 p-5 text-left transition-all duration-200 hover:border-[#00263E]/30 hover:bg-white/50"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-zinc-900">{job.title}</h3>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-zinc-300"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 text-sm text-zinc-500">
        <span className="font-medium text-[#00263E]/60">{typeInfo.label}</span>
        <span className="text-zinc-300">|</span>
        {job.salary && (
          <>
            <span className="text-[#00263E]/70">{job.salary}</span>
            <span className="text-zinc-300">|</span>
          </>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {cityName}
        </span>
      </div>
      {descriptionSummary && (
        <p className="mt-2.5 line-clamp-1 text-sm leading-relaxed text-zinc-400">
          {descriptionSummary}
        </p>
      )}
    </button>
  );
}

// ============================================
// Job Detail Modal
// ============================================

function JobModal({
  job,
  onClose,
  contactEmail,
  submitTip,
}: {
  job: Job;
  onClose: () => void;
  contactEmail?: string;
  submitTip?: { title: string; content: string };
}) {
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeInfo = jobTypeMap[job.type] || { label: job.type, color: "bg-gray-100 text-gray-700" };

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 20;

    const tryInitMap = () => {
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
            viewMode: "2D",
          });
          const marker = new AMap.Marker({
            position: [lng, lat],
            title: job.location,
            label: {
              content: `<div class="amap-custom-label">${job.location}</div>`,
              direction: "bottom",
              offset: new AMap.Pixel(0, 10),
            },
          });
          map.add(marker);
        };

        if (job.longitude && job.latitude) {
          initRender(job.longitude, job.latitude);
          return;
        }

        if (job.location) {
          const geocoder = new AMap.Geocoder({ city: "021" });
          const ps = new AMap.PlaceSearch({ city: "021", pageSize: 1 });
          const rawLocation = job.location.split(" ").shift() || job.location;
          const pureBuilding = rawLocation.split(/[a-zA-Z0-9-]/)[0] || rawLocation;
          ps.search(pureBuilding, (status: string, result: any) => {
            if (status === "complete" && result?.poiList?.pois?.length) {
              const poi = result.poiList.pois[0];
              initRender(poi.location.lng, poi.location.lat);
            } else {
              geocoder.getLocation(job.location, (status: string, result: any) => {
                if (status === "complete" && result.geocodes.length) {
                  const geo = result.geocodes[0];
                  initRender(geo.location.lng, geo.location.lat);
                } else {
                  initRender(121.4899, 31.2402);
                }
              });
            }
          });
        } else {
          initRender(121.4899, 31.2402);
        }
      });
    };

    tryInitMap();
  }, [job.id, job.location, job.longitude, job.latitude]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      setErrorMessage("请填写姓名和电话");
      return;
    }
    if (!resumeFile) {
      setErrorMessage("请上传简历");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage(null);

    try {
      const data = new FormData();
      data.append("jobId", job.id);
      data.append("jobTitle", job.title);
      data.append("name", formData.name);
      data.append("phone", formData.phone);
      data.append("resume", resumeFile);

      await apiPost("/api/careers/apply", data);
      setSubmitStatus("success");
      setFormData({ name: "", phone: "" });
      setResumeFile(null);
    } catch (err) {
      setSubmitStatus("error");
      setErrorMessage(err instanceof ApiError ? err.message : "投递失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const descriptionHtml = normalizeJobHtml(job.description);
  const requirementsHtml = normalizeJobHtml(job.requirements);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 p-6">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">{job.title}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
              <span className={`rounded-full px-2 py-0.5 text-xs ${typeInfo.color}`}>
                {typeInfo.label}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {extractCity(job.location)}
              </span>
              {job.salary && <span>{job.salary}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Map */}
          {job.location && (
            <div id={`map-${job.id}`} className="h-48 w-full rounded-xl border border-zinc-100" />
          )}

          {/* Description */}
          <div>
            <h3 className="mb-3 text-base font-medium text-zinc-900">职位描述</h3>
            <div
              className="prose prose-sm max-w-none text-zinc-600 [&_li]:text-sm [&_li]:leading-7 [&_ol]:space-y-1 [&_p]:text-sm [&_p]:leading-7"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(descriptionHtml),
              }}
            />
          </div>

          {/* Requirements */}
          {job.requirements && (
            <div>
              <h3 className="mb-3 text-base font-medium text-zinc-900">任职要求</h3>
              <div
                className="prose prose-sm max-w-none text-zinc-600 [&_li]:text-sm [&_li]:leading-7 [&_ol]:space-y-1 [&_p]:text-sm [&_p]:leading-7"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(requirementsHtml),
                }}
              />
            </div>
          )}

          {/* Application Form */}
          <div className="border-t border-zinc-100 pt-6">
            <h3 className="mb-4 text-base font-medium text-zinc-900">投递简历</h3>
            <p className="mb-4 whitespace-pre-line text-sm text-zinc-500">{submitTip?.content}</p>

            {submitStatus === "success" ? (
              <div className="rounded-xl bg-green-50 p-6 text-center">
                <p className="font-medium text-green-700">投递成功！</p>
                <p className="mt-1 text-sm text-green-600">我们会尽快查看您的简历</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm text-zinc-600">姓名 *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10"
                      placeholder="您的姓名"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-zinc-600">电话 *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((d) => ({ ...d, phone: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10"
                      placeholder="您的手机号"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-zinc-600">简历 *</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-500 transition-colors hover:border-[#00263E]/40 hover:text-[#00263E]"
                  >
                    {resumeFile ? (
                      <>
                        <FileText className="h-5 w-5 text-[#00263E]" />
                        <span className="text-[#00263E]">{resumeFile.name}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        <span>上传简历 (PDF, DOC, DOCX)</span>
                      </>
                    )}
                  </button>
                </div>

                {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00263E] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#00263E]/90 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      提交中...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      提交申请
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </m.div>
    </m.div>
  );
}
