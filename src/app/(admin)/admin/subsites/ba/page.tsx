"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Award, Building2, Clock, FileCheck2, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RequirePermission } from "@/components/admin/RequirePermission";
import type { BaDashboardPayload } from "@/types/ba-dashboard";

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  INVESTIGATING: "调查中",
  RESOLVED: "已解决",
  REJECTED: "已驳回",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-charcoal/60">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-charcoal">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-brand-charcoal/50">{hint}</p>}
        </div>
        <span className="rounded-lg bg-brand-primary/[0.06] p-2 text-brand-primary">{icon}</span>
      </div>
    </PanelCard>
  );
}

function BaDashboardContent() {
  const [payload, setPayload] = useState<BaDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const takeLatest = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<BaDashboardPayload>("/api/admin/subsites/ba/overview");
      if (!isLatest()) return;
      setPayload(data);
    } catch (err) {
      if (!isLatest()) return;
      setError(err instanceof ApiError ? err.message : "加载 BA 看板失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [takeLatest]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const dashboard = payload?.dashboard ?? null;
  const canReadComplaints = payload?.canReadComplaints ?? false;
  const recentComplaints = dashboard?.complaints.recent ?? [];
  const recentAudit = dashboard?.recentAudit ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="BA 证书平台"
        description="品牌授权与打假举报概览（只读）"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
            刷新
          </Button>
        }
      />

      {error && (
        <PanelCard className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</PanelCard>
      )}

      {payload?.degraded && (
        <PanelCard className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              BA 服务暂时不可用：{payload.reason === "not_configured" ? "内部 API 未配置" : "请稍后重试"}
            </span>
          </div>
        </PanelCard>
      )}

      {loading && !dashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <PanelCard key={index} className="h-24 animate-pulse bg-brand-charcoal/[0.03]">
              <span className="sr-only">加载中</span>
            </PanelCard>
          ))}
        </div>
      ) : dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="有效证书"
              value={dashboard.certificates.valid}
              hint={`累计 ${dashboard.certificates.total}`}
              icon={<FileCheck2 className="h-5 w-5" />}
            />
            <StatCard
              label="待审证书"
              value={dashboard.certificates.pending}
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              label="30 天内到期"
              value={dashboard.certificates.expiring30d}
              icon={<ShieldAlert className="h-5 w-5" />}
            />
            <StatCard
              label="待处理举报"
              value={dashboard.complaints.pending}
              hint={`调查中 ${dashboard.complaints.investigating}`}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard label="经销商" value={dashboard.dealers.total} icon={<Building2 className="h-5 w-5" />} />
            <StatCard
              label="管理员"
              value={dashboard.admins.total}
              hint={`SSO ${dashboard.admins.sso} / 本地 ${dashboard.admins.local}`}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="本月已解决举报"
              value={dashboard.complaints.resolvedThisMonth}
              icon={<Award className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard className="p-4">
              <h2 className="text-sm font-semibold text-brand-charcoal">最近举报</h2>
              {canReadComplaints ? (
                recentComplaints.length > 0 ? (
                  <ul className="mt-3 divide-y divide-brand-charcoal/5">
                    {recentComplaints.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`/admin/messages?source=ba&id=${encodeURIComponent(item.id)}`}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-brand-primary"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {item.channel || item.descriptionPreview}
                            </span>
                            <span className="block truncate text-xs text-brand-charcoal/55">
                              {item.descriptionPreview}
                            </span>
                          </span>
                          <Badge variant={item.status === "PENDING" ? "warning" : "secondary"}>
                            {COMPLAINT_STATUS_LABELS[item.status] ?? item.status}
                          </Badge>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-brand-charcoal/55">暂无举报</p>
                )
              ) : (
                <p className="mt-3 text-sm text-brand-charcoal/55">
                  需要 BA 举报查看权限才能看到举报摘要。
                </p>
              )}
            </PanelCard>

            <PanelCard className="p-4">
              <h2 className="text-sm font-semibold text-brand-charcoal">最近审计</h2>
              {recentAudit.length > 0 ? (
                <ul className="mt-3 divide-y divide-brand-charcoal/5">
                  {recentAudit.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{item.action}</span>
                      <span className="shrink-0 text-xs text-brand-charcoal/55">
                        {item.actorName || "系统"} · {formatDateTime(item.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-brand-charcoal/55">暂无审计记录</p>
              )}
            </PanelCard>
          </div>

          <p className="text-xs text-brand-charcoal/45">
            数据生成时间：{formatDateTime(dashboard.generatedAt)}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function BaSubsiteDashboardPage() {
  return (
    <RequirePermission permissions={["ba:access", "ba:admin"]}>
      <BaDashboardContent />
    </RequirePermission>
  );
}
