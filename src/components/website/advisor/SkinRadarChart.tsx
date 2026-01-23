"use client";

import { useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SkinDimensions, SkinDimensionKey } from "@/lib/advisor-utils";
import { DIMENSION_LABELS } from "@/lib/advisor-utils";

interface SkinRadarChartProps {
  /** 8 维度评分数据 */
  dimensions: SkinDimensions;
  /** 图表大小 */
  size?: number;
  /** 是否显示标签 */
  showLabels?: boolean;
  /** 是否显示动画 */
  animated?: boolean;
}

/** 8 个维度的顺序 */
const DIMENSION_ORDER: SkinDimensionKey[] = [
  "spots", "wrinkles", "texture", "pores",
  "uvDamage", "brownSpots", "redAreas", "acneRisk"
];

/** 获取分数对应的颜色 */
function getScoreColor(score: number): string {
  if (score >= 80) return "#16a34a"; // 优秀 - 绿色
  if (score >= 60) return "#C9A86C"; // 良好 - 品牌金
  if (score >= 40) return "#ca8a04"; // 一般 - 黄色
  return "#ea580c"; // 需关注 - 橙色
}

/** 自定义标签组件 */
function CustomLabel(props: {
  payload?: { value: string };
  x?: string | number;
  y?: string | number;
  cx?: string | number;
  cy?: string | number;
  index?: number;
  chartData: { score: number; dimension: string; fullMark: number }[];
  activeIndex: number | null;
}) {
  const { payload, index = 0, chartData, activeIndex } = props;
  const x = Number(props.x) || 0;
  const y = Number(props.y) || 0;
  const cx = Number(props.cx) || 0;
  const cy = Number(props.cy) || 0;
  const data = chartData[index];
  const dimension = payload?.value || data?.dimension || "";
  const score = data?.score ?? 0;
  const scoreColor = getScoreColor(score);
  const isActive = activeIndex === index;

  // 计算标签偏移方向（远离圆心）
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offsetDistance = 18;
  const offsetX = distance > 0 ? (dx / distance) * offsetDistance : 0;
  const offsetY = distance > 0 ? (dy / distance) * offsetDistance : -offsetDistance;

  const labelX = x + offsetX;
  const labelY = y + offsetY;

  return (
    <g
      className="transition-all duration-200"
      style={{
        transformOrigin: `${labelX}px ${labelY}px`,
        opacity: isActive ? 1 : 0.7,
        transform: isActive ? "scale(1.1)" : "scale(1)",
      }}
    >
      {/* 激活时的背景 */}
      {isActive && (
        <rect
          x={labelX - 26}
          y={labelY - 18}
          width={52}
          height={36}
          rx={8}
          className="fill-brand-gold/15"
        />
      )}
      {/* 维度名称 */}
      <text
        x={labelX}
        y={labelY - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-[11px] font-medium transition-all duration-200"
        style={{
          fill: isActive ? "#1a1a1a" : "#4a4a4a",
          fontWeight: isActive ? 600 : 500,
        }}
      >
        {dimension}
      </text>
      {/* 分数 */}
      <text
        x={labelX}
        y={labelY + 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={scoreColor}
        className="text-[10px] transition-all duration-200"
        style={{
          fontWeight: isActive ? 700 : 600,
        }}
      >
        {score}
      </text>
    </g>
  );
}



/**
 * VISIA 风格 8 维度雷达图组件 - 基于 Recharts
 * 高奢金色调、优雅动画、数据点与标签联动
 */
export function SkinRadarChart({
  dimensions,
  size = 300,
  showLabels = true,
  animated = true,
}: SkinRadarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // 转换数据格式
  const chartData = DIMENSION_ORDER.map(key => ({
    dimension: DIMENSION_LABELS[key],
    score: dimensions[key]?.score ?? 50,
    fullMark: 100,
  }));

  // 处理鼠标移动事件
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = (state: Record<string, any>) => {
    if (state && typeof state.activeTooltipIndex === "number") {
      setActiveIndex(state.activeTooltipIndex);
    }
  };

  return (
    <div className="relative aspect-square w-full" style={{ maxWidth: size, maxHeight: size, minWidth: 200, minHeight: 200 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius="65%"
          data={chartData}
          margin={{ top: 30, right: 30, bottom: 30, left: 30 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* 渐变定义 */}
          <defs>
            <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C9A86C" stopOpacity={0.4} />
              <stop offset="50%" stopColor="#D4B77A" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#B8975B" stopOpacity={0.4} />
            </linearGradient>
            <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 极坐标网格 - 圆形样式 */}
          <PolarGrid
            gridType="circle"
            stroke="#E8E2D9"
            strokeWidth={0.5}
            strokeDasharray="3 3"
            radialLines={false}
          />

          {/* 角度轴 - 维度标签 */}
          <PolarAngleAxis
            dataKey="dimension"
            tick={showLabels ? (props) => (
              <CustomLabel {...props} chartData={chartData} activeIndex={activeIndex} />
            ) : false}
            tickLine={false}
            axisLine={{ stroke: "#E8E2D9", strokeWidth: 0.5 }}
          />

          {/* 半径轴 - 隐藏 */}
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />

          {/* 隐藏的 Tooltip 用于触发 activeIndex */}
          <Tooltip
            content={() => null}
            cursor={false}
          />

          {/* 数据区域 */}
          <Radar
            name="肌肤分数"
            dataKey="score"
            stroke="#C9A86C"
            strokeWidth={1.5}
            fill="url(#radarGradient)"
            fillOpacity={1}
            dot={{
              r: 3,
              fill: "#C9A86C",
              stroke: "#fff",
              strokeWidth: 1.5,
            }}
            activeDot={{
              r: 6,
              fill: "#C9A86C",
              stroke: "#fff",
              strokeWidth: 2,
              filter: "drop-shadow(0 0 4px rgba(201, 168, 108, 0.6))",
            }}
            isAnimationActive={animated}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

