"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  CheckCircle,
  Camera,
  SkipForward,
  Sparkles,
  Share2,
  TrendingUp,
  Calendar,
  RefreshCw,
  Smartphone,
  Monitor,
  Tablet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AnalyticsData {
  overview: {
    totalSessions: number;
    completedSessions: number;
    conversionRate: number;
    faceScanUsed: number;
    faceScanSkipped: number;
    faceScanRate: number;
    aiAnalysisCount: number;
    fallbackAnalysisCount: number;
    aiUsageRate: number;
    totalShares: number;
  };
  funnel: {
    started: number;
    completedQuestionnaire: number;
    startedFaceScan: number;
    completedFaceScan: number;
    skippedFaceScan: number;
    completedAnalysis: number;
    viewedResult: number;
    shared: number;
  };
  daily: Array<{
    date: string;
    sessions: number;
    completed: number;
    faceScanUsed: number;
    faceScanSkipped: number;
  }>;
  answerDistribution: Record<string, Record<string, number>>;
  deviceDistribution: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}

type DateRange = "today" | "yesterday" | "7days" | "30days" | "90days";

export default function AdvisorAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("7days");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advisor/analytics?range=${dateRange}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "today", label: "今天" },
    { value: "yesterday", label: "昨天" },
    { value: "7days", label: "近7天" },
    { value: "30days", label: "近30天" },
    { value: "90days", label: "近90天" },
  ];

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
            <h1 className="text-2xl font-semibold text-gray-900">用户行为统计</h1>
            <p className="mt-1 text-sm text-gray-500">AI 护肤顾问使用数据分析</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          {/* 概览卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Users className="h-5 w-5" />} label="总会话数" value={data.overview.totalSessions} color="blue" />
            <StatCard icon={<CheckCircle className="h-5 w-5" />} label="完成率" value={formatPercent(data.overview.conversionRate)} subValue={`${data.overview.completedSessions} 完成`} color="green" />
            <StatCard icon={<Camera className="h-5 w-5" />} label="面部扫描使用率" value={formatPercent(data.overview.faceScanRate)} subValue={`${data.overview.faceScanUsed} 使用 / ${data.overview.faceScanSkipped} 跳过`} color="purple" highlight />
            <StatCard icon={<Sparkles className="h-5 w-5" />} label="AI 分析使用率" value={formatPercent(data.overview.aiUsageRate)} subValue={`${data.overview.aiAnalysisCount} AI / ${data.overview.fallbackAnalysisCount} 规则`} color="amber" />
          </div>

          {/* 关键指标提示 */}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-purple-100 p-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-purple-900">缓存策略建议</h3>
                <p className="mt-1 text-sm text-purple-700">
                  {data.overview.faceScanRate < 0.5 ? (
                    <>当前面部扫描使用率为 <strong>{formatPercent(data.overview.faceScanRate)}</strong>，超过 50% 的用户跳过面部扫描。<strong className="text-green-700">建议实现缓存功能</strong>，可节省约 {formatPercent(1 - data.overview.faceScanRate)} 的 AI 调用成本。</>
                  ) : (
                    <>当前面部扫描使用率为 <strong>{formatPercent(data.overview.faceScanRate)}</strong>，大部分用户使用面部扫描功能。缓存收益有限，建议暂不实现缓存。</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 漏斗分析 */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">转化漏斗</h2>
            <div className="space-y-3">
              <FunnelStep label="开始会话" value={data.funnel.started} total={data.funnel.started} color="blue" />
              <FunnelStep label="完成问卷" value={data.funnel.completedQuestionnaire} total={data.funnel.started} color="indigo" />
              <div className="ml-4 flex gap-4">
                <FunnelStep label="使用面部扫描" value={data.funnel.completedFaceScan} total={data.funnel.completedQuestionnaire} color="purple" icon={<Camera className="h-4 w-4" />} />
                <FunnelStep label="跳过面部扫描" value={data.funnel.skippedFaceScan} total={data.funnel.completedQuestionnaire} color="gray" icon={<SkipForward className="h-4 w-4" />} />
              </div>
              <FunnelStep label="完成分析" value={data.funnel.completedAnalysis} total={data.funnel.started} color="green" />
              <FunnelStep label="查看结果" value={data.funnel.viewedResult} total={data.funnel.started} color="emerald" />
              <FunnelStep label="分享结果" value={data.funnel.shared} total={data.funnel.started} color="amber" icon={<Share2 className="h-4 w-4" />} />
            </div>
          </div>

          {/* 设备分布 & 每日趋势 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">设备分布</h2>
              <div className="space-y-4">
                <DeviceBar icon={<Smartphone className="h-5 w-5" />} label="移动端" value={data.deviceDistribution.mobile} total={data.overview.totalSessions} color="blue" />
                <DeviceBar icon={<Monitor className="h-5 w-5" />} label="桌面端" value={data.deviceDistribution.desktop} total={data.overview.totalSessions} color="green" />
                <DeviceBar icon={<Tablet className="h-5 w-5" />} label="平板" value={data.deviceDistribution.tablet} total={data.overview.totalSessions} color="purple" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900"><Calendar className="h-5 w-5" />每日趋势</h2>
              <div className="space-y-2">
                {data.daily.slice(-7).map((day) => (
                  <div key={day.date} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-gray-500">{day.date.slice(5)}</span>
                    <div className="flex-1">
                      <div className="flex h-6 overflow-hidden rounded-full bg-gray-100">
                        <div className="bg-blue-500 transition-all" style={{ width: `${(day.sessions / Math.max(...data.daily.map(d => d.sessions), 1)) * 100}%` }} />
                      </div>
                    </div>
                    <span className="w-12 text-right font-medium">{day.sessions}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 问卷答案分布 */}
          {Object.keys(data.answerDistribution).length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">问卷答案分布</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(data.answerDistribution).map(([field, distribution]) => (
                  <AnswerDistribution key={field} field={field} distribution={distribution} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center text-gray-400">
          <p>暂无数据</p>
        </div>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({ icon, label, value, subValue, color, highlight }: {
  icon: React.ReactNode; label: string; value: string | number; subValue?: string;
  color: "blue" | "green" | "purple" | "amber"; highlight?: boolean;
}) {
  const colorClasses = { blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600", purple: "bg-purple-50 text-purple-600", amber: "bg-amber-50 text-amber-600" };
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm ${highlight ? "ring-2 ring-purple-300" : ""}`}>
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

// 漏斗步骤组件
function FunnelStep({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon?: React.ReactNode; }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  const colorClasses: Record<string, string> = { blue: "bg-blue-500", indigo: "bg-indigo-500", purple: "bg-purple-500", green: "bg-green-500", emerald: "bg-emerald-500", amber: "bg-amber-500", gray: "bg-gray-400" };
  return (
    <div className="flex items-center gap-3">
      {icon && <span className="text-gray-400">{icon}</span>}
      <span className="w-32 text-sm text-gray-600">{label}</span>
      <div className="flex-1">
        <div className="h-6 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full transition-all ${colorClasses[color] || "bg-gray-500"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className="w-16 text-right text-sm font-medium text-gray-900">{value}</span>
      <span className="w-16 text-right text-sm text-gray-500">{percent.toFixed(1)}%</span>
    </div>
  );
}

// 设备分布条组件
function DeviceBar({ icon, label, value, total, color }: { icon: React.ReactNode; label: string; value: number; total: number; color: "blue" | "green" | "purple"; }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  const colorClasses = { blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500" };
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400">{icon}</span>
      <span className="w-16 text-sm text-gray-600">{label}</span>
      <div className="flex-1">
        <div className="h-4 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full transition-all ${colorClasses[color]}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className="w-12 text-right text-sm font-medium">{value}</span>
      <span className="w-16 text-right text-sm text-gray-500">{percent.toFixed(1)}%</span>
    </div>
  );
}

// 答案分布组件
function AnswerDistribution({ field, distribution }: { field: string; distribution: Record<string, number>; }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const fieldLabels: Record<string, string> = { skinType: "肤质类型", primaryConcern: "主要关注", ageRange: "年龄段", skincareExperience: "护肤经验", allergies: "过敏情况", budget: "预算范围" };
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500"];
  return (
    <div>
      <h3 className="mb-3 font-medium text-gray-700">{fieldLabels[field] || field}</h3>
      <div className="space-y-2">
        {entries.map(([value, count], index) => {
          const percent = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={value} className="flex items-center gap-2 text-sm">
              <span className="w-20 truncate text-gray-600" title={value}>{value}</span>
              <div className="flex-1">
                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full transition-all ${colors[index % colors.length]}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
              <span className="w-8 text-right text-gray-500">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

