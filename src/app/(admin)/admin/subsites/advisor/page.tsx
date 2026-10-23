"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { buildAdvisorAdminLink } from "@/lib/advisor-admin-link";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { StatStrip } from "@/components/admin/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type {
  AdvisorAIHealth,
  AdvisorDashboardPayload,
  AdvisorSubsiteDashboard,
} from "@/types/advisor-dashboard";

const DEGRADED_MESSAGES: Record<string, string> = {
  not_configured: "未配置测肤子站内部接口密钥",
  unauthorized: "主站与测肤子站之间的内部鉴权失败",
  rate_limited: "测肤子站请求过于频繁，请稍后重试",
  upstream_error: "测肤子站暂时不可用",
};

const SKIN_TYPE_LABELS: Record<string, string> = {
  dry: "干性",
  oily: "油性",
  combination: "混合性",
  combination_dry: "混合偏干",
  combination_oily: "混合偏油",
  sensitive: "敏感肌",
  normal: "中性",
};

const WEEKDAY_LABELS: Record<string, string> = {
  Mon: "周一",
  Tue: "周二",
  Wed: "周三",
  Thu: "周四",
  Fri: "周五",
  Sat: "周六",
  Sun: "周日",
};

const QUICK_LINKS = [
  { label: "子站仪表盘", path: "/admin", description: "测肤子站数据总览" },
  { label: "测肤用户", path: "/admin/users", description: "子站用户列表与配额" },
  { label: "推荐规则", path: "/admin/recommendation-rules", description: "AI 推荐条件与优先级" },
  { label: "AI 成本", path: "/admin/ai-costs", description: "Token 成本与失败记录" },
  { label: "测肤产品", path: "/admin/products", description: "推荐产品与肤质标签" },
  { label: "安全审计", path: "/admin/audit-logs", description: "子站管理员操作记录" },
] as const;

function requestDashboard(): Promise<AdvisorDashboardPayload> {
  return apiGet<AdvisorDashboardPayload>("/api/admin/subsites/advisor/overview");
}

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

function healthBadge(health: AdvisorAIHealth | null | undefined) {
  if (!health) return { label: "未知", variant: "secondary" as const };
  if (health.status === "critical") return { label: "异常", variant: "danger" as const };
  if (health.status === "warning") return { label: "注意", variant: "warning" as const };
  return { label: "正常", variant: "success" as const };
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      <PanelCard className="p-3 sm:p-4">
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <div className="mb-2 h-3 w-16 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="h-3 w-14 animate-pulse rounded bg-brand-charcoal/[0.06]" />
                  <div className="h-6 w-20 animate-pulse rounded bg-brand-charcoal/[0.06]" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-brand-charcoal/10 pt-3 xl:col-span-5 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            <div className="mb-3 h-3 w-14 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-5 animate-pulse rounded bg-brand-charcoal/[0.04]" />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-brand-charcoal/10 pt-3">
          <div className="h-5 w-full animate-pulse rounded bg-brand-charcoal/[0.04]" />
        </div>
      </PanelCard>
      <PanelCard className="p-3 sm:p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="h-3 w-20 animate-pulse rounded bg-brand-charcoal/[0.06]" />
              <div className="h-24 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}

function QuickLinks({ canOpenAdvisor }: { canOpenAdvisor: boolean }) {
  if (!canOpenAdvisor) {
    return (
      <p className="text-xs text-brand-charcoal/60">
        需要测肤子站访问权限（advisor:access）才能打开子站后台，请联系超级管理员授权。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_LINKS.map((link) => (
        <a
          key={link.path}
          href={buildAdvisorAdminLink(link.path)}
          target="_blank"
          rel="noopener noreferrer"
          title={link.description}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-brand-charcoal/10 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal/75 transition-colors hover:border-brand-primary/30 hover:bg-brand-primary/[0.03] hover:text-brand-primary"
        >
          {link.label}
          <ExternalLink className="h-3 w-3 text-brand-charcoal/35 group-hover:text-brand-primary" />
        </a>
      ))}
    </div>
  );
}

function BudgetBar({
  label,
  usage,
  budget,
  percent,
}: {
  label: string;
  usage: number;
  budget: number;
  percent: number;
}) {
  const configured = budget > 0;
  const width = configured ? Math.min(Math.max(percent, 0), 100) : 0;
  const color =
    percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-brand-charcoal/60">{label}</span>
        <span className="font-mono tabular-nums text-brand-charcoal/80">
          ¥{usage.toFixed(2)}
          {configured ? ` / ¥${budget.toFixed(2)} · ${percent}%` : " · 未配置"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function AIHealthSummary({ health }: { health: AdvisorAIHealth | null }) {
  if (!health) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-brand-charcoal">AI 健康</h2>
          <Badge variant="secondary" size="sm">
            未知
          </Badge>
        </div>
        <p className="mt-2 text-xs text-brand-charcoal/60">AI 健康数据暂不可用。</p>
      </div>
    );
  }

  const badge = healthBadge(health);
  const activeCircuits = health.circuits.filter(
    (item) => item.failureCount > 0 || item.state !== "closed"
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-brand-charcoal">AI 健康</h2>
        <Badge variant={badge.variant} size="sm">
          {badge.label}
        </Badge>
      </div>
      <div className="mt-2 space-y-2">
        <BudgetBar
          label="今日预算"
          usage={health.usage.dailyCost}
          budget={health.budget.dailyCost}
          percent={health.dailyUsagePercent}
        />
        <BudgetBar
          label="本月预算"
          usage={health.usage.monthlyCost}
          budget={health.budget.monthlyCost}
          percent={health.monthlyUsagePercent}
        />
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-brand-charcoal/60">熔断器</span>
          {activeCircuits.length === 0 ? (
            <span className="text-emerald-700">全部正常</span>
          ) : (
            <span className="text-amber-700">{activeCircuits.length} 个异常</span>
          )}
        </div>
        {activeCircuits.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeCircuits.map((circuit) => {
              const blocked = circuit.isBlocked || circuit.state === "open";
              return (
                <span
                  key={circuit.service}
                  className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                    blocked ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {circuit.service}
                  {blocked
                    ? " 已熔断"
                    : circuit.failureCount > 0
                      ? ` 失败 ${circuit.failureCount} 次`
                      : " 半开"}
                </span>
              );
            })}
          </div>
        )}
        {health.exhausted && (
          <p className="text-[11px] text-red-600">
            预算已耗尽{health.exhaustedReason ? `：${health.exhaustedReason}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function SkinDistribution({
  items,
}: {
  items: AdvisorSubsiteDashboard["skinTypeDistribution"];
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <p className="text-xs text-brand-charcoal/60">暂无肤质数据</p>;
  }

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
        {items.map((item) => {
          const percent = (item.value / total) * 100;
          if (percent <= 0) return null;
          return (
            <div
              key={item.key}
              title={`${SKIN_TYPE_LABELS[item.key] || item.name} ${item.value}`}
              style={{ width: `${percent}%`, backgroundColor: item.fill }}
            />
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {items.map((item) => {
          const percent = Math.round((item.value / total) * 100);
          return (
            <div key={item.key} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span className="truncate text-brand-charcoal/70">
                  {SKIN_TYPE_LABELS[item.key] || item.name}
                </span>
              </span>
              <span className="font-mono tabular-nums text-brand-charcoal/55">
                {item.value} · {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyTrend({ items }: { items: AdvisorSubsiteDashboard["weeklyGrowth"] }) {
  const max = Math.max(1, ...items.map((item) => Math.max(item.started, item.completed)));

  if (items.length === 0) {
    return <p className="text-xs text-brand-charcoal/60">暂无趋势数据</p>;
  }

  return (
    <div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.day} className="flex items-center gap-2 text-[11px]">
            <span className="w-8 shrink-0 text-brand-charcoal/60">
              {WEEKDAY_LABELS[item.day] || item.day}
            </span>
            <div className="flex flex-1 items-center gap-1">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                <div
                  className="h-full rounded-full bg-brand-charcoal/40"
                  style={{ width: `${(item.started / max) * 100}%` }}
                />
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${(item.completed / max) * 100}%` }}
                />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right font-mono tabular-nums text-brand-charcoal/55">
              {item.started}/{item.completed}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-brand-charcoal/55">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-2.5 rounded-full bg-brand-charcoal/40" />
          开始
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-2.5 rounded-full bg-emerald-500" />
          完成
        </span>
      </div>
    </div>
  );
}

function DashboardContent({
  dashboard,
  canOpenAdvisor,
}: {
  dashboard: AdvisorSubsiteDashboard;
  canOpenAdvisor: boolean;
}) {
  const { overview, health } = dashboard;
  const skinTotal = dashboard.skinTypeDistribution.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-3">
      <PanelCard className="p-3 sm:p-4">
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-brand-charcoal">运行概览</h2>
              <span className="text-[11px] text-brand-charcoal/45">子站实时数据</span>
            </div>
            <StatStrip
              items={[
                {
                  label: "测肤用户",
                  value: overview.totalUsers.toLocaleString("zh-CN"),
                  description: `产品库 ${overview.totalProducts.toLocaleString("zh-CN")}`,
                },
                {
                  label: "累计测肤",
                  value: overview.totalSessions.toLocaleString("zh-CN"),
                  description: `已完成 ${overview.completedSessions.toLocaleString("zh-CN")}`,
                },
                {
                  label: "今日测肤",
                  value: overview.todaySessions.toLocaleString("zh-CN"),
                  description: `今日完成 ${overview.todayCompletions.toLocaleString("zh-CN")}`,
                },
                {
                  label: "完成率",
                  value: `${overview.completionRate}%`,
                  description: "累计完成占比",
                },
              ]}
            />
          </div>
          <div className="border-t border-brand-charcoal/10 pt-3 xl:col-span-5 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            <AIHealthSummary health={health} />
          </div>
        </div>

        <div className="mt-3 border-t border-brand-charcoal/10 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-brand-charcoal">子站后台</h2>
            {canOpenAdvisor && (
              <span className="text-[11px] text-brand-charcoal/45">新标签页打开</span>
            )}
          </div>
          <QuickLinks canOpenAdvisor={canOpenAdvisor} />
        </div>
      </PanelCard>

      <PanelCard className="p-3 sm:p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-brand-charcoal">肤质分布</h2>
              <span className="text-[11px] text-brand-charcoal/45">共 {skinTotal} 条</span>
            </div>
            <SkinDistribution items={dashboard.skinTypeDistribution} />
          </section>
          <section className="border-t border-brand-charcoal/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-brand-charcoal">近 7 日趋势</h2>
              <span className="text-[11px] text-brand-charcoal/45">开始 / 完成</span>
            </div>
            <WeeklyTrend items={dashboard.weeklyGrowth} />
          </section>
        </div>
      </PanelCard>
    </div>
  );
}

function NoticePanel({
  icon,
  title,
  description,
  action,
  canOpenAdvisor,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  canOpenAdvisor: boolean;
}) {
  return (
    <PanelCard className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div>
            <p className="text-sm font-medium text-brand-charcoal">{title}</p>
            <p className="mt-0.5 text-xs text-brand-charcoal/60">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-3 border-t border-brand-charcoal/10 pt-3">
        <h2 className="mb-2 text-xs font-semibold text-brand-charcoal">子站后台</h2>
        <QuickLinks canOpenAdvisor={canOpenAdvisor} />
      </div>
    </PanelCard>
  );
}

function PageFrame({
  children,
  canReadStats,
  loading,
  updatedAt,
  onRefresh,
}: {
  children: ReactNode;
  canReadStats: boolean;
  loading: boolean;
  updatedAt?: string;
  onRefresh?: () => void;
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="测肤子站"
        description="smart.nihplod.cn 的运行概览与后台入口"
        actions={
          canReadStats && onRefresh ? (
            <div className="flex items-center gap-2">
              {updatedAt && (
                <span className="hidden text-[11px] text-brand-charcoal/45 md:inline">
                  更新 {formatDateTime(updatedAt)}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                loading={loading}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                刷新
              </Button>
            </div>
          ) : undefined
        }
      />
      {children}
    </div>
  );
}

export default function AdvisorSubsitePage() {
  const { can, loading: sessionLoading } = useAdminPermissions();
  const takeLatest = useLatestRequest();
  const [payload, setPayload] = useState<AdvisorDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canReadStats = can("advisor:stats:read");
  const canOpenAdvisor = can("advisor:access") || can("advisor:admin");

  useEffect(() => {
    if (sessionLoading || !canReadStats) return;
    const isLatest = takeLatest();
    requestDashboard()
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(err instanceof ApiError ? err.message : "加载测肤子站概览失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [canReadStats, sessionLoading, takeLatest]);

  const reload = useCallback(() => {
    const isLatest = takeLatest();
    setLoading(true);
    setError("");
    requestDashboard()
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(err instanceof ApiError ? err.message : "加载测肤子站概览失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [takeLatest]);

  if (sessionLoading) {
    return (
      <PageFrame canReadStats={false} loading>
        <PageSkeleton />
      </PageFrame>
    );
  }

  if (!canReadStats) {
    return (
      <PageFrame canReadStats={false} loading={false}>
        <NoticePanel
          icon={<Lock className="h-4 w-4 text-brand-charcoal/45" />}
          title="无权查看测肤子站概览"
          description="需要测肤子站概览权限（advisor:stats:read），请联系超级管理员授权。"
          canOpenAdvisor={canOpenAdvisor}
        />
      </PageFrame>
    );
  }

  if (loading) {
    return (
      <PageFrame canReadStats loading>
        <PageSkeleton />
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame canReadStats loading={false} onRefresh={reload}>
        <NoticePanel
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title="加载测肤子站概览失败"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              重试
            </Button>
          }
          canOpenAdvisor={canOpenAdvisor}
        />
      </PageFrame>
    );
  }

  if (!payload || payload.degraded || !payload.dashboard) {
    return (
      <PageFrame canReadStats loading={false} onRefresh={reload}>
        <NoticePanel
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title="测肤子站暂不可用"
          description={DEGRADED_MESSAGES[payload?.reason || ""] || "请稍后重试"}
          action={
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={reload}
            >
              重新加载
            </Button>
          }
          canOpenAdvisor={canOpenAdvisor}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      canReadStats
      loading={false}
      updatedAt={payload.dashboard.generatedAt}
      onRefresh={reload}
    >
      <DashboardContent
        dashboard={payload.dashboard}
        canOpenAdvisor={canOpenAdvisor}
      />
    </PageFrame>
  );
}
