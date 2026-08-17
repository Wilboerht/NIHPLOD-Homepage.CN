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
import { Users, KeyRound, RefreshCw, Activity, ShieldCheck, ShieldAlert } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { StatsCard } from "@/components/admin/StatsCard";
import { RequireAdminRole } from "@/components/admin";
import { deferInEffect } from "@/hooks/deferInEffect";

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
};

export default function OAuthStatsPage() {
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

  if (error) {
    return (
      <RequireAdminRole role="owner">
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={fetchStats}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs hover:bg-gray-50"
          >
            重试
          </button>
        </div>
      </RequireAdminRole>
    );
  }

  const maxEventCount = stats ? Math.max(1, ...Object.values(stats.eventsByType)) : 1;

  return (
    <RequireAdminRole role="owner">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-brand-charcoal">SSO 统计概览</h1>
            <p className="mt-1 text-sm text-brand-charcoal/50">子项目接入与授权情况总览</p>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="活跃客户端"
            value={stats?.activeClients ?? 0}
            icon={<Users className="h-5 w-5" />}
            description="启用状态的 OAuth 子项目"
            loading={loading}
          />
          <StatsCard
            title="活跃授权会话"
            value={stats?.activeSessions ?? 0}
            icon={<KeyRound className="h-5 w-5" />}
            description="未撤销的 OAuth 会话"
            loading={loading}
          />
          <StatsCard
            title="活跃刷新令牌"
            value={stats?.activeRefreshTokens ?? 0}
            icon={<RefreshCw className="h-5 w-5" />}
            description="未撤销的 refresh token"
            loading={loading}
          />
          <StatsCard
            title="本月授权成功率"
            value={
              stats ? (stats.successRate === null ? "暂无数据" : `${stats.successRate}%`) : "—"
            }
            icon={<ShieldCheck className="h-5 w-5" />}
            description="本月 SSO 授权事件成功比例"
            loading={loading}
          />
        </div>

        {/* 全部无数据时引导创建第一个 Client */}
        {stats &&
          !loading &&
          stats.activeClients === 0 &&
          stats.activeSessions === 0 &&
          stats.activeRefreshTokens === 0 &&
          stats.events.thisMonth === 0 && (
            <div className="rounded-xl border border-dashed border-brand-charcoal/20 bg-white p-4 text-sm text-brand-charcoal/60">
              还没有任何 SSO 数据，
              <Link href="/admin/oauth-clients/wizard" className="text-blue-600 hover:underline">
                去创建第一个 Client
              </Link>
              开始接入。
            </div>
          )}

        {/* 事件趋势 */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard
            title="今日事件"
            value={stats?.events.today ?? 0}
            icon={<Activity className="h-5 w-5" />}
            loading={loading}
          />
          <StatsCard
            title="本周事件"
            value={stats?.events.thisWeek ?? 0}
            icon={<Activity className="h-5 w-5" />}
            loading={loading}
          />
          <StatsCard
            title="本月事件"
            value={stats?.events.thisMonth ?? 0}
            icon={<Activity className="h-5 w-5" />}
            loading={loading}
          />
        </div>

        {/* 事件类型分布 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-brand-charcoal">本月事件类型分布</h2>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-brand-charcoal/10" />
              ))}
            </div>
          ) : !stats || Object.keys(stats.eventsByType).length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-brand-charcoal/40">
              本月暂无 SSO 事件
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.eventsByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div className="flex w-32 items-center gap-1.5 text-sm text-brand-charcoal/70">
                      <ShieldAlert className="h-3.5 w-3.5 text-brand-charcoal/40" />
                      {EVENT_LABELS[type] || type}
                    </div>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-brand-charcoal/5">
                      <div
                        className="h-full rounded bg-brand-primary/60 transition-all"
                        style={{ width: `${(count / maxEventCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-brand-charcoal/60">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </RequireAdminRole>
  );
}
