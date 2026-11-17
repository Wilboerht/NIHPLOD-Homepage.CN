"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Filter,
  RefreshCw,
} from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { buildAdvisorAdminLink } from "@/lib/advisor-admin-link";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { PanelCard } from "@/components/admin/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type {
  AdvisorAICostSummary,
  AdvisorAnalyticsPayload,
  AdvisorFunnelSummary,
  AdvisorReportQualitySummary,
} from "@/types/advisor-analytics";

const DEGRADED_MESSAGES: Record<string, string> = {
  not_configured: "未配置测肤子站内部接口密钥",
  unauthorized: "主站与测肤子站之间的内部鉴权失败",
  rate_limited: "测肤子站请求过于频繁，请稍后重试",
  upstream_error: "测肤子站暂时不可用",
};

function requestAnalytics(): Promise<AdvisorAnalyticsPayload> {
  return apiGet<AdvisorAnalyticsPayload>(
    "/api/admin/subsites/advisor/analytics"
  );
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

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

function formatDuration(value: number): string {
  return value > 0 ? `${(value / 1000).toFixed(1)}s` : "—";
}

interface SummaryMetric {
  label: string;
  value: string;
  description?: string;
}

function SummaryCard({
  title,
  period,
  icon,
  metrics,
  href,
  canOpenAdvisor,
  unavailable,
  onRetry,
}: {
  title: string;
  period: string;
  icon: ReactNode;
  metrics: SummaryMetric[];
  href: string;
  canOpenAdvisor: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface-subtle p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            {icon}
          </span>
          <h3 className="truncate text-sm font-semibold text-brand-charcoal">
            {title}
          </h3>
        </div>
        <Badge variant="secondary" size="sm">
          {period}
        </Badge>
      </div>

      {unavailable ? (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-2 rounded-lg bg-surface-muted px-3 py-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning-fg" />
            暂不可用
          </p>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="truncate text-2xs text-ink-muted">{metric.label}</dt>
              <dd className="mt-0.5 font-num text-lg font-semibold tabular-nums tracking-tight text-brand-charcoal">
                {metric.value}
              </dd>
              {metric.description && (
                <dd className="truncate text-2xs text-ink-faint">
                  {metric.description}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 border-t border-line pt-3">
        {canOpenAdvisor ? (
          <a
            href={buildAdvisorAdminLink(href)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
          >
            查看完整数据
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-2xs text-ink-faint">
            需要测肤子站访问权限查看详情
          </span>
        )}
      </div>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-line bg-surface-subtle p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-4 w-14 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((__, metricIndex) => (
              <div key={metricIndex} className="space-y-1.5">
                <div className="h-2.5 w-12 animate-pulse rounded bg-surface-hover" />
                <div className="h-5 w-16 animate-pulse rounded bg-surface-hover" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-4 w-20 animate-pulse rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

function buildFunnelMetrics(summary: AdvisorFunnelSummary): SummaryMetric[] {
  return [
    {
      label: "总会话",
      value: formatCount(summary.totalSessions),
      description: `近 ${summary.days} 天`,
    },
    {
      label: "完成报告",
      value: formatCount(summary.reportCompleted),
      description: "已生成完整报告",
    },
    {
      label: "查看报告",
      value: formatCount(summary.resultViewed),
      description: "已查看结果页",
    },
    {
      label: "报告完成率",
      value: formatPercent(summary.reportCompletionRate),
      description: "完成报告 / 总会话",
    },
  ];
}

function buildReportQualityMetrics(
  summary: AdvisorReportQualitySummary
): SummaryMetric[] {
  return [
    {
      label: "报告总数",
      value: formatCount(summary.totalReports),
      description: `近 ${summary.days} 天`,
    },
    {
      label: "AI 文案",
      value: formatPercent(
        summary.totalReports > 0
          ? Math.round((summary.aiNarrative / summary.totalReports) * 1000) / 10
          : 0
      ),
      description: `${formatCount(summary.aiNarrative)} 份`,
    },
    {
      label: "规则兜底",
      value: formatPercent(summary.fallbackRate),
      description: `${formatCount(summary.fallback)} 份`,
    },
    {
      label: "平均耗时",
      value: formatDuration(summary.avgDurationMs),
      description: "报告生成总耗时",
    },
  ];
}

function buildAICostMetrics(summary: AdvisorAICostSummary): SummaryMetric[] {
  return [
    {
      label: "总费用",
      value: formatMoney(summary.totalCost),
      description: "近 7 天",
    },
    {
      label: "调用次数",
      value: formatCount(summary.totalCalls),
      description: "AI 请求总数",
    },
    {
      label: "失败次数",
      value: formatCount(summary.failedCalls),
      description: "含超时/错误",
    },
    {
      label: "成功率",
      value: formatPercent(summary.successRate),
      description: "成功调用占比",
    },
  ];
}

export function AdvisorAnalyticsSummary({
  canOpenAdvisor,
  refreshKey = 0,
}: {
  canOpenAdvisor: boolean;
  refreshKey?: number;
}) {
  const takeLatest = useLatestRequest();
  const [payload, setPayload] = useState<AdvisorAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(() => {
    const isLatest = takeLatest();
    requestAnalytics()
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setError(
          err instanceof Error
            ? err.message
            : "加载分析摘要失败，请稍后重试"
        );
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [takeLatest]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics, refreshKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAnalytics();
  }, [fetchAnalytics]);

  const analytics = payload?.analytics ?? null;
  const degradedMessage = payload?.degraded
    ? DEGRADED_MESSAGES[payload.reason || ""] || "测肤子站暂不可用"
    : "";

  return (
    <PanelCard
      title="数据分析摘要"
      action={
        analytics?.generatedAt ? (
          <span className="text-2xs text-ink-faint">
            更新 {formatDateTime(analytics.generatedAt)}
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <SummarySkeleton />
      ) : error || degradedMessage || !analytics ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-status-warning-line bg-status-warning-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-fg" />
            <div>
              <p className="text-sm font-medium text-brand-charcoal">
                分析摘要暂不可用
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {error || degradedMessage || "测肤子站暂未返回数据"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={reload}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            重试
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <SummaryCard
            title="转化漏斗"
            period={`近 ${analytics.funnel?.days ?? 30} 天`}
            icon={<Filter className="h-4 w-4" />}
            metrics={
              analytics.funnel
                ? buildFunnelMetrics(analytics.funnel)
                : [
                    { label: "总会话", value: "—" },
                    { label: "完成报告", value: "—" },
                    { label: "查看报告", value: "—" },
                    { label: "报告完成率", value: "—" },
                  ]
            }
            href="/admin/funnel"
            canOpenAdvisor={canOpenAdvisor}
            unavailable={!analytics.funnel}
            onRetry={reload}
          />
          <SummaryCard
            title="报告质量"
            period={`近 ${analytics.reportQuality?.days ?? 30} 天`}
            icon={<Activity className="h-4 w-4" />}
            metrics={
              analytics.reportQuality
                ? buildReportQualityMetrics(analytics.reportQuality)
                : [
                    { label: "报告总数", value: "—" },
                    { label: "AI 文案", value: "—" },
                    { label: "规则兜底", value: "—" },
                    { label: "平均耗时", value: "—" },
                  ]
            }
            href="/admin/report-quality"
            canOpenAdvisor={canOpenAdvisor}
            unavailable={!analytics.reportQuality}
            onRetry={reload}
          />
          <SummaryCard
            title="AI 成本"
            period="近 7 天"
            icon={<BarChart3 className="h-4 w-4" />}
            metrics={
              analytics.aiCosts
                ? buildAICostMetrics(analytics.aiCosts)
                : [
                    { label: "总费用", value: "—" },
                    { label: "调用次数", value: "—" },
                    { label: "失败次数", value: "—" },
                    { label: "成功率", value: "—" },
                  ]
            }
            href="/admin/ai-costs"
            canOpenAdvisor={canOpenAdvisor}
            unavailable={!analytics.aiCosts}
            onRetry={reload}
          />
        </div>
      )}
    </PanelCard>
  );
}
