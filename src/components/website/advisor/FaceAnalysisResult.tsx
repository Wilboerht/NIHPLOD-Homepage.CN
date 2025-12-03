"use client";

import { m } from "framer-motion";
import {
  Droplets,
  Sparkles,
  CircleDot,
  Calendar,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";

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

/** 水分等级映射 */
const HYDRATION_CONFIG: Record<string, { percent: number; color: string }> = {
  low: { percent: 35, color: "bg-red-400" },
  medium: { percent: 65, color: "bg-yellow-400" },
  high: { percent: 90, color: "bg-green-400" },
};

/** 动画配置 */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

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
  const hydrationConfig = HYDRATION_CONFIG[result.hydration.level] || {
    percent: 50,
    color: "bg-gray-400",
  };

  return (
    <m.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 标题 */}
      <m.div variants={itemVariants} className="text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10">
          <Sparkles className="h-6 w-6 text-brand-gold" />
        </div>
        <h2 className="font-serif text-2xl text-brand-charcoal">
          AI 肌肤分析报告
        </h2>
      </m.div>

      {/* 肤质类型卡片 */}
      <m.div
        variants={itemVariants}
        className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm"
      >
        {/* 用户照片 */}
        {userImage && (
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-brand-cream">
            <img
              src={userImage}
              alt="您的照片"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* 肤质信息 */}
        <div className="flex-1">
          <div className="mb-1 text-sm text-brand-charcoal/60">肤质类型</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{skinTypeInfo.emoji}</span>
            <span className="font-serif text-xl text-brand-charcoal">
              {skinTypeInfo.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-brand-charcoal/60">
            <span>置信度</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-brand-beige">
              <div
                className="h-full rounded-full bg-brand-gold transition-all duration-1000"
                style={{ width: `${result.skinType.confidence * 100}%` }}
              />
            </div>
            <span>{Math.round(result.skinType.confidence * 100)}%</span>
          </div>
          <p className="mt-2 text-sm text-brand-charcoal/70">
            {result.skinType.description}
          </p>
        </div>
      </m.div>

      {/* 肌肤状态检测 */}
      <m.div
        variants={itemVariants}
        className="rounded-2xl bg-white p-4 shadow-sm"
      >
        <h3 className="mb-4 flex items-center gap-2 font-medium text-brand-charcoal">
          <CircleDot className="h-5 w-5 text-brand-gold" />
          检测到的肌肤状态
        </h3>

        <div className="space-y-4">
          {/* 水分状态 */}
          <div className="flex items-center gap-3">
            <Droplets className="h-5 w-5 flex-shrink-0 text-blue-500" />
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-brand-charcoal">水分状态</span>
                <span className="text-brand-charcoal/60">
                  {hydrationConfig.percent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-brand-beige">
                <m.div
                  className={`h-full rounded-full ${hydrationConfig.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${hydrationConfig.percent}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
              <p className="mt-1 text-xs text-brand-charcoal/60">
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
                <div key={index} className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-brand-charcoal">
                        {condition.condition}
                      </span>
                      <span
                        className={`text-xs ${severity.color} rounded bg-gray-100 px-1.5 py-0.5`}
                      >
                        {severity.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-brand-charcoal/60">
                      {condition.area} · {condition.description}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm">肌肤状态良好，未检测到明显问题</span>
            </div>
          )}

          {/* 肌肤年龄 */}
          {result.skinAge.estimated > 0 && (
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 flex-shrink-0 text-purple-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brand-charcoal">
                    肌肤年龄
                  </span>
                  <span className="font-serif text-lg text-brand-gold">
                    {result.skinAge.estimated} 岁
                  </span>
                  {userAge && (
                    <span
                      className={`text-xs ${
                        result.skinAge.estimated <= userAge
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}
                    >
                      {result.skinAge.estimated <= userAge
                        ? `比实际年轻 ${userAge - result.skinAge.estimated} 岁`
                        : `比实际偏老 ${result.skinAge.estimated - userAge} 岁`}
                    </span>
                  )}
                </div>
                {result.skinAge.factors.length > 0 && (
                  <p className="mt-0.5 text-xs text-brand-charcoal/60">
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
          <h3 className="mb-3 flex items-center gap-2 font-medium text-brand-charcoal">
            <Lightbulb className="h-5 w-5 text-brand-gold" />
            护肤建议
          </h3>
          <ul className="space-y-2">
            {result.recommendations.map((rec, index) => (
              <m.li
                key={index}
                className="flex items-start gap-2 text-sm text-brand-charcoal/80"
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

