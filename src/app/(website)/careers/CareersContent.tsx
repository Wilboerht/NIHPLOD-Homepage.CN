"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { MapPin, Briefcase, X, Upload, FileText, Send, Loader2, Home, Menu, ChevronDown } from "lucide-react";
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
  fulltime: { label: "全职", color: "bg-brand-primary/15 text-brand-primary" },
  parttime: { label: "兼职", color: "bg-brand-charcoal/10 text-brand-charcoal/70" },
  intern: { label: "实习", color: "bg-brand-beige text-brand-charcoal/70" },
};

interface CareersPageContent {
  title?: { en: string; zh: string };
  description?: string;
  contactEmail?: string;
  submitTip?: { title: string; content: string };
}

interface CareersContentProps {
  jobs: Job[];
  content?: CareersPageContent;
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        desktopMenuRef.current &&
        !desktopMenuRef.current.contains(event.target as Node)
      ) {
        setDesktopMenuOpen(false);
      }
    };

    if (desktopMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [desktopMenuOpen]);

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
      <div className="flex min-h-dvh flex-col bg-[#fefcf8] mb-[-7rem] lg:mb-[-6rem]">
        {/* Top Bar */}
        <nav
          className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-6 backdrop-blur-md md:px-20"
          style={{ pointerEvents: "none" }}
          aria-label="主导航"
        >
          <div
            className="relative flex w-full items-center justify-center md:justify-between"
            style={{ pointerEvents: "auto" }}
          >
            <Link href="/">
              <div className="relative h-[30px] w-[107px] md:h-[40px] md:w-[143px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-center md:object-left"
                  priority
                />
              </div>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              <Link
                href="/contact"
                className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
              >
                联系我们
                <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
              </Link>
              <Link
                href="/terms"
                className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
              >
                服务条款
                <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
              </Link>
              <Link
                href="/privacy"
                className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
              >
                隐私政策
                <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
              </Link>
              {/* Desktop More Menu */}
              <div ref={desktopMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDesktopMenuOpen((prev) => !prev)}
                  className="group inline-flex items-center gap-1.5 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
                  aria-expanded={desktopMenuOpen}
                  aria-controls="careers-desktop-menu"
                  aria-label="更多页面"
                >
                  菜单
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-500 ${desktopMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {desktopMenuOpen && (
                    <m.div
                      id="careers-desktop-menu"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-brand-charcoal/5 bg-[#FBF8F0] p-2 shadow-[0_2px_4px_-1px_rgba(0,38,62,0.05),0_8px_16px_-2px_rgba(0,38,62,0.08),0_24px_48px_-6px_rgba(0,38,62,0.06)]"
                    >
                      <Link
                        href="/products"
                        onClick={() => setDesktopMenuOpen(false)}
                        className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                      >
                        产品系列
                      </Link>
                      <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                      <Link
                        href="/guide"
                        onClick={() => setDesktopMenuOpen(false)}
                        className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                      >
                        护肤指南
                      </Link>
                      <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                      <Link
                        href="/faq"
                        onClick={() => setDesktopMenuOpen(false)}
                        className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                      >
                        常见问题
                      </Link>
                      <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                      <Link
                        href="/about"
                        onClick={() => setDesktopMenuOpen(false)}
                        className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/5"
                      >
                        品牌故事
                      </Link>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              <Link
                href="/"
                className="group relative inline-flex items-center gap-2 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
              >
                <Home className="h-4 w-4" /> 返回首页
                <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="absolute left-0 flex h-10 w-10 items-center justify-center md:hidden"
              aria-label="打开菜单"
              aria-expanded={mobileMenuOpen}
              aria-controls="careers-nav-panel"
            >
              <Menu className="h-6 w-6 text-brand-charcoal" />
            </button>
          </div>
        </nav>

        <div
          id="careers-nav-panel"
          ref={mobileMenuRef}
          role="dialog"
          aria-modal={mobileMenuOpen}
          aria-label="导航菜单"
          className={`fixed inset-0 z-[100] transition-all duration-500 md:hidden ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
        >
          <div
            className="absolute inset-0 bg-brand-charcoal/20 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#fefcf8] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
          >
            <div className="flex h-full flex-col px-6">
              {/* Logo + 关闭按钮同行 */}
              <div className="mb-8 flex items-center justify-between rounded-xl px-4 py-4">
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <div className="relative h-[30px] w-[107px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      fill
                      className="object-contain object-left"
                    />
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                  aria-label="关闭菜单"
                >
                  <X className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Link
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
                >
                  联系我们
                </Link>
                <Link
                  href="/terms"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
                >
                  服务条款
                </Link>
                <Link
                  href="/privacy"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
                >
                  隐私政策
                </Link>
              </div>

              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-8 flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
              >
                <Home className="h-5 w-5" />
                返回首页
              </Link>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="h-[88px] shrink-0 md:h-[88px]" />

        {/* Header */}
        <div className="pb-8 pt-8 text-center md:pb-12 md:pt-20">
          <h1 className="mb-2 text-[19px] font-normal tracking-[0.15em] text-brand-charcoal md:mb-4 md:text-4xl md:font-light md:tracking-wider">
            {title.zh}
          </h1>
          <div className="mx-auto mb-4 w-[70px] border-b border-brand-primary md:hidden" />
          <p className="mx-auto max-w-2xl px-6 text-[13px] font-light tracking-[0.06em] leading-[1.8] text-brand-charcoal/60 md:px-0 md:text-base md:tracking-[0.12em]">{description}</p>
        </div>

        {/* Filter Tabs */}
        <div className="container mx-auto px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center justify-center gap-1.5 md:mb-8 md:gap-2">
              {filterItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFilterType(item.id)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-light tracking-[0.08em] transition-colors md:px-4 md:py-2 md:text-[15px] md:tracking-[0.12em] ${
                    filterType === item.id
                      ? "bg-[#00263E]/10 text-brand-charcoal"
                      : "text-brand-charcoal/50 hover:text-brand-charcoal/70"
                  }`}
                >
                  {item.label}
                  <span className="ml-1 opacity-60 md:ml-1.5">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Job List */}
        <main className="container mx-auto flex-1 px-6 pb-10 md:px-8 md:pb-16 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-2xl">
            {filteredJobs.length === 0 ? (
              <div className="flex min-h-[30vh] flex-col items-center justify-center text-center">
                <Briefcase className="mx-auto mb-3 h-10 w-10 text-[#E4DFD9]" />
                <p className="text-[15px] font-light tracking-[0.12em] text-brand-charcoal/40">暂无开放职位，请稍后再来查看</p>
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
        <footer className="md:border-t md:border-brand-charcoal/10">
          <div className="container mx-auto px-6 py-6 text-center md:px-8 md:py-10 lg:px-12 xl:px-16">
            <p className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </p>
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
      className="w-full rounded-xl border border-zinc-200/60 p-4 text-left transition-all duration-200 active:scale-[0.98] active:bg-brand-charcoal/[0.02] md:p-5 md:hover:border-[#00263E]/30 md:hover:bg-white/50"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-light tracking-[0.08em] text-brand-charcoal md:text-lg md:tracking-[0.12em]">{job.title}</h3>
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
      <div className="mt-2.5 flex items-center gap-2.5 text-[13px] font-light text-brand-charcoal/70">
        <span className="font-light text-brand-charcoal/60">{typeInfo.label}</span>
        <span className="text-zinc-300">|</span>
        {job.salary && (
          <>
            <span className="text-brand-charcoal/70">{job.salary}</span>
            <span className="text-zinc-300">|</span>
          </>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {cityName}
        </span>
      </div>
      {descriptionSummary && (
        <p className="mt-2.5 line-clamp-1 text-[13px] leading-relaxed text-brand-charcoal/50">
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
  const [isDesktop, setIsDesktop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeInfo = jobTypeMap[job.type] || { label: job.type, color: "bg-gray-100 text-gray-700" };

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 20;

    const tryInitMap = () => {
      const amap = window.AMap;
      if (!amap) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryInitMap, 200);
        }
        return;
      }

      const container = document.getElementById(`map-${job.id}`);
      if (!container) return;

      amap.plugin(["AMap.Geocoder", "AMap.PlaceSearch"], () => {
        const initRender = (lng: number, lat: number) => {
          const map = new amap.Map(container, {
            zoom: 16,
            center: [lng, lat],
            viewMode: "2D",
          });
          const marker = new amap.Marker({
            position: [lng, lat],
            title: job.location,
            label: {
              content: `<div class="amap-custom-label">${job.location}</div>`,
              direction: "bottom",
              offset: new amap.Pixel(0, 10),
            },
          });
          map.add(marker);
        };

        if (job.longitude && job.latitude) {
          initRender(job.longitude, job.latitude);
          return;
        }

        if (job.location) {
          const geocoder = new amap.Geocoder({ city: "021" });
          const ps = new amap.PlaceSearch({ city: "021", pageSize: 1 });
          const rawLocation = job.location.split(" ").shift() || job.location;
          const pureBuilding = rawLocation.split(/[a-zA-Z0-9-]/)[0] || rawLocation;
          ps.search(pureBuilding, (status: string, result: AMap.PlaceSearchResult) => {
            if (status === "complete" && result?.poiList?.pois?.length) {
              const poi = result.poiList.pois[0];
              initRender(poi.location.lng, poi.location.lat);
            } else {
              geocoder.getLocation(job.location, (status: string, result: AMap.GeocoderResult) => {
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
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[200] flex items-end justify-center md:items-center md:p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <m.div
        initial={isDesktop ? { opacity: 0 } : { opacity: 0, y: "100%" }}
        animate={isDesktop ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={isDesktop ? { opacity: 0 } : { opacity: 0, y: "100%" }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 p-4 md:p-6">
          <div>
            <h2 className="text-[17px] font-normal tracking-[0.08em] text-brand-charcoal md:text-xl md:font-light md:tracking-[0.12em]">{job.title}</h2>
            <div className="mt-2 flex items-center gap-2 text-[13px] font-light text-brand-charcoal/70">
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
        <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
          {/* Map */}
          {job.location && (
            <div id={`map-${job.id}`} className="h-48 w-full rounded-xl border border-zinc-100" />
          )}

          {/* Description */}
          <div>
            <h3 className="mb-3 text-base font-light tracking-[0.12em] text-brand-charcoal">职位描述</h3>
            <div
              className="prose prose-sm max-w-none font-light text-brand-charcoal/80 [&_li]:text-sm [&_li]:leading-7 [&_ol]:space-y-1 [&_p]:text-sm [&_p]:leading-7"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(descriptionHtml),
              }}
            />
          </div>

          {/* Requirements */}
          {job.requirements && (
            <div>
              <h3 className="mb-3 text-base font-light tracking-[0.12em] text-brand-charcoal">任职要求</h3>
              <div
                className="prose prose-sm max-w-none font-light text-brand-charcoal/80 [&_li]:text-sm [&_li]:leading-7 [&_ol]:space-y-1 [&_p]:text-sm [&_p]:leading-7"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(requirementsHtml),
                }}
              />
            </div>
          )}

          {/* Application Form */}
          <div className="border-t border-zinc-100 pt-6">
            <h3 className="mb-4 text-base font-light tracking-[0.12em] text-brand-charcoal">投递简历</h3>
            <p className="mb-4 whitespace-pre-line text-[14px] font-light text-brand-charcoal/70">{submitTip?.content}</p>

            {submitStatus === "success" ? (
              <div className="rounded-xl bg-green-50 p-6 text-center">
                <p className="text-[15px] font-light text-green-700">投递成功！</p>
                <p className="mt-1 text-[13px] text-green-600">我们会尽快查看您的简历</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[14px] font-light text-brand-charcoal/60">姓名 *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-[#00263E]/40 focus:ring-4 focus:ring-[#00263E]/10"
                      placeholder="您的姓名"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[14px] font-light text-brand-charcoal/60">电话 *</label>
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
                  <label className="mb-1.5 block text-[14px] font-light text-brand-charcoal/60">简历 *</label>
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
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-4 text-[14px] font-light text-brand-charcoal/70 transition-colors hover:border-[#00263E]/40 hover:text-brand-charcoal"
                  >
                    {resumeFile ? (
                      <>
                        <FileText className="h-5 w-5 text-brand-charcoal" />
                        <span className="text-brand-charcoal">{resumeFile.name}</span>
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00263E] px-6 py-3 text-sm font-light tracking-[0.15em] text-white transition-colors hover:bg-[#00263E]/90 disabled:opacity-50"
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
