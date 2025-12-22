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
  AlertCircle,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

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
          {/* 核心指标卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="总会话数"
              value={data.overview.totalSessions}
              color="blue"
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="完成率"
              value={formatPercent(data.overview.conversionRate)}
              subValue={`${data.overview.completedSessions} 完成`}
              color="green"
            />
            <StatCard
              icon={<Camera className="h-5 w-5" />}
              label="面部扫描率"
              value={formatPercent(data.overview.faceScanRate)}
              subValue={`${data.overview.faceScanUsed} 扫描 · ${data.overview.faceScanSkipped} 跳过`}
              color="purple"
            />
            <StatCard
              icon={<Sparkles className="h-5 w-5" />}
              label="AI 分析率"
              value={formatPercent(data.overview.aiUsageRate)}
              subValue={`${data.overview.aiAnalysisCount} AI · ${data.overview.fallbackAnalysisCount} 规则`}
              color="amber"
            />
          </div>

          {/* 智能洞察 */}
          <InsightCard data={data} formatPercent={formatPercent} />

          {/* 转化漏斗 & 设备分布 & 每日趋势 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 转化漏斗 */}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-gray-900">转化漏斗</h3>
              <FunnelChart data={data} />
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">整体转化率 = 查看结果 / 开始会话</span>
                <span className="text-sm font-semibold text-green-600">{formatPercent(data.overview.conversionRate)}</span>
              </div>
            </div>

            {/* 右侧：设备分布 + 每日趋势 */}
            <div className="flex flex-col gap-4">
              {/* 设备分布 */}
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-gray-900">设备分布</h3>
                <DeviceDistribution data={data.deviceDistribution} total={data.overview.totalSessions} />
              </div>

              {/* 每日趋势 */}
              <div className="flex-1 rounded-xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">每日趋势</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> 会话
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> 完成
                    </span>
                  </div>
                </div>
                <DailyTrendChart data={data.daily} />
              </div>
            </div>
          </div>

          {/* 问卷答案分布 */}
          {Object.keys(data.answerDistribution).length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-gray-900">问卷答案分布</h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Object.entries(data.answerDistribution).map(([field, distribution]) => (
                  <AnswerDistribution key={field} field={field} distribution={distribution} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-white text-gray-400">
          <AlertCircle className="mb-2 h-10 w-10" />
          <p>暂无数据</p>
        </div>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({ icon, label, value, subValue, color, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color: "blue" | "green" | "purple" | "amber";
  highlight?: boolean;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className={cn(
      "rounded-xl bg-white p-5 shadow-sm",
      highlight && "ring-2 ring-purple-300"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", colorClasses[color])}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {subValue && <p className="mt-1 text-xs text-gray-400">{subValue}</p>}
      </div>
    </div>
  );
}

// 智能洞察卡片
function InsightCard({ data, formatPercent }: { data: AnalyticsData; formatPercent: (v: number) => string }) {
  const insights: { type: "success" | "warning" | "info"; title: string; desc: string }[] = [];

  // 根据数据生成洞察
  if (data.overview.conversionRate > 0.7) {
    insights.push({ type: "success", title: "转化率优秀", desc: `当前转化率 ${formatPercent(data.overview.conversionRate)}，高于行业平均水平` });
  } else if (data.overview.conversionRate < 0.3) {
    insights.push({ type: "warning", title: "转化率待优化", desc: `当前转化率 ${formatPercent(data.overview.conversionRate)}，建议优化问卷流程` });
  }

  if (data.overview.faceScanRate < 0.5) {
    insights.push({
      type: "info",
      title: "缓存策略建议",
      desc: `${formatPercent(1 - data.overview.faceScanRate)} 用户跳过面部扫描，可考虑实现结果缓存以节省 AI 成本`,
    });
  }

  if (data.overview.aiUsageRate < 0.8 && data.overview.aiAnalysisCount + data.overview.fallbackAnalysisCount > 0) {
    insights.push({
      type: "warning",
      title: "AI 服务降级较多",
      desc: `${formatPercent(1 - data.overview.aiUsageRate)} 的分析使用了规则降级，请检查 AI 服务状态`,
    });
  }

  if (insights.length === 0) {
    insights.push({ type: "success", title: "运行良好", desc: "各项指标正常，继续保持" });
  }

  const typeStyles = {
    success: "border-green-200 bg-green-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  };
  const iconStyles = {
    success: "bg-green-100 text-green-600",
    warning: "bg-amber-100 text-amber-600",
    info: "bg-blue-100 text-blue-600",
  };
  const textStyles = {
    success: "text-green-900",
    warning: "text-amber-900",
    info: "text-blue-900",
  };
  const descStyles = {
    success: "text-green-700",
    warning: "text-amber-700",
    info: "text-blue-700",
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {insights.map((insight, i) => (
        <div key={i} className={cn("rounded-xl border p-4", typeStyles[insight.type])}>
          <div className="flex items-start gap-3">
            <div className={cn("rounded-lg p-2", iconStyles[insight.type])}>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h3 className={cn("font-medium", textStyles[insight.type])}>{insight.title}</h3>
              <p className={cn("mt-1 text-sm", descStyles[insight.type])}>{insight.desc}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 转化漏斗图
function FunnelChart({ data }: { data: AnalyticsData }) {
  const steps = [
    { label: "开始会话", value: data.funnel.started, color: "bg-blue-500", lightBg: "bg-blue-50", textColor: "text-blue-600" },
    { label: "完成问卷", value: data.funnel.completedQuestionnaire, color: "bg-indigo-500", lightBg: "bg-indigo-50", textColor: "text-indigo-600" },
    { label: "完成分析", value: data.funnel.completedAnalysis, color: "bg-purple-500", lightBg: "bg-purple-50", textColor: "text-purple-600" },
    { label: "查看结果", value: data.funnel.viewedResult, color: "bg-emerald-500", lightBg: "bg-emerald-50", textColor: "text-emerald-600" },
    { label: "分享结果", value: data.funnel.shared, color: "bg-amber-500", lightBg: "bg-amber-50", textColor: "text-amber-600" },
  ];

  const maxValue = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const percent = data.funnel.started > 0 ? (step.value / data.funnel.started) * 100 : 0;
        const width = Math.max((step.value / maxValue) * 100, 2);

        return (
          <div key={step.label}>
            {/* 主行 */}
            <div className="flex items-center gap-3">
              {/* 序号 */}
              <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white", step.color)}>
                {index + 1}
              </div>
              {/* 标签 */}
              <div className="w-20 shrink-0 text-sm text-gray-600">{step.label}</div>
              {/* 进度条 */}
              <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", step.color)}
                  style={{ width: `${width}%` }}
                />
              </div>
              {/* 数值 */}
              <div className="flex w-24 shrink-0 items-center justify-end gap-2 text-sm">
                <span className="font-semibold text-gray-900">{step.value}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", step.lightBg, step.textColor)}>
                  {percent.toFixed(0)}%
                </span>
              </div>
            </div>
            {/* 分支：面部扫描 */}
            {step.label === "完成问卷" && (
              <div className="ml-9 mt-1.5 flex gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-purple-600">
                  <Camera className="h-3.5 w-3.5" />
                  <span>扫描 {data.funnel.completedFaceScan}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>跳过 {data.funnel.skippedFaceScan}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 设备分布组件 - 横向紧凑布局
function DeviceDistribution({ data, total }: { data: AnalyticsData["deviceDistribution"]; total: number }) {
  const devices = [
    { key: "mobile", label: "移动端", icon: Smartphone, value: data.mobile, color: "bg-blue-500", lightColor: "bg-blue-50", textColor: "text-blue-600" },
    { key: "desktop", label: "桌面端", icon: Monitor, value: data.desktop, color: "bg-green-500", lightColor: "bg-green-50", textColor: "text-green-600" },
    { key: "tablet", label: "平板", icon: Tablet, value: data.tablet, color: "bg-purple-500", lightColor: "bg-purple-50", textColor: "text-purple-600" },
  ];

  const safeTotal = Math.max(total, 1);

  return (
    <div className="flex items-center gap-6">
      {/* 堆叠条形图 */}
      <div className="flex-1">
        <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-gray-100">
          {devices.map((device) => {
            const percent = (device.value / safeTotal) * 100;
            return (
              <div
                key={device.key}
                className={cn("transition-all", device.color)}
                style={{ width: `${percent}%` }}
              />
            );
          })}
        </div>
        {/* 图例 */}
        <div className="flex flex-wrap gap-4">
          {devices.map((device) => {
            const Icon = device.icon;
            const percent = total > 0 ? (device.value / total) * 100 : 0;
            return (
              <div key={device.key} className="flex items-center gap-2">
                <div className={cn("rounded p-1.5", device.lightColor, device.textColor)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">{device.label}</span>
                  <span className="ml-1.5 font-medium text-gray-900">{device.value}</span>
                  <span className="ml-1 text-gray-400">({percent.toFixed(0)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 总数 */}
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-900">{total}</div>
        <div className="text-xs text-gray-500">总会话</div>
      </div>
    </div>
  );
}

// 每日趋势图 - 紧凑版
function DailyTrendChart({ data }: { data: AnalyticsData["daily"] }) {
  const displayData = data.slice(-7);
  const maxValue = Math.max(...displayData.map(d => Math.max(d.sessions, d.completed)), 1);

  return (
    <div className="flex items-end gap-1">
      {displayData.map((day) => {
        const sessionHeight = (day.sessions / maxValue) * 100;
        const completedHeight = (day.completed / maxValue) * 100;

        return (
          <div key={day.date} className="group flex flex-1 flex-col items-center">
            {/* 柱状图 */}
            <div className="relative flex h-24 w-full items-end justify-center gap-0.5">
              <div
                className="w-3 rounded-t bg-blue-500 transition-all group-hover:bg-blue-600"
                style={{ height: `${Math.max(sessionHeight, 4)}%` }}
                title={`会话: ${day.sessions}`}
              />
              <div
                className="w-3 rounded-t bg-green-500 transition-all group-hover:bg-green-600"
                style={{ height: `${Math.max(completedHeight, 4)}%` }}
                title={`完成: ${day.completed}`}
              />
            </div>
            {/* 日期 */}
            <span className="mt-1.5 text-[10px] text-gray-400">
              {day.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 答案分布组件
function AnswerDistribution({ field, distribution }: { field: string; distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const fieldLabels: Record<string, string> = {
    skinType: "肤质类型",
    primaryConcern: "主要困扰",
    ageRange: "年龄段",
    skincareExperience: "护肤经验",
    allergies: "过敏情况",
    budget: "预算范围",
    currentRoutine: "护肤习惯",
  };
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-amber-500",
    "bg-pink-500",
  ];

  if (entries.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400">暂无数据</div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center justify-between">
        <span className="font-medium text-gray-900">{fieldLabels[field] || field}</span>
        <span className="text-xs text-gray-400">{total} 人</span>
      </h3>
      <div className="space-y-2.5">
        {entries.map(([value, count], index) => {
          const percent = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={value} className="group">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate text-gray-600" title={value}>{value}</span>
                <span className="ml-2 shrink-0 text-gray-400">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn(
                    "h-full transition-all duration-300 group-hover:opacity-80",
                    colors[index % colors.length]
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

