"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JobForm } from "@/components/admin/JobForm";

export default function NewJobPage() {
  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/jobs"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">新增职位</h1>
          <p className="mt-0.5 text-sm text-gray-500">创建新的招聘职位</p>
        </div>
      </div>

      {/* 职位表单 */}
      <JobForm />
    </div>
  );
}
