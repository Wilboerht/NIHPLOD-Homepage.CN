"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JobForm } from "@/components/admin/JobForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { RequirePermission } from "@/components/admin/RequirePermission";

function NewJobContent() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            <Link
              href="/admin/jobs"
              aria-label="返回职位列表"
              className="rounded-lg p-1.5 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            新增职位
          </>
        }
        description="创建新的招聘职位"
      />

      {/* 职位表单 */}
      <JobForm />
    </div>
  );
}

export default function NewJobPage() {
  return (
    <RequirePermission permission="jobs:write">
      <NewJobContent />
    </RequirePermission>
  );
}
