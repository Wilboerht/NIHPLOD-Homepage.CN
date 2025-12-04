"use client";

import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Briefcase,
  Clock,
  Mail,
  ChevronDown,
  Sparkles,
  Heart,
  Globe,
  Users,
} from "lucide-react";
import { FloatingCardLayout } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";
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

// 企业文化
const cultures = [
  {
    icon: Sparkles,
    title: "追求卓越",
    description: "对产品品质的极致追求，对细节的严苛把控",
  },
  {
    icon: Heart,
    title: "热爱生活",
    description: "相信美的力量，享受每一个护肤时刻",
  },
  {
    icon: Globe,
    title: "国际视野",
    description: "摩纳哥基因，东方智慧，全球化思维",
  },
  {
    icon: Users,
    title: "协作共创",
    description: "扁平化管理，开放沟通，共同成长",
  },
];

interface CareersContentProps {
  jobs: Job[];
}

/**
 * 招聘页面内容组件
 */
export function CareersContent({ jobs }: CareersContentProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <FloatingCardLayout
      backgroundImage="/images/careers-bg.jpg"
      backgroundAlt="加入我们"
      initialState="expanded"
      pageTitle="加入我们"
    >
      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        <p className="text-xs uppercase tracking-widest text-brand-gold">
          JOIN US
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
          加入我们
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/70">
          与热爱美好事物的人一起，创造高端护肤的未来。
        </p>
      </m.div>

      {/* 企业文化 */}
      <m.div
        className="mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2 className="mb-4 text-center font-serif text-lg text-brand-charcoal">
          我们的文化
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cultures.map((culture) => (
            <div
              key={culture.title}
              className="rounded-xl border border-brand-beige bg-white p-4 text-center"
            >
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
                <culture.icon className="h-5 w-5 text-brand-gold" />
              </div>
              <h3 className="font-serif text-sm text-brand-charcoal">
                {culture.title}
              </h3>
              <p className="mt-1 text-xs text-brand-charcoal/60">
                {culture.description}
              </p>
            </div>
          ))}
        </div>
      </m.div>

      {/* 职位列表 */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="mb-4 font-serif text-lg text-brand-charcoal">
          开放职位
          <span className="ml-2 text-sm font-normal text-brand-charcoal/60">
            ({jobs.length})
          </span>
        </h2>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-brand-beige bg-white p-8 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-brand-beige" />
            <p className="text-brand-charcoal/60">
              暂无开放职位，请稍后再来查看
            </p>
            <p className="mt-2 text-sm text-brand-charcoal/40">
              或发送简历至{" "}
              <a
                href="mailto:hr@nihplod.com"
                className="text-brand-gold hover:underline"
              >
                hr@nihplod.com
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                index={index}
                isExpanded={expandedId === job.id}
                onToggle={() => toggleExpand(job.id)}
              />
            ))}
          </div>
        )}
      </m.div>

      {/* 投递方式 */}
      <m.div
        className="mt-8 rounded-xl bg-brand-gold/10 p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-serif text-base text-brand-charcoal">
              简历投递
            </h3>
            <p className="mt-1 text-sm text-brand-charcoal/70">
              请将简历发送至{" "}
              <a
                href="mailto:hr@nihplod.com"
                className="font-medium text-brand-gold hover:underline"
              >
                hr@nihplod.com
              </a>
              <br />
              邮件标题格式：【应聘】职位名称 - 姓名
            </p>
          </div>
        </div>
      </m.div>

      {/* 底部间距 */}
      <div className="h-20" />
    </FloatingCardLayout>
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

