"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { JobForm } from "@/components/admin/JobForm";
import { useToast } from "@/components/ui/Toast";
import { apiGet, ApiError } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";

interface JobData {
  id: string;
  title: string;
  titleEn: string;
  location: string;
  type: "fulltime" | "parttime" | "intern";
  description: string;
  requirements: string;
  salary: string | null;
  published: boolean;
}

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const { error: showError } = useToast();

  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取职位数据
  useEffect(() => {
    const fetchJob = async () => {
      try {
        const data = await apiGet<JobData>(`/api/admin/jobs/${jobId}`);
        setJob(data);
      } catch (error) {
        apiConsole.error("获取职位数据失败:", error);
        if (error instanceof ApiError && error.status === 404) {
          showError("职位不存在");
        } else {
          showError("获取职位失败");
        }
        router.push("/admin/jobs");
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId, router, showError]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-amber-50 p-4">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="mt-4 text-lg font-medium text-brand-charcoal">职位未找到</h2>
        <p className="mt-1 text-sm text-brand-charcoal/50">该职位可能已被删除或不存在</p>
        <Link
          href="/admin/jobs"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          返回职位列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/jobs"
          className="rounded-lg p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-medium text-brand-charcoal">编辑职位</h1>
          <p className="mt-0.5 text-sm text-brand-charcoal/50">{job.title}</p>
        </div>
      </div>

      {/* 职位表单 */}
      <JobForm
        jobId={jobId}
        initialData={{
          title: job.title,
          titleEn: job.titleEn,
          location: job.location,
          type: job.type,
          description: job.description,
          requirements: job.requirements,
          salary: job.salary || "",
          published: job.published,
        }}
      />
    </div>
  );
}
