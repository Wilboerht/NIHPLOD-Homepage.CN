"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Camera,
  Clock,
  Cpu,
  Zap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface MonitoringData {
  serviceStatus: {
    textProvider: string;
    textModel: string;
    textProviderConfigured: boolean;
    visionProvider: string;
    visionModel: string;
    visionProviderConfigured: boolean;
    apiKeyStatus: Record<string, boolean>;
    overallHealth: "healthy" | "degraded" | "unhealthy";
  };
  analysisStats: {
    total: number;
    ai: number;
    fallback: number;
    completed: number;
    faceScanUsed: number;
    aiSuccessRate: number;
    fallbackRate: number;
    completionRate: number;
  };
  recentActivity: Array<{
    id: string;
    sessionId: string;
    time: string;
    source: string;
    completed: boolean;
    hasFaceScan: boolean;
    device: string;
  }>;
  hourlyTrend: Array<{
    hour: string;
    ai: number;
    fallback: number;
  }>;
}

interface HealthCheckResult {
  provider: string;
  name: string;
  status: "healthy" | "error" | "unconfigured";
  responseTime?: number;
  error?: string;
}

interface HealthCheckData {
  results: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    configured: number;
    overallStatus: "healthy" | "degraded" | "unhealthy";
  };
  checkedAt: string;
}

type DateRange = "1hour" | "today" | "7days" | "30days";

export default function AdvisorMonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 健康检测状态
  const [healthCheck, setHealthCheck] = useState<HealthCheckData | null>(null);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advisor/monitoring?range=${dateRange}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  // 健康检测函数
  const runHealthCheck = useCallback(async () => {
    setHealthCheckLoading(true);
    try {
      const res = await fetch("/api/admin/advisor/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        setHealthCheck(json.data);
      }
    } catch (error) {
      console.error("Health check failed:", error);
    } finally {
      setHealthCheckLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 每 30 秒自动刷新
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "1hour", label: "最近1小时" },
    { value: "today", label: "今天" },
    { value: "7days", label: "近7天" },
    { value: "30days", label: "近30天" },
  ];

  const _getHealthIcon = (health: string) => {
    switch (health) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getHealthBadge = (health: string) => {
    switch (health) {
      case "healthy":
        return <Badge variant="success">正常运行</Badge>;
      case "degraded":
        return <Badge variant="warning">部分降级</Badge>;
      default:
        return <Badge variant="danger">服务异常</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/advisor">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">系统监控</h1>
            <p className="mt-1 text-sm text-gray-500">AI 护肤顾问服务健康状态</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              <Clock className="mr-1 inline h-3 w-3" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1">
            {dateRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === option.value
                    ? "bg-brand-gold text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
            onClick={fetchData}
            disabled={loading}
          >
            刷新
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* 服务状态总览 */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Activity className="h-5 w-5" />
                服务状态
              </h2>
              {getHealthBadge(data.serviceStatus.overallHealth)}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* 文本分析服务 */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-gray-900">文本分析服务</span>
                  </div>
                  {data.serviceStatus.textProviderConfigured ? (
                    <Badge variant="success">已配置</Badge>
                  ) : (
                    <Badge variant="danger">未配置</Badge>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  <p>服务商: <span className="font-medium">{data.serviceStatus.textProvider}</span></p>
                  <p>模型: <span className="font-medium">{data.serviceStatus.textModel}</span></p>
                </div>
              </div>

              {/* 视觉分析服务 */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-purple-500" />
                    <span className="font-medium text-gray-900">视觉分析服务</span>
                  </div>
                  {data.serviceStatus.visionProviderConfigured ? (
                    <Badge variant="success">已配置</Badge>
                  ) : (
                    <Badge variant="danger">未配置</Badge>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  <p>服务商: <span className="font-medium">{data.serviceStatus.visionProvider}</span></p>
                  <p>模型: <span className="font-medium">{data.serviceStatus.visionModel}</span></p>
                </div>
              </div>
            </div>

            {/* API Key 状态 */}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">API 密钥状态</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.serviceStatus.apiKeyStatus).map(([provider, configured]) => (
                  <div
                    key={provider}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                      configured
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {configured ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 服务健康检测 */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Zap className="h-5 w-5" />
                服务连通性检测
              </h2>
              <Button
                variant="outline"
                size="sm"
                leftIcon={healthCheckLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                onClick={runHealthCheck}
                disabled={healthCheckLoading}
              >
                {healthCheckLoading ? "检测中..." : "运行检测"}
              </Button>
            </div>

            {healthCheck ? (
              <>
                <div className="mb-4 flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    检测时间: {new Date(healthCheck.checkedAt).toLocaleString()}
                  </span>
                  <Badge variant={
                    healthCheck.summary.overallStatus === "healthy" ? "success" :
                    healthCheck.summary.overallStatus === "degraded" ? "warning" : "danger"
                  }>
                    {healthCheck.summary.healthy}/{healthCheck.summary.configured} 服务正常
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {healthCheck.results.map((result) => (
                    <div
                      key={result.provider}
                      className={`rounded-lg border p-3 ${
                        result.status === "healthy"
                          ? "border-green-200 bg-green-50"
                          : result.status === "unconfigured"
                          ? "border-gray-200 bg-gray-50"
                          : "border-red-200 bg-red-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{result.name}</span>
                        {result.status === "healthy" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : result.status === "unconfigured" ? (
                          <XCircle className="h-4 w-4 text-gray-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="mt-1 text-xs">
                        {result.status === "healthy" && result.responseTime && (
                          <span className="text-green-700">
                            响应时间: {result.responseTime}ms
                          </span>
                        )}
                        {result.status === "unconfigured" && (
                          <span className="text-gray-500">未配置 API Key</span>
                        )}
                        {result.status === "error" && (
                          <span className="text-red-700" title={result.error}>
                            {result.error?.slice(0, 30)}...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-gray-400">
                <Zap className="mx-auto mb-2 h-8 w-8" />
                <p>点击上方按钮运行服务连通性检测</p>
                <p className="mt-1 text-xs">检测各 AI 服务商的 API 可用性和响应时间</p>
              </div>
            )}
          </div>

          {/* 分析统计卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Sparkles className="h-5 w-5" />}
              label="总分析次数"
              value={data.analysisStats.total}
              color="blue"
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="AI 分析成功率"
              value={formatPercent(data.analysisStats.aiSuccessRate)}
              subValue={`${data.analysisStats.ai} 次 AI 分析`}
              color="green"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5" />}
              label="降级分析率"
              value={formatPercent(data.analysisStats.fallbackRate)}
              subValue={`${data.analysisStats.fallback} 次降级`}
              color={data.analysisStats.fallbackRate > 0.1 ? "amber" : "gray"}
            />
            <StatCard
              icon={<Camera className="h-5 w-5" />}
              label="面部扫描使用"
              value={data.analysisStats.faceScanUsed}
              subValue={`占总分析 ${formatPercent(data.analysisStats.total > 0 ? data.analysisStats.faceScanUsed / data.analysisStats.total : 0)}`}
              color="purple"
            />
          </div>

          {/* 24小时趋势 */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5" />
              24小时分析趋势
            </h2>
            <div className="flex h-32 items-end gap-1">
              {data.hourlyTrend.map((item, index) => {
                const total = item.ai + item.fallback;
                const maxValue = Math.max(...data.hourlyTrend.map((h) => h.ai + h.fallback), 1);
                const height = (total / maxValue) * 100;
                const aiPercent = total > 0 ? (item.ai / total) * 100 : 0;
                return (
                  <div
                    key={index}
                    className="group relative flex-1"
                    title={`${item.hour}: AI ${item.ai}, 降级 ${item.fallback}`}
                  >
                    <div
                      className="relative w-full overflow-hidden rounded-t bg-gray-200 transition-all group-hover:opacity-80"
                      style={{ height: `${height}%`, minHeight: total > 0 ? "4px" : "0" }}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-green-500"
                        style={{ height: `${aiPercent}%` }}
                      />
                    </div>
                    {index % 4 === 0 && (
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
                        {item.hour.slice(0, 2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-green-500" />
                <span className="text-gray-600">AI 分析</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-gray-200" />
                <span className="text-gray-600">降级分析</span>
              </div>
            </div>
          </div>

          {/* 最近活动 */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Server className="h-5 w-5" />
              最近分析活动
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 font-medium">会话 ID</th>
                    <th className="pb-2 font-medium">时间</th>
                    <th className="pb-2 font-medium">分析来源</th>
                    <th className="pb-2 font-medium">面部扫描</th>
                    <th className="pb-2 font-medium">设备</th>
                    <th className="pb-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recentActivity.map((activity) => (
                    <tr key={activity.id} className="text-gray-700">
                      <td className="py-2 font-mono text-xs">{activity.sessionId}</td>
                      <td className="py-2">{new Date(activity.time).toLocaleString()}</td>
                      <td className="py-2">
                        <Badge variant={activity.source === "ai" ? "success" : "warning"}>
                          {activity.source === "ai" ? "AI" : "降级"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {activity.hasFaceScan ? (
                          <Camera className="h-4 w-4 text-purple-500" />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 capitalize">{activity.device}</td>
                      <td className="py-2">
                        {activity.completed ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.recentActivity.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        暂无分析记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center text-gray-400">
          <XCircle className="mb-2 h-12 w-12" />
          <p>获取监控数据失败</p>
        </div>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({
  icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color: "blue" | "green" | "purple" | "amber" | "gray";
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
    gray: "bg-gray-50 text-gray-600",
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>{icon}</div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-3">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {subValue && <p className="mt-1 text-xs text-gray-500">{subValue}</p>}
      </div>
    </div>
  );
}

