"use client";

import { useState, useMemo } from "react";
import { m, AnimatePresence } from "framer-motion";
import type { ZoneAnalysis } from "@/lib/advisor-utils";

interface FaceZoneHeatmapProps {
  /** 区域分析数据 */
  zoneAnalysis: ZoneAnalysis;
  /** 用户照片 */
  userImage?: string;
  /** 组件宽度 */
  width?: number;
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

/** 热力等级配色 - 使用青色系作为主色调 */
const HEAT_STYLES: Record<HeatLevel, { stroke: string; fill: string; markerColor: string }> = {
  good: { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.12)", markerColor: "#10b981" },
  normal: { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.18)", markerColor: "#f59e0b" },
  warning: { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.22)", markerColor: "#f97316" },
  critical: { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.28)", markerColor: "#ef4444" },
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

/** 生成随机问题标记点 */
function generateMarkers(
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  count: number,
  seed: number
): Array<{ x: number; y: number; size: number }> {
  const markers: Array<{ x: number; y: number; size: number }> = [];
  // 使用简单的伪随机数生成器确保一致性
  let s = seed;
  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = random() * 0.85; // 不要太靠边
    const x = cx + Math.cos(angle) * radiusX * r;
    const y = cy + Math.sin(angle) * radiusY * r;
    const size = 1.5 + random() * 2;
    markers.push({ x, y, size });
  }
  return markers;
}

/** 生成细纹标记（短线条） */
function generateWrinkleLines(
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  count: number,
  seed: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let s = seed;
  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = random() * 0.7;
    const x = cx + Math.cos(angle) * radiusX * r;
    const y = cy + Math.sin(angle) * radiusY * r;
    const lineAngle = random() * Math.PI - Math.PI / 2;
    const len = 4 + random() * 8;
    lines.push({
      x1: x - Math.cos(lineAngle) * len / 2,
      y1: y - Math.sin(lineAngle) * len / 2,
      x2: x + Math.cos(lineAngle) * len / 2,
      y2: y + Math.sin(lineAngle) * len / 2,
    });
  }
  return lines;
}

/**
 * 面部区域热力图组件 - 在用户照片上叠加区域轮廓和问题标注
 */
export function FaceZoneHeatmap({
  zoneAnalysis,
  userImage,
  width = 300,
}: FaceZoneHeatmapProps) {
  const [activeZone, setActiveZone] = useState<ZoneKey | null>(null);

  // 计算每个区域的热力等级和问题数量
  const getZoneData = (zone: ZoneKey): { level: HeatLevel; score: number; problemCount: number; wrinkleCount: number } => {
    let score = 50;
    let problemCount = 0;
    let wrinkleCount = 0;

    switch (zone) {
      case "forehead": {
        const fh = zoneAnalysis.forehead;
        score = (fh.wrinkles + fh.oil + (100 - fh.texture)) / 3;
        problemCount = Math.round(fh.oil / 3);
        wrinkleCount = Math.round(fh.wrinkles / 8);
        return { level: getHeatLevel(score), score: Math.round(100 - score), problemCount, wrinkleCount };
      }
      case "tZone": {
        const tz = zoneAnalysis.tZone;
        score = (tz.oil + tz.pores) / 2;
        problemCount = Math.round(tz.pores / 2.5);
        return { level: getHeatLevel(score), score: Math.round(100 - score), problemCount, wrinkleCount: 0 };
      }
      case "leftCheek": {
        const lc = zoneAnalysis.leftCheek;
        score = (lc.spots + lc.redness + (100 - lc.texture)) / 3;
        problemCount = Math.round((lc.spots + lc.redness) / 3);
        return { level: getHeatLevel(score), score: Math.round(100 - score), problemCount, wrinkleCount: 0 };
      }
      case "rightCheek": {
        const rc = zoneAnalysis.rightCheek;
        score = (rc.spots + rc.redness + (100 - rc.texture)) / 3;
        problemCount = Math.round((rc.spots + rc.redness) / 3);
        return { level: getHeatLevel(score), score: Math.round(100 - score), problemCount, wrinkleCount: 0 };
      }
      case "eyeArea": {
        const ea = zoneAnalysis.eyeArea;
        score = (ea.wrinkles + ea.darkCircles + (100 - ea.firmness)) / 3;
        problemCount = Math.round(ea.darkCircles / 5);
        wrinkleCount = Math.round(ea.wrinkles / 6);
        return { level: getHeatLevel(score), score: Math.round(100 - score), problemCount, wrinkleCount };
      }
      case "jawline": {
        const jl = zoneAnalysis.jawline;
        score = (jl.firmness + jl.contour) / 2;
        return { level: getHeatLevel(score, true), score: Math.round(score), problemCount: 0, wrinkleCount: 0 };
      }
      default:
        return { level: "normal", score: 50, problemCount: 0, wrinkleCount: 0 };
    }
  };

  // 获取区域描述
  const getZoneDescription = (zone: ZoneKey): string => {
    switch (zone) {
      case "forehead":
        return zoneAnalysis.forehead.condition || "肌肤纹理与油脂平衡";
      case "tZone":
        return zoneAnalysis.tZone.condition || "油脂分泌与毛孔状态";
      case "leftCheek":
        return zoneAnalysis.leftCheek.condition || "肤色均匀度与泛红";
      case "rightCheek":
        return zoneAnalysis.rightCheek.condition || "肤色均匀度与泛红";
      case "eyeArea":
        return zoneAnalysis.eyeArea.condition || "细纹与黑眼圈状态";
      case "jawline":
        return zoneAnalysis.jawline.condition || "轮廓紧致度";
      default:
        return "";
    }
  };

  // 图片尺寸（正方形，适合面部照片）
  const size = width;
  const cx = size / 2;
  const cy = size / 2;

  // 区域配置 - 相对于照片中心的位置和大小
  const zoneGeometry = useMemo(() => ({
    // 右脸颊 (用户自己的右边，照片中显示在左边)
    rightCheek: {
      cx: cx * 0.55,
      cy: cy * 1.05,
      rx: size * 0.22,
      ry: size * 0.25,
      path: `M ${cx * 0.35} ${cy * 0.75}
             Q ${cx * 0.25} ${cy * 1.0}, ${cx * 0.32} ${cy * 1.32}
             Q ${cx * 0.55} ${cy * 1.42}, ${cx * 0.78} ${cy * 1.25}
             Q ${cx * 0.82} ${cy * 1.0}, ${cx * 0.75} ${cy * 0.82}
             Q ${cx * 0.55} ${cy * 0.72}, ${cx * 0.35} ${cy * 0.75} Z`,
    },
    // 左脸颊 (用户自己的左边，照片中显示在右边)
    leftCheek: {
      cx: cx * 1.45,
      cy: cy * 1.05,
      rx: size * 0.22,
      ry: size * 0.25,
      path: `M ${cx * 1.65} ${cy * 0.75}
             Q ${cx * 1.75} ${cy * 1.0}, ${cx * 1.68} ${cy * 1.32}
             Q ${cx * 1.45} ${cy * 1.42}, ${cx * 1.22} ${cy * 1.25}
             Q ${cx * 1.18} ${cy * 1.0}, ${cx * 1.25} ${cy * 0.82}
             Q ${cx * 1.45} ${cy * 0.72}, ${cx * 1.65} ${cy * 0.75} Z`,
    },
    // 眼下区域（眼袋/黑眼圈位置）
    eyeArea: {
      cx: cx,
      cy: cy * 0.72,
      rx: size * 0.35,
      ry: size * 0.08,
      path: `M ${cx * 0.45} ${cy * 0.68}
             Q ${cx * 0.35} ${cy * 0.72}, ${cx * 0.42} ${cy * 0.82}
             Q ${cx * 0.65} ${cy * 0.88}, ${cx} ${cy * 0.85}
             Q ${cx * 1.35} ${cy * 0.88}, ${cx * 1.58} ${cy * 0.82}
             Q ${cx * 1.65} ${cy * 0.72}, ${cx * 1.55} ${cy * 0.68}
             Q ${cx * 1.3} ${cy * 0.62}, ${cx} ${cy * 0.62}
             Q ${cx * 0.7} ${cy * 0.62}, ${cx * 0.45} ${cy * 0.68} Z`,
    },
    // 额头
    forehead: {
      cx: cx,
      cy: cy * 0.35,
      rx: size * 0.32,
      ry: size * 0.15,
      path: `M ${cx * 0.4} ${cy * 0.45}
             Q ${cx * 0.35} ${cy * 0.25}, ${cx} ${cy * 0.18}
             Q ${cx * 1.65} ${cy * 0.25}, ${cx * 1.6} ${cy * 0.45}
             Q ${cx * 1.3} ${cy * 0.52}, ${cx} ${cy * 0.52}
             Q ${cx * 0.7} ${cy * 0.52}, ${cx * 0.4} ${cy * 0.45} Z`,
    },
    // T区
    tZone: {
      cx: cx,
      cy: cy * 0.7,
      rx: size * 0.1,
      ry: size * 0.25,
      path: `M ${cx * 0.88} ${cy * 0.5}
             L ${cx * 0.88} ${cy * 0.58}
             L ${cx * 0.92} ${cy * 0.95}
             Q ${cx * 0.9} ${cy * 1.05}, ${cx} ${cy * 1.08}
             Q ${cx * 1.1} ${cy * 1.05}, ${cx * 1.08} ${cy * 0.95}
             L ${cx * 1.12} ${cy * 0.58}
             L ${cx * 1.12} ${cy * 0.5}
             Q ${cx} ${cy * 0.45}, ${cx * 0.88} ${cy * 0.5} Z`,
    },
    // 下颌线
    jawline: {
      cx: cx,
      cy: cy * 1.55,
      rx: size * 0.35,
      ry: size * 0.12,
      path: `M ${cx * 0.35} ${cy * 1.4}
             Q ${cx * 0.3} ${cy * 1.55}, ${cx * 0.5} ${cy * 1.72}
             Q ${cx * 0.8} ${cy * 1.88}, ${cx} ${cy * 1.9}
             Q ${cx * 1.2} ${cy * 1.88}, ${cx * 1.5} ${cy * 1.72}
             Q ${cx * 1.7} ${cy * 1.55}, ${cx * 1.65} ${cy * 1.4}
             Q ${cx * 1.3} ${cy * 1.48}, ${cx} ${cy * 1.48}
             Q ${cx * 0.7} ${cy * 1.48}, ${cx * 0.35} ${cy * 1.4} Z`,
    },
  }), [cx, cy, size]);

  // 生成问题标记
  const zoneMarkers = useMemo(() => {
    const markers: Record<ZoneKey, { spots: Array<{ x: number; y: number; size: number }>; wrinkles: Array<{ x1: number; y1: number; x2: number; y2: number }> }> = {
      forehead: { spots: [], wrinkles: [] },
      eyeArea: { spots: [], wrinkles: [] },
      tZone: { spots: [], wrinkles: [] },
      leftCheek: { spots: [], wrinkles: [] },
      rightCheek: { spots: [], wrinkles: [] },
      jawline: { spots: [], wrinkles: [] },
    };

    (Object.keys(zoneGeometry) as ZoneKey[]).forEach((zone) => {
      const geo = zoneGeometry[zone];
      const data = getZoneData(zone);

      if (data.problemCount > 0) {
        markers[zone].spots = generateMarkers(geo.cx, geo.cy, geo.rx * 0.7, geo.ry * 0.7, data.problemCount, zone.charCodeAt(0) * 100);
      }
      if (data.wrinkleCount > 0) {
        markers[zone].wrinkles = generateWrinkleLines(geo.cx, geo.cy, geo.rx * 0.6, geo.ry * 0.6, data.wrinkleCount, zone.charCodeAt(0) * 200);
      }
    });

    return markers;
  }, [zoneGeometry, zoneAnalysis]);

  const zones: ZoneKey[] = ["rightCheek", "leftCheek", "eyeArea", "forehead", "tZone", "jawline"];

  // 如果没有用户图片，显示简化版本
  if (!userImage) {
    return (
      <div className="flex flex-col gap-3" style={{ width }}>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-brand-charcoal/60">暂无面部照片</p>
          <p className="mt-1 text-xs text-brand-charcoal/40">上传照片后可查看区域分析</p>
        </div>
        {/* 显示简单的列表 */}
        {zones.map((zone) => {
          const data = getZoneData(zone);
          const style = HEAT_STYLES[data.level];
          return (
            <div key={zone} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-3">
              <span className="text-sm text-brand-charcoal">{ZONE_CONFIG[zone].label}</span>
              <span className="text-sm font-medium" style={{ color: style.stroke }}>{data.score}分</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" style={{ width }}>
      {/* 照片容器 */}
      <div className="relative overflow-hidden rounded-2xl" style={{ width: size, height: size }}>
        {/* 用户照片 */}
        <img
          src={userImage}
          alt="面部照片"
          className="h-full w-full object-cover"
        />

        {/* SVG 叠加层 */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
        >
          {/* 区域轮廓和标记 */}
          {zones.map((zone, index) => {
            const geo = zoneGeometry[zone];
            const data = getZoneData(zone);
            const style = HEAT_STYLES[data.level];
            const isActive = activeZone === zone;
            const markers = zoneMarkers[zone];

            return (
              <g key={zone} style={{ pointerEvents: "auto" }}>
                {/* 区域轮廓 - 青色线条 */}
                <m.path
                  d={geo.path}
                  fill={isActive ? style.fill : "transparent"}
                  stroke="#22d3d4"
                  strokeWidth={isActive ? 2.5 : 2}
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.8, delay: index * 0.15 }}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveZone(zone)}
                  onMouseLeave={() => setActiveZone(null)}
                  onClick={() => setActiveZone(isActive ? null : zone)}
                />

                {/* 问题点标记 - 彩色小点 */}
                {markers.spots.map((spot, i) => (
                  <m.circle
                    key={`spot-${i}`}
                    cx={spot.x}
                    cy={spot.y}
                    r={spot.size}
                    fill={style.markerColor}
                    opacity={0.85}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.8 + index * 0.1 + i * 0.02 }}
                  />
                ))}

                {/* 细纹标记 - 短线条 */}
                {markers.wrinkles.map((line, i) => (
                  <m.line
                    key={`wrinkle-${i}`}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    opacity={0.8}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.9 + index * 0.1 + i * 0.03 }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 区域详情卡片 */}
      <AnimatePresence mode="wait">
        {activeZone ? (
          <m.div
            key="detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
            className="mt-4 w-full rounded-xl border border-cyan-200 bg-white p-4 shadow-md"
          >
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
              <span className="font-medium text-brand-charcoal">
                {ZONE_CONFIG[activeZone].label}
              </span>
              <span
                className="ml-auto text-sm font-semibold"
                style={{ color: HEAT_STYLES[getZoneData(activeZone).level].markerColor }}
              >
                {getZoneData(activeZone).score}分 · {HEAT_LABELS[getZoneData(activeZone).level]}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-brand-charcoal/70">
              {getZoneDescription(activeZone)}
            </p>
          </m.div>
        ) : (
          <m.div
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-center text-xs text-brand-charcoal/50"
          >
            点击区域查看详细分析
          </m.div>
        )}
      </AnimatePresence>

      {/* 图例 */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
          <span className="text-brand-charcoal/60">区域轮廓</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-brand-charcoal/60">问题点</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-3 rounded bg-emerald-500" />
          <span className="text-brand-charcoal/60">细纹</span>
        </div>
      </div>
    </div>
  );
}
