"use client";

import { m } from "framer-motion";
import type { ZoneAnalysis } from "@/lib/advisor-utils";

interface FaceZoneHeatmapProps {
  /** 区域分析数据 */
  zoneAnalysis: ZoneAnalysis;
}

/** 热力等级 */
type HeatLevel = "good" | "normal" | "warning" | "critical";

/** 根据数值获取热力等级 */
function getHeatLevel(value: number, isPositive = false): HeatLevel {
  const normalizedValue = isPositive ? 100 - value : value;
  if (normalizedValue < 30) return "good";
  if (normalizedValue < 50) return "normal";
  if (normalizedValue < 70) return "warning";
  return "critical";
}

/** 热力等级配色 */
const HEAT_COLORS: Record<HeatLevel, string> = {
  good: "#10b981",
  normal: "#f59e0b",
  warning: "#f97316",
  critical: "#ef4444",
};

/** 热力等级标签 */
const HEAT_LABELS: Record<HeatLevel, string> = {
  good: "良好",
  normal: "一般",
  warning: "需关注",
  critical: "需改善",
};

/** 区域配置 */
const ZONE_CONFIG = {
  forehead: { label: "额头" },
  eyeArea: { label: "眼周" },
  tZone: { label: "T区" },
  leftCheek: { label: "左颊" },
  rightCheek: { label: "右颊" },
  jawline: { label: "下颌" },
};

type ZoneKey = keyof typeof ZONE_CONFIG;

/**
 * 面部区域分析组件 - 卡片进度条样式
 * 不需要用户图片，直接用进度条展示各区域健康度
 */
export function FaceZoneHeatmap({ zoneAnalysis }: FaceZoneHeatmapProps) {
  // 计算每个区域的分数、等级和描述
  const getZoneData = (zone: ZoneKey): { level: HeatLevel; score: number; condition: string } => {
    let score = 50;

    switch (zone) {
      case "forehead": {
        const fh = zoneAnalysis.forehead;
        score = (fh.wrinkles + fh.oil + (100 - fh.texture)) / 3;
        return { level: getHeatLevel(score), score: Math.round(100 - score), condition: fh.condition };
      }
      case "tZone": {
        const tz = zoneAnalysis.tZone;
        score = (tz.oil + tz.pores) / 2;
        return { level: getHeatLevel(score), score: Math.round(100 - score), condition: tz.condition };
      }
      case "leftCheek": {
        const lc = zoneAnalysis.leftCheek;
        score = (lc.spots + lc.redness + (100 - lc.texture)) / 3;
        return { level: getHeatLevel(score), score: Math.round(100 - score), condition: lc.condition };
      }
      case "rightCheek": {
        const rc = zoneAnalysis.rightCheek;
        score = (rc.spots + rc.redness + (100 - rc.texture)) / 3;
        return { level: getHeatLevel(score), score: Math.round(100 - score), condition: rc.condition };
      }
      case "eyeArea": {
        const ea = zoneAnalysis.eyeArea;
        score = (ea.wrinkles + ea.darkCircles + (100 - ea.firmness)) / 3;
        return { level: getHeatLevel(score), score: Math.round(100 - score), condition: ea.condition };
      }
      case "jawline": {
        const jl = zoneAnalysis.jawline;
        score = (jl.firmness + jl.contour) / 2;
        return { level: getHeatLevel(score, true), score: Math.round(score), condition: jl.condition };
      }
      default:
        return { level: "normal", score: 50, condition: "" };
    }
  };

  const zones: ZoneKey[] = ["forehead", "eyeArea", "tZone", "leftCheek", "rightCheek", "jawline"];

  return (
    <div className="flex w-full flex-col gap-2">
      {/* 两列网格 */}
      <div className="grid grid-cols-2 gap-2">
        {zones.map((zone, index) => {
          const data = getZoneData(zone);
          const config = ZONE_CONFIG[zone];
          const color = HEAT_COLORS[data.level];

          return (
            <m.div
              key={zone}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-lg bg-white/60 px-3 py-2.5"
            >
              {/* 区域名 + 分数 */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-charcoal">{config.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium" style={{ color }}>{data.score}</span>
                  <span className="text-[10px] text-brand-charcoal/40">{HEAT_LABELS[data.level]}</span>
                </div>
              </div>

              {/* 进度条 */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-brand-charcoal/5">
                <m.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${data.score}%` }}
                  transition={{ delay: index * 0.03 + 0.1, duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* 问题描述 */}
              {data.condition && data.condition !== "暂无详细数据" && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-brand-charcoal/60">
                  {data.condition}
                </p>
              )}
            </m.div>
          );
        })}
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-center gap-3 pt-1 text-[10px]">
        {(["good", "normal", "warning", "critical"] as HeatLevel[]).map((level) => (
          <div key={level} className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: HEAT_COLORS[level] }} />
            <span className="text-brand-charcoal/40">{HEAT_LABELS[level]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
