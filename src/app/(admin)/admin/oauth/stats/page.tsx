"use client";

/**
 * SSO 统计概览页
 * /admin/oauth/stats
 *
 * 展示活跃客户端/会话/刷新令牌、事件量趋势、授权成功率、事件类型分布
 * 仅 owner 角色可访问（API 层强制校验）
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  KeyRound,
  MonitorStop,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { deferInEffect } from "@/hooks/deferInEffect";
import {
  PageHeader,
  PanelCard,
  RequirePermission,
  StatStrip,
  type StatStripItem,
} from "@/components/admin";

interface OAuthStats {
  activeClients: number;
  activeSessions: number;
  activeRefreshTokens: number;
  events: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  successRate: number | null;
  eventsByType: Record<string, number>;
}

const EVENT_LABELS: Record<string, string> = {
  authorize: "授权请求",
  token: "令牌签发",
  introspect: "令牌校验",
  logout: "登出",
  userinfo: "用户信息",
  backchannel_logout: "回登通知",
  consent: "授权确认",
  status_change: "状态变更",
  profile_webhook: "资料变更推送",
};

const formatCount = (value: number) => value.toLocaleString("zh-CN");

function StatSkeleton({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid gap-x-4 gap-y-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-brand-charcoal/10" />
          <div className="h-6 w-16 animate-pulse rounded bg-brand-charcoal/10" />
          <div className="h-2.5 w-24 animate-pulse rounded bg-brand-charcoal/10" />
        </div>
      ))}
    </div>
  );
}

export default function OAuthStatsPage() {
  return (
    <RequirePermission permission="sso:read">
      <OAuthStatsContent />
    </RequirePermission>
  );
}

function OAuthStatsContent() {
  const [stats, setStats] = useState<OAuthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<OAuthStats>("/api/admin/oauth/stats");
      setStats(data);
      setError("");
    } catch {
      setError("统计信息加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deferInEffect(fetchStats);
  }, [fetchStats]);

  const overviewItems: StatStripItem[] = stats
    ? [
        {
          label: "活跃 Client",
          value: formatCount(stats.activeClients),
          icon: <KeyRound className="h-3.5 w-3.5" />,
          description: "启用状态的 OAuth 子项目",
        },
        {
          label: "活跃会话",
          value: formatCount(stats.activeSessions),
          icon: <MonitorStop className="h-3.5 w-3.5" />,
          description: "未撤销的 OAuth 会话",
        },
        {
          label: "活跃刷新令牌",
          value: formatCount(stats.activeRefreshTokens),
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          description: "未撤销的 refresh token",
        },
        {
          label: "本月授权成功率",
          value: stats.successRate === null ? "—" : `${stats.successRate}%`,
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
          description: stats.successRate === null ? "本月暂无授权事件" : "本月 authorize 成功占比",
          muted: stats.successRate === null,
        },
      ]
    : [];

  const trendItems: StatStripItem[] = stats
    ? [
        {
          label: "今日事件",
          value: formatCount(stats.events.today),
          icon: <Activity className="h-3.5 w-3.5" />,
          description: "今日 0 点至今",
        },
        {
          label: "本周事件",
          value: formatCount(stats.events.thisWeek),
          icon: <Activity className="h-3.5 w-3.5" />,
          description: "本周累计",
        },
        {
          label: "本月事件",
          value: formatCount(stats.events.thisMonth),
          icon: <Activity className="h-3.5 w-3.5" />,
          description: "本月累计",
        },
      ]
    : [];

  const maxEventCount = stats ? Math.max(1, ...Object.values(stats.eventsByType)) : 1;
  const eventTotal = stats
    ? Object.values(stats.eventsByType).reduce((sum, count) => sum + count, 0)
    : 0;
  const isEmpty =
    !!stats &&
    stats.activeClients === 0 &&
    stats.activeSessions === 0 &&
    stats.activeRefreshTokens === 0 &&
    stats.events.thisMonth === 0;

  return (
    <RequirePermission permission="sso:read">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="SSO 统计概览"
          description="子项目接入与授权情况总览"
          actions={
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchStats}
              loading={loading}
            >
              刷新
            </Button>
          }
        />

        {error ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-charcoal/10 bg-white py-12">
            <div className="rounded-full bg-red-50 p-4">
              <ShieldAlert className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="mt-4 text-base font-medium text-brand-charcoal">统计加载失败</h2>
            <p className="mt-1 text-sm text-brand-charcoal/65">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchStats}>
              重试
            </Button>
          </div>
        ) : (
          <>
            {/* 核心指标 */}
            <PanelCard>
              {loading ? (
                <StatSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" />
              ) : (
                <StatStrip items={overviewItems} />
              )}
            </PanelCard>

            {/* 空数据引导 */}
            {!loading && isEmpty && (
              <PanelCard>
                <Empty
                  title="还没有任何 SSO 数据"
                  description="创建第一个 Client 开始接入 SSO"
                  action={
                    <Link href="/admin/oauth-clients/wizard">
                      <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                        创建 Client
                      </Button>
                    </Link>
                  }
                  className="py-8"
                />
              </PanelCard>
            )}

            {/* 事件趋势 */}
            <PanelCard title="事件趋势">
              {loading ? (
                <StatSkeleton count={3} className="grid-cols-2 sm:grid-cols-3" />
              ) : (
                <StatStrip items={trendItems} />
              )}
            </PanelCard>

            {/* 事件类型分布 */}
            <PanelCard
              title="本月事件类型分布"
              action={
                !loading && eventTotal > 0 ? (
                  <span className="text-xs tabular-nums text-brand-charcoal/65">
                    共 {formatCount(eventTotal)} 次
                  </span>
                ) : undefined
              }
            >
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className="h-6 animate-pulse rounded bg-brand-charcoal/[0.04]"
                    />
                  ))}
                </div>
              ) : !stats || Object.keys(stats.eventsByType).length === 0 ? (
                <Empty title="本月暂无 SSO 事件" className="py-8" />
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.eventsByType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-3">
                        <div className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-brand-charcoal/70 sm:w-32">
                          <Activity className="h-3.5 w-3.5 shrink-0 text-brand-charcoal/65" />
                          <span className="truncate">{EVENT_LABELS[type] || type}</span>
                        </div>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-charcoal/[0.06]">
                          <div
                            className="h-full rounded-full bg-brand-primary/70 transition-all"
                            style={{ width: `${(count / maxEventCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-brand-charcoal/70">
                          {formatCount(count)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </PanelCard>
          </>
        )}
      </div>
    </RequirePermission>
  );
}
