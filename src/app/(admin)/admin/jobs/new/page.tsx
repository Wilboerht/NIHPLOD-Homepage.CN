"use client";

import { ArrowLeft } from "lucide-react";
import { JobForm } from "@/components/admin/JobForm";
import { IconButton } from "@/components/admin/IconButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { RequirePermission } from "@/components/admin/RequirePermission";

function NewJobContent() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-1 sm:gap-2">
        <IconButton
          href="/admin/jobs"
          label="返回职位列表"
          className="-ml-2 -mt-2 shrink-0 sm:-mt-1"
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <PageHeader title="新增职位" description="创建新的招聘职位" />
        </div>
      </div>

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
