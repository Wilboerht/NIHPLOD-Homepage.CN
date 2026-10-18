"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";

const REASON_TEXT: Record<string, string> = {
  forbidden: "您的账号没有测肤子站访问权限。请联系主站超级管理员，在「管理员管理」中授予「测肤子站访问」。",
  not_found: "管理员账号不存在或已被删除。",
  invalid_request: "授权请求不合法，请从测肤子站后台重新发起登录。",
  server_error: "授权服务暂时不可用，请稍后重试。",
};

export default function AdminSsoDeniedPage() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") || "forbidden";
  const message = REASON_TEXT[reason] || REASON_TEXT.forbidden;

  return (
    <div className="space-y-6">
      <PageHeader title="无法访问测肤子站" description="主站管理员 SSO" />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-900">{message}</p>
            <p className="text-xs text-amber-700">
              子站管理员账号由主站统一管理，子站不再提供管理员新增/改密入口。
            </p>
            <Link
              href="/admin"
              className="inline-block text-sm font-medium text-amber-900 underline underline-offset-4"
            >
              返回主站管理后台
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
