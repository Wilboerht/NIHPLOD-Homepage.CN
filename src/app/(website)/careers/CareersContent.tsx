"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
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

interface CareersContentProps {
  jobs: Job[];
}

/**
 * 招聘页面内容组件
 * 直接显示开放职位
 */
export function CareersContent({ jobs }: CareersContentProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  return (
    <>
      {/* 全屏背景容器 - 始终展开到底部 */}
      <div className="fixed inset-0 bottom-0">
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
          className="absolute bottom-4 left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16 lg:top-6"
        >
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <div className="w-full flex-1 overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl">
              <div className="flex h-full flex-col overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                {/* 页面标题 */}
                <div className="mb-6 text-center sm:mb-8">
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

                {/* 开放职位内容 */}
                <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
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
                            请将简历直接投递到在招岗位的<span className="text-brand-gold/70"> 投递提交表单 </span>中
                            <br />简历命名格式：【应聘】职位名称 - 姓名
                          </p>
                        </div>
                      </div>
                    </m.div>
                  </div>
                </div>
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

      {/* 职位详情弹窗 */}
      <AnimatePresence>
        {selectedJob && (
          <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}
      </AnimatePresence>
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
      className="w-full overflow-hidden rounded-xl border border-brand-beige bg-white text-left transition-all hover:border-brand-gold/50 hover:shadow-md"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex w-full items-center justify-between p-5">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-serif text-lg text-brand-charcoal sm:text-xl">
              {job.title}
            </h3>
            <span className="text-sm text-brand-charcoal/50">{job.titleEn}</span>
            <span
              className={cn("rounded-full px-2.5 py-1 text-sm", typeInfo.color)}
            >
              {typeInfo.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-brand-charcoal/60">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
            {job.salary && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {job.salary}
              </span>
            )}
          </div>
        </div>
        <div className="ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
          <FileText className="h-5 w-5 text-brand-gold" />
        </div>
      </div>
    </m.button>
  );
}

/**
 * 职位详情弹窗组件
 */
function JobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      if (response.ok) {
        setSubmitStatus("success");
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setSubmitStatus("error");
      }
    } catch {
      setSubmitStatus("error");
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
      {/* 背景遮罩 */}
      <m.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* 弹窗内容 */}
      <m.div
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-brand-charcoal/10 transition-colors hover:bg-brand-charcoal/20"
        >
          <X className="h-4 w-4 text-brand-charcoal" />
        </button>

        {/* 内容区域 */}
        <div className="max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* 头部 */}
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

          {/* 职位详情 */}
          <div className="border-b border-brand-beige p-6">
            <div className="mb-5">
              <h4 className="mb-3 text-sm font-medium text-brand-gold">职位描述</h4>
              <div
                className="text-sm leading-relaxed text-brand-charcoal/80 [&>p]:mb-3 [&>p]:border-l-2 [&>p]:border-brand-beige [&>p]:pl-3"
                dangerouslySetInnerHTML={{ __html: job.description }}
              />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium text-brand-gold">任职要求</h4>
              <div
                className="text-sm leading-relaxed text-brand-charcoal/80 [&>p]:mb-3 [&>p]:border-l-2 [&>p]:border-brand-beige [&>p]:pl-3"
                dangerouslySetInnerHTML={{ __html: job.requirements }}
              />
            </div>
          </div>

          {/* 投递表单 */}
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
                {/* 姓名 */}
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
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none transition-colors focus:border-brand-gold"
                    placeholder="请输入您的姓名"
                  />
                </div>

                {/* 手机号 */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                    <Phone className="h-3.5 w-3.5" />
                    手机号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none transition-colors focus:border-brand-gold"
                    placeholder="请输入您的手机号"
                  />
                </div>

                {/* 邮箱 */}
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
                    className="w-full rounded-lg border border-brand-beige bg-white px-4 py-2.5 text-sm text-brand-charcoal outline-none transition-colors focus:border-brand-gold"
                    placeholder="请输入您的邮箱"
                  />
                </div>

                {/* 简历上传 */}
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
                        点击上传简历（支持 PDF、DOC、DOCX）
                      </>
                    )}
                  </button>
                  <p className="mt-1.5 text-xs text-brand-charcoal/50">
                    简历命名格式：【应聘】{job.title} - 姓名
                  </p>
                </div>

                {/* 错误提示 */}
                {submitStatus === "error" && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    投递失败，请稍后重试或直接发送简历至 hr@nihplod.com
                  </div>
                )}

                {/* 提交按钮 */}
                <button
                  type="submit"
                  disabled={isSubmitting || !resumeFile}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all",
                    isSubmitting || !resumeFile
                      ? "cursor-not-allowed bg-brand-charcoal/30"
                      : "bg-brand-gold hover:bg-brand-gold/90"
                  )}
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

