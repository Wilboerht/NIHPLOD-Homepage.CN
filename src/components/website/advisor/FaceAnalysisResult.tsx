"use client";

import { m } from "framer-motion";
import {
  Droplets,
  CircleDot,
  Calendar,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Target,
  TrendingUp,
  MapPin,
} from "lucide-react";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";
import { SkinRadarChart } from "./SkinRadarChart";
import { FaceZoneHeatmap } from "./FaceZoneHeatmap";
import { DIMENSION_LABELS, GRADE_LABELS, scoreToGrade } from "@/lib/advisor-utils";

interface FaceAnalysisResultProps {
  /** 分析结果数据 */
  result: FaceAnalysisData;
  /** 用户照片（可选） */
  userImage?: string;
  /** 用户实际年龄（可选，用于对比） */
  userAge?: number;
}

/** 肤质类型映射 */
const SKIN_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  dry: { label: "干性肌肤", emoji: "🏜️" },
  oily: { label: "油性肌肤", emoji: "💧" },
  combination: { label: "混合性肌肤", emoji: "⚖️" },
  normal: { label: "中性肌肤", emoji: "✨" },
  sensitive: { label: "敏感性肌肤", emoji: "🌸" },
};

/** 严重程度映射 */
const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  mild: { label: "轻度", color: "text-green-600" },
  moderate: { label: "中度", color: "text-yellow-600" },
  severe: { label: "重度", color: "text-red-600" },
};

/** 水分等级颜色映射（百分比现在从 AI 返回） */
const HYDRATION_COLORS: Record<string, string> = {
  low: "bg-red-400",
  medium: "bg-yellow-400",
  high: "bg-green-400",
};

/** 根据百分比获取颜色 */
const getHydrationColor = (percent: number): string => {
  if (percent < 40) return "bg-red-400";
  if (percent < 70) return "bg-yellow-400";
  return "bg-green-400";
};

/** 置信度提示映射 */
const getConfidenceHint = (confidence: number): { text: string; color: string } => {
  if (confidence >= 0.8) {
    return { text: "高置信度", color: "text-green-600" };
  } else if (confidence >= 0.6) {
    return { text: "参考价值", color: "text-brand-gold" };
  } else if (confidence >= 0.4) {
    return { text: "仅供参考", color: "text-amber-600" };
  } else {
    return { text: "建议重拍", color: "text-red-500" };
  }
};

/** 动画配置 */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
} as const;

/**
 * AI 面部分析结果展示组件
 */
export function FaceAnalysisResult({
  result,
  userImage,
  userAge,
}: FaceAnalysisResultProps) {
  const skinTypeInfo = SKIN_TYPE_LABELS[result.skinType.type] || {
    label: "未知",
    emoji: "❓",
  };

  // 使用 AI 返回的真实百分比，如果没有则根据 level 估算
  const hydrationPercent = result.hydration.percent ??
    (result.hydration.level === "low" ? 35 : result.hydration.level === "high" ? 85 : 60);
  const hydrationColor = HYDRATION_COLORS[result.hydration.level] || getHydrationColor(hydrationPercent);

  const confidenceHint = getConfidenceHint(result.skinType.confidence);

  return (
    <m.div
      className="space-y-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 肤质类型卡片 - 高奢风格 */}
      <m.div
        variants={itemVariants}
        className="relative flex gap-4 overflow-hidden rounded-2xl border border-brand-beige/50 bg-white/95 p-5 shadow-card backdrop-blur-sm"
      >
        {/* 装饰性背景 */}
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-radial-gold opacity-30" />

        {/* 用户照片 */}
        {userImage && (
          <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border-2 border-brand-gold/20 bg-brand-cream shadow-sm">
            <img
              src={userImage}
              alt="您的照片"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* 肤质信息 */}
        <div className="relative flex-1">
          <p className="mb-1.5 text-xs font-light tracking-wider text-brand-charcoal/50">肤质类型</p>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{skinTypeInfo.emoji}</span>
            <span className="font-serif text-xl font-light tracking-wide text-brand-charcoal">
              {skinTypeInfo.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-charcoal/50">
            <span className="font-light">分析置信度</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-brand-beige/60">
              <m.div
                className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-light"
                initial={{ width: 0 }}
                animate={{ width: `${result.skinType.confidence * 100}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
            <span className="font-medium text-brand-charcoal/70">{Math.round(result.skinType.confidence * 100)}%</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${confidenceHint.color} bg-current/10`}>
              {confidenceHint.text}
            </span>
          </div>
          <p className="mt-2.5 text-sm font-light leading-relaxed text-brand-charcoal/65">
            {result.skinType.description}
          </p>
        </div>
      </m.div>

      {/* 综合评分 + 八维分析 合并卡片 */}
      {(result.overallScore !== undefined || result.dimensions) && (
        <m.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-2xl border border-brand-gold/20 bg-gradient-to-br from-white via-brand-champagne/10 to-white p-5 shadow-luxury"
        >
          {/* 装饰性背景 */}
          <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-gradient-radial-gold opacity-15" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-gradient-radial-gold opacity-10" />

          <h3 className="relative mb-4 flex items-center gap-2.5 font-serif text-base font-light tracking-wide text-brand-charcoal">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/15">
              <Target className="h-4 w-4 text-brand-gold" />
            </div>
            肌肤健康分析
          </h3>

          {/* 主体内容：评分 + 雷达图 并排 */}
          <div className="relative grid grid-cols-[40%_60%] items-center py-4">
            {/* 左侧：综合评分 */}
            {result.overallScore !== undefined && (
              <div className="flex flex-col items-center justify-center">
                <div className="relative">
                  <svg className="h-[160px] w-[160px]" viewBox="0 0 100 100">
                    {/* 背景圆环 */}
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="#E8E2D9"
                      strokeWidth="5"
                      opacity="0.5"
                    />
                    {/* 进度圆环 */}
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#C9A86C" />
                        <stop offset="50%" stopColor="#D4B77A" />
                        <stop offset="100%" stopColor="#B8975B" />
                      </linearGradient>
                    </defs>
                    <m.circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="url(#scoreGradient)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${result.overallScore * 2.64} 264`}
                      transform="rotate(-90 50 50)"
                      initial={{ strokeDasharray: "0 264" }}
                      animate={{ strokeDasharray: `${result.overallScore * 2.64} 264` }}
                      transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <m.span
                      className="font-serif text-4xl font-light text-brand-charcoal"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, duration: 0.5 }}
                    >
                      {result.overallScore}
                    </m.span>
                    <span className="text-[10px] font-light tracking-wider text-brand-charcoal/40">/ 100</span>
                  </div>
                </div>
                {/* 评分等级标签 */}
                <m.div
                  className="mt-3 flex flex-col items-center gap-1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.4 }}
                >
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    result.overallScore >= 85 ? "bg-green-100 text-green-700" :
                    result.overallScore >= 70 ? "bg-brand-gold/15 text-brand-gold" :
                    result.overallScore >= 55 ? "bg-amber-100 text-amber-700" :
                    "bg-orange-100 text-orange-700"
                  }`}>
                    {result.overallScore >= 85 ? "✨ 优秀" :
                     result.overallScore >= 70 ? "👍 良好" :
                     result.overallScore >= 55 ? "📊 一般" :
                     "⚠️ 需关注"}
                  </span>
                  <span className="text-[10px] text-brand-charcoal/40">综合评分</span>
                </m.div>
              </div>
            )}

            {/* 右侧：雷达图 */}
            {result.dimensions && (
              <div className="flex items-center justify-center">
                <SkinRadarChart
                  dimensions={result.dimensions}
                  size={320}
                />
              </div>
            )}
          </div>

          {/* 底部：评语 + 重点关注 */}
          <div className="relative mt-4 space-y-3">
            {/* 评语 */}
            {result.overallScore !== undefined && (
              <m.p
                className="text-center text-sm font-light tracking-wide text-brand-charcoal/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
              >
                {result.overallScore >= 85 ? "肌肤状态优秀，持续保持您的护肤仪式" :
                 result.overallScore >= 70 ? "肌肤状态良好，精心护理将更加出众" :
                 result.overallScore >= 55 ? "肌肤有提升空间，让我们为您制定方案" :
                 "肌肤需要关怀，专属护理方案已就绪"}
              </m.p>
            )}

            {/* 重点关注项 */}
            {result.priorityAreas && result.priorityAreas.length > 0 && (
              <div className="rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-orange-50/60 p-3">
                <p className="text-sm font-light text-amber-800/80">
                  <span className="font-medium text-amber-900">重点关注</span>
                  <span className="mx-1.5 text-amber-600/50">·</span>
                  {result.priorityAreas.map(area => DIMENSION_LABELS[area as keyof typeof DIMENSION_LABELS] || area).join("、")}
                </p>
              </div>
            )}
          </div>
        </m.div>
      )}

      {/* 面部区域热力图 - 高奢风格 */}
      {result.zoneAnalysis && (
        <m.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-2xl border border-brand-beige/50 bg-white/95 p-5 shadow-card backdrop-blur-sm"
        >
          <h3 className="mb-4 flex items-center gap-2.5 font-serif text-base font-light tracking-wide text-brand-charcoal">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/15">
              <MapPin className="h-4 w-4 text-brand-gold" />
            </div>
            面部区域分析
          </h3>
          <div className="flex justify-center py-2">
            <FaceZoneHeatmap
              zoneAnalysis={result.zoneAnalysis}
              userImage={userImage}
              width={280}
            />
          </div>
        </m.div>
      )}

      {/* 肌肤状态检测 - 高奢风格 */}
      <m.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-2xl border border-brand-beige/50 bg-white/95 p-5 shadow-card backdrop-blur-sm"
      >
        <h3 className="mb-5 flex items-center gap-2.5 font-serif text-base font-light tracking-wide text-brand-charcoal">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/15">
            <CircleDot className="h-4 w-4 text-brand-gold" />
          </div>
          肌肤状态检测
        </h3>

        <div className="space-y-5">
          {/* 水分状态 */}
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Droplets className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-light text-brand-charcoal">水分状态</span>
                <span className="font-medium text-brand-charcoal/70">
                  {hydrationPercent}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-brand-beige/50">
                <m.div
                  className={`h-full rounded-full ${hydrationColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${hydrationPercent}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <p className="mt-1.5 text-xs font-light leading-relaxed text-brand-charcoal/55">
                {result.hydration.description}
              </p>
            </div>
          </div>

          {/* 肌肤问题列表 */}
          {result.skinConditions.length > 0 ? (
            result.skinConditions.map((condition, index) => {
              const severity = SEVERITY_LABELS[condition.severity] || {
                label: "未知",
                color: "text-gray-600",
              };
              return (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-light text-brand-charcoal">
                        {condition.condition}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${severity.color} bg-current/10`}
                      >
                        {severity.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-light leading-relaxed text-brand-charcoal/55">
                      {condition.area} · {condition.description}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-4 rounded-xl bg-green-50/60 p-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-sm font-light text-green-700">肌肤状态良好，未检测到明显问题</span>
            </div>
          )}

          {/* 肌肤年龄 */}
          {result.skinAge.estimated > 0 && (
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-50">
                <Calendar className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-light text-brand-charcoal">
                    肌肤年龄
                  </span>
                  <span className="font-serif text-lg font-medium text-brand-gold">
                    {result.skinAge.estimated} 岁
                  </span>
                  {userAge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        result.skinAge.estimated <= userAge
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {result.skinAge.estimated <= userAge
                        ? `比实际年轻 ${userAge - result.skinAge.estimated} 岁 ✨`
                        : `比实际偏老 ${result.skinAge.estimated - userAge} 岁`}
                    </span>
                  )}
                </div>
                {result.skinAge.factors.length > 0 && (
                  <p className="mt-1 text-xs font-light leading-relaxed text-brand-charcoal/55">
                    影响因素：{result.skinAge.factors.join("、")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </m.div>

      {/* 护肤建议 */}
      {result.recommendations.length > 0 && (
        <m.div
          variants={itemVariants}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 flex items-center gap-2 font-serif text-base text-brand-charcoal">
            <Lightbulb className="h-5 w-5 text-brand-gold" />
            护肤建议
          </h3>
          <ul className="space-y-2">
            {result.recommendations.map((rec, index) => (
              <m.li
                key={index}
                className="flex items-start gap-2 text-sm leading-relaxed text-brand-charcoal/80"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
              >
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold" />
                {rec}
              </m.li>
            ))}
          </ul>
        </m.div>
      )}
    </m.div>
  );
}

