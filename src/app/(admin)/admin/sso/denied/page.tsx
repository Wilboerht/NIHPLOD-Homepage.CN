"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { apiPost } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";

function buildReasonText(site: string): Record<string, string> {
  return {
    forbidden: `您的账号没有${site}访问权限。请联系主站超级管理员，在「管理员管理」中授予子站访问权限。`,
    not_found: "管理员账号不存在或已被删除。",
    invalid_request: `授权请求不合法，请从${site}后台重新发起登录。`,
    server_error: "授权服务暂时不可用，请稍后重试。",
  };
}

function AdminSsoDeniedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") || "forbidden";
  // 子站名由上游授权端透传，未提供时泛化展示
  const site = searchParams.get("site") || "该子站";
  const reasonText = buildReasonText(site);
  const message = reasonText[reason] || reasonText.forbidden;
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSwitchAccount = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiPost("/api/admin/logout");
      router.push("/admin-login?reauth=1");
      router.refresh();
    } catch (error) {
      apiConsole.error("登出失败:", error);
      setLoggingOut(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`无法访问${site}`} description="主站管理员 SSO" />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-900">{message}</p>
            <p className="text-xs text-amber-700">
              子站管理员账号由主站统一管理，子站不再提供管理员新增/改密入口。
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link
                href="/admin"
                className="text-sm font-medium text-amber-900 underline underline-offset-4"
              >
                返回主站管理后台
              </Link>
              {reason === "forbidden" && (
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {loggingOut ? "正在退出..." : "退出当前账号后换号登录"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSsoDeniedPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-brand-charcoal/65">加载中...</div>}>
      <AdminSsoDeniedContent />
    </Suspense>
  );
}
