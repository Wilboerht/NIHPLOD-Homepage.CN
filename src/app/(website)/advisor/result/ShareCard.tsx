"use client";

/**
 * 分享卡片组件
 * 专门设计用于截图分享的卡片布局
 * 注意：使用原生 img 标签以确保 html2canvas 能正确渲染
 */

import { forwardRef, useMemo } from "react";
import type { FaceAnalysisResult } from "@/app/api/advisor/face-analyze/route";

interface ShareCardProps {
  skinType: string;
  skinTypeLabel: string;
  concerns: string[];
  skinAge?: number;
  summary: string;
  faceAnalysis?: FaceAnalysisResult | null;
  userImage?: string | null;
}

/** 肤质类型对应的描述 */
const SKIN_TYPE_DESC: Record<string, string> = {
  oily: "皮脂分泌旺盛，易出油光泽",
  dry: "皮脂分泌不足，易干燥紧绷",
  combination: "T区偏油，两颊偏干",
  normal: "水油平衡，肤质健康",
  sensitive: "屏障脆弱，易受刺激",
};

/** 水分状态描述 */
function getHydrationStatus(percent: number): { label: string; color: string } {
  if (percent >= 70) return { label: "水润充足", color: "#22C55E" };
  if (percent >= 50) return { label: "基本正常", color: "#F59E0B" };
  return { label: "需要补水", color: "#EF4444" };
}

/** 获取完整的图片 URL（用于 html2canvas） */
function getAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${window.location.origin}${path}`;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  function ShareCard(
    { skinType, skinTypeLabel, concerns, skinAge, summary, faceAnalysis, userImage },
    ref
  ) {
    const hydrationPercent = faceAnalysis?.hydration?.percent ?? 60;
    const hydrationStatus = getHydrationStatus(hydrationPercent);

    // 预处理图片 URL
    const logoUrl = useMemo(() => getAbsoluteUrl("/images/logo.webp"), []);
    const qrcodeUrl = useMemo(() => getAbsoluteUrl("/images/qrcode.webp"), []);

    return (
      <div
        ref={ref}
        className="w-[375px] bg-gradient-to-b from-[#FAF8F5] to-[#F5F0E8] p-6"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        {/* 头部：品牌 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="NIHPLOD"
              width={32}
              height={32}
              className="rounded-lg"
              crossOrigin="anonymous"
            />
            <span className="text-lg font-medium tracking-wider text-brand-charcoal">
              NIHPLOD
            </span>
          </div>
          <div className="rounded-full bg-brand-gold/10 px-3 py-1 text-xs text-brand-gold">
            AI 肌肤分析
          </div>
        </div>

        {/* 用户照片（如果有） */}
        {userImage && (
          <div className="mb-5 flex justify-center">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userImage}
                alt="用户照片"
                className="absolute inset-0 h-full w-full object-cover"
                // 只有非 data URL 才需要 crossOrigin
                {...(!userImage.startsWith("data:") && { crossOrigin: "anonymous" })}
              />
            </div>
          </div>
        )}

        {/* 肤质类型卡片 */}
        <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-1 text-xs text-brand-charcoal/50">肤质类型</div>
          <div className="mb-2 text-2xl font-medium text-brand-charcoal">
            {skinTypeLabel}
          </div>
          <div className="text-sm text-brand-charcoal/60">
            {SKIN_TYPE_DESC[skinType] || summary.slice(0, 30)}
          </div>
        </div>

        {/* 关键数据 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {/* 水分状态 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-brand-charcoal/50">
              <span>💧</span>
              <span>水分状态</span>
            </div>
            <div className="mb-1.5 text-xl font-medium" style={{ color: hydrationStatus.color }}>
              {hydrationPercent}%
            </div>
            <div className="text-xs" style={{ color: hydrationStatus.color }}>
              {hydrationStatus.label}
            </div>
          </div>

          {/* 肌肤年龄 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-brand-charcoal/50">
              <span>📅</span>
              <span>肌肤年龄</span>
            </div>
            <div className="mb-1.5 text-xl font-medium text-brand-charcoal">
              {skinAge || faceAnalysis?.skinAge?.estimated || "--"} 岁
            </div>
            <div className="text-xs text-brand-charcoal/50">AI 评估</div>
          </div>
        </div>

        {/* 肌肤问题 */}
        {concerns.length > 0 && (
          <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-3 text-xs text-brand-charcoal/50">检测到的肌肤问题</div>
            <div className="flex flex-wrap gap-2">
              {concerns.slice(0, 4).map((concern, i) => (
                <span
                  key={i}
                  className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700"
                >
                  {concern}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 底部：二维码 + 引导 */}
        <div className="mt-6 flex items-center justify-between rounded-xl bg-brand-gold/5 p-4">
          <div>
            <div className="mb-1 text-sm font-medium text-brand-charcoal">
              扫码测测你的肌肤
            </div>
            <div className="text-xs text-brand-charcoal/50">
              AI 智能分析 · 专属护肤方案
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrcodeUrl}
            alt="扫码体验"
            width={64}
            height={64}
            className="rounded-lg"
            crossOrigin="anonymous"
          />
        </div>
      </div>
    );
  }
);

