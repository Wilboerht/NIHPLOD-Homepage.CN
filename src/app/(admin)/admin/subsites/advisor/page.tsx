"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";
import { buildAdvisorAdminLink } from "@/lib/advisor-admin-link";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { StatStrip } from "@/components/admin/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
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
  { label: "测肤用户管理", path: "/admin/users", description: "子站用户列表与配额" },
  { label: "推荐规则", path: "/admin/recommendation-rules", description: "AI 推荐条件与优先级" },
  { label: "AI 成本", path: "/admin/ai-costs", description: "Token 成本与失败记录" },
  { label: "测肤产品库", path: "/admin/products", description: "推荐产品与肤质标签" },
  { label: "子站安全审计", path: "/admin/audit-logs", description: "子站管理员操作记录" },
] as const;

function requestDashboard(): Promise<AdvisorDashboardPayload> {
  return apiGet<AdvisorDashboardPayload>("/api/admin/subsites/advisor/overview");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function healthBadge(health: AdvisorAIHealth | null | undefined) {
  if (!health) return { label: "AI 健康未知", variant: "secondary" as const };
  if (health.status === "critical") return { label: "AI 异常", variant: "danger" as const };
  if (health.status === "warning") return { label: "AI 注意", variant: "warning" as const };
  return { label: "AI 正常", variant: "success" as const };
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <PanelCard>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-brand-charcoal/[0.06]" />
              <div className="h-6 w-20 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            </div>
          ))}
        </div>
      </PanelCard>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <PanelCard key={index}>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, row) => (
                <div key={row} className="h-8 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
              ))}
            </div>
          </PanelCard>
        ))}
      </div>
    </div>
  );
}

function QuickLinks({ canOpenAdvisor }: { canOpenAdvisor: boolean }) {
  if (!canOpenAdvisor) {
    return (
      <p className="text-sm text-brand-charcoal/65">
        需要测肤子站访问权限（advisor:access）才能打开子站后台，请联系超级管理员授权。
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {QUICK_LINKS.map((link) => (
        <a
          key={link.path}
          href={buildAdvisorAdminLink(link.path)}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between gap-3 rounded-xl border border-brand-charcoal/10 px-3 py-2.5 transition-colors hover:border-brand-primary/30 hover:bg-brand-primary/[0.03]"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-charcoal">{link.label}</p>
            <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">{link.description}</p>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0 text-brand-charcoal/35 group-hover:text-brand-primary" />
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
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-brand-charcoal/65">{label}</span>
        <span className="font-mono tabular-nums text-brand-charcoal">
          ¥{usage.toFixed(2)}
          {configured ? ` / ¥${budget.toFixed(2)}（${percent}%）` : "（未配置预算）"}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function AIHealthPanel({ health }: { health: AdvisorAIHealth | null }) {
  if (!health) {
    return <p className="text-sm text-brand-charcoal/65">AI 健康数据暂不可用。</p>;
  }

  const activeCircuits = health.circuits.filter(
    (item) => item.failureCount > 0 || item.state !== "closed"
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={healthBadge(health).variant}>{healthBadge(health).label}</Badge>
        {health.exhausted && (
          <span className="text-xs text-red-600">
            预算已耗尽{health.exhaustedReason ? `：${health.exhaustedReason}` : ""}
          </span>
        )}
      </div>
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
      <div>
        <p className="text-xs text-brand-charcoal/65">熔断器</p>
        {activeCircuits.length === 0 ? (
          <p className="mt-1 text-sm text-emerald-700">所有 AI 服务正常</p>
        ) : (
          <div className="mt-2 space-y-1">
            {activeCircuits.map((circuit) => (
              <div
                key={circuit.service}
                className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <span className="font-mono">{circuit.service}</span>
                <span>
                  {circuit.state === "open"
                    ? "已熔断"
                    : circuit.failureCount > 0
                      ? `失败 ${circuit.failureCount} 次`
                      : "半开"}
                </span>
              </div>
            ))}
          </div>
        )}
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
  const maxWeekly = Math.max(
    1,
    ...dashboard.weeklyGrowth.map((item) => Math.max(item.started, item.completed))
  );

  return (
    <div className="space-y-4">
      <PanelCard>
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
      </PanelCard>

      <PanelCard title="AI 健康">
        <AIHealthPanel health={health} />
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard title="肤质分布">
          {skinTotal === 0 ? (
            <p className="text-sm text-brand-charcoal/65">暂无肤质数据</p>
          ) : (
            <div className="space-y-3">
              {dashboard.skinTypeDistribution.map((item) => {
                const percent = Math.round((item.value / skinTotal) * 100);
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-brand-charcoal">
                        {SKIN_TYPE_LABELS[item.key] || item.name}
                      </span>
                      <span className="font-mono tabular-nums text-brand-charcoal/65">
                        {item.value}（{percent}%）
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percent}%`, backgroundColor: item.fill }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>

        <PanelCard title="近 7 日趋势">
          <div className="space-y-2">
            {dashboard.weeklyGrowth.map((item) => (
              <div key={item.day} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs text-brand-charcoal/65">
                  {WEEKDAY_LABELS[item.day] || item.day}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                    <div
                      className="h-full rounded-full bg-brand-charcoal/40"
                      style={{ width: `${(item.started / maxWeekly) * 100}%` }}
                    />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(item.completed / maxWeekly) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-brand-charcoal/65">
                  {item.started} / {item.completed}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-brand-charcoal/65">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-brand-charcoal/40" />
              开始
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-emerald-500" />
              完成
            </span>
          </div>
        </PanelCard>
      </div>

      <PanelCard title="子站后台">
        <QuickLinks canOpenAdvisor={canOpenAdvisor} />
      </PanelCard>
    </div>
  );
}

function PageFrame({
  children,
  canReadStats,
  loading,
  health,
  onRefresh,
}: {
  children: ReactNode;
  canReadStats: boolean;
  loading: boolean;
  health?: AdvisorAIHealth | null;
  onRefresh?: () => void;
}) {
  const badge = healthBadge(health);
  return (
    <div className="space-y-6">
      <PageHeader
        title="测肤子站"
        description="AI 测肤子站（smart.nihplod.cn）的全局概览与后台入口"
        accessory={health !== undefined ? <Badge variant={badge.variant}>{badge.label}</Badge> : undefined}
        actions={
          canReadStats && onRefresh ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              loading={loading}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              刷新
            </Button>
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
        <PanelCard title="测肤子站概览">
          <Empty
            title="无权查看测肤子站概览"
            description="需要测肤子站概览权限（advisor:stats:read），请联系超级管理员授权。"
            className="py-8"
          />
        </PanelCard>
        <PanelCard title="子站后台">
          <QuickLinks canOpenAdvisor={canOpenAdvisor} />
        </PanelCard>
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
        <Empty
          icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
          title="加载测肤子站概览失败"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              重试
            </Button>
          }
          className="py-10"
        />
        <PanelCard title="子站后台">
          <QuickLinks canOpenAdvisor={canOpenAdvisor} />
        </PanelCard>
      </PageFrame>
    );
  }

  if (!payload || payload.degraded || !payload.dashboard) {
    return (
      <PageFrame canReadStats loading={false} onRefresh={reload}>
        <Empty
          icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
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
          className="py-10"
        />
        <PanelCard title="子站后台">
          <QuickLinks canOpenAdvisor={canOpenAdvisor} />
        </PanelCard>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      canReadStats
      loading={false}
      health={payload.dashboard.health}
      onRefresh={reload}
    >
      <DashboardContent
        dashboard={payload.dashboard}
        canOpenAdvisor={canOpenAdvisor}
      />
      <p className="text-xs text-brand-charcoal/65">
        最后更新：{formatDateTime(payload.dashboard.generatedAt)}
      </p>
    </PageFrame>
  );
}
