"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiPost } from "@/lib/api-client";

/** 仪表盘统计缓存默认 5 分钟；提供手动失效入口，避免“数字不更新”的困惑。 */
export function DashboardStatsRefresh() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      await apiPost("/api/admin/stats/refresh", {});
      toast.success("统计数据已刷新");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新统计失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      leftIcon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
      onClick={() => void refresh()}
      disabled={loading}
    >
      {loading ? "刷新中..." : "刷新统计"}
    </Button>
  );
}
