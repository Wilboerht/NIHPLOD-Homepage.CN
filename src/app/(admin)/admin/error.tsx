"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiConsole } from "@/lib/logger";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    apiConsole.error("管理端页面渲染异常:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-brand-charcoal/10 bg-white px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-brand-charcoal">页面加载失败</h2>
        <p className="text-sm text-brand-charcoal/65">
          请稍后重试。如果问题持续存在，请将错误编号反馈给技术团队。
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-brand-charcoal/45">错误编号：{error.digest}</p>
        )}
      </div>
      <Button onClick={reset} leftIcon={<RefreshCw className="h-4 w-4" />}>
        重新加载
      </Button>
    </div>
  );
}
