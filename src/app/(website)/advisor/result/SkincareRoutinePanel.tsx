"use client";

import { useState, useMemo } from "react";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles, Clock, Droplet, MapPin } from "lucide-react";
import {
  type RoutineLevel,
  type RoutineScenario,
  type SkincareRoutine,
  LEVEL_LABELS,
  SCENARIO_LABELS,
  CLIMATE_LABELS,
  generateSkincareRoutines,
  getClimateByRegion,
  adjustClimateForSeason,
} from "@/lib/skincare-dosage";

// 自定义图标组件
const ICON_COLOR = "#C3BC9F";

const SunIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 18.5C15.5898 18.5 18.5 15.5898 18.5 12C18.5 8.41015 15.5898 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5898 8.41015 18.5 12 18.5Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 3C12.6904 3 13.25 2.44036 13.25 1.75C13.25 1.05964 12.6904 0.5 12 0.5C11.3097 0.5 10.75 1.05964 10.75 1.75C10.75 2.44036 11.3097 3 12 3Z" fill={ICON_COLOR} />
    <path d="M19.25 6C19.9404 6 20.5 5.44035 20.5 4.75C20.5 4.05964 19.9404 3.5 19.25 3.5C18.5597 3.5 18 4.05964 18 4.75C18 5.44035 18.5597 6 19.25 6Z" fill={ICON_COLOR} />
    <path d="M22.25 13.25C22.9404 13.25 23.5 12.6904 23.5 12C23.5 11.3097 22.9404 10.75 22.25 10.75C21.5597 10.75 21 11.3097 21 12C21 12.6904 21.5597 13.25 22.25 13.25Z" fill={ICON_COLOR} />
    <path d="M19.25 20.5C19.9404 20.5 20.5 19.9404 20.5 19.25C20.5 18.5597 19.9404 18 19.25 18C18.5597 18 18 18.5597 18 19.25C18 19.9404 18.5597 20.5 19.25 20.5Z" fill={ICON_COLOR} />
    <path d="M12 23.5C12.6904 23.5 13.25 22.9404 13.25 22.25C13.25 21.5597 12.6904 21 12 21C11.3097 21 10.75 21.5597 10.75 22.25C10.75 22.9404 11.3097 23.5 12 23.5Z" fill={ICON_COLOR} />
    <path d="M4.75 20.5C5.44035 20.5 6 19.9404 6 19.25C6 18.5597 5.44035 18 4.75 18C4.05964 18 3.5 18.5597 3.5 19.25C3.5 19.9404 4.05964 20.5 4.75 20.5Z" fill={ICON_COLOR} />
    <path d="M1.75 13.25C2.44036 13.25 3 12.6904 3 12C3 11.3097 2.44036 10.75 1.75 10.75C1.05964 10.75 0.5 11.3097 0.5 12C0.5 12.6904 1.05964 13.25 1.75 13.25Z" fill={ICON_COLOR} />
    <path d="M4.75 6C5.44035 6 6 5.44035 6 4.75C6 4.05964 5.44035 3.5 4.75 3.5C4.05964 3.5 3.5 4.05964 3.5 4.75C3.5 5.44035 4.05964 6 4.75 6Z" fill={ICON_COLOR} />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M13.8237 3.18488C11.3623 3.82663 9.54547 6.06477 9.54547 8.72728C9.54547 11.8904 12.1096 14.4545 15.2727 14.4545C17.9352 14.4545 20.1734 12.6377 20.8151 10.1763C20.9363 10.7652 21 11.3752 21 12C21 16.9706 16.9706 21 12 21C7.02943 21 3 16.9706 3 12C3 7.02943 7.02943 3 12 3C12.6248 3 13.2348 3.06367 13.8237 3.18488Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.44" strokeLinejoin="round" />
  </svg>
);

const HomeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9 21V14H15V21" stroke="#EBE8DB" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const TravelIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M21 16V14L13 9V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9L2 14V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="0.5" />
  </svg>
);

interface SkincareRoutinePanelProps {
  skinType: string;
  province?: string;
  city?: string;
}

export function SkincareRoutinePanel({ skinType, province, city }: SkincareRoutinePanelProps) {
  const [selectedLevel, setSelectedLevel] = useState<RoutineLevel>("daily");
  const [selectedScenario, setSelectedScenario] = useState<RoutineScenario>("morning");

  // 检查是否有有效位置
  const hasValidLocation = !!province;

  // 计算气候类型
  const climate = useMemo(() => {
    const baseClimate = getClimateByRegion(province, city);
    return adjustClimateForSeason(baseClimate);
  }, [province, city]);

  // 生成所有护肤方案
  const routines = useMemo(() => {
    return generateSkincareRoutines(skinType, climate);
  }, [skinType, climate]);

  // 当前选中的方案
  const currentRoutine: SkincareRoutine = routines[selectedLevel][selectedScenario];

  const scenarioIcons: Record<RoutineScenario, React.ReactNode> = {
    morning: <SunIcon className="h-6 w-6 sm:h-7 sm:w-7" />,
    evening: <MoonIcon className="h-6 w-6 sm:h-7 sm:w-7" />,
    home: <HomeIcon className="h-6 w-6 sm:h-7 sm:w-7" />,
    travel: <TravelIcon className="h-6 w-6 sm:h-7 sm:w-7" />,
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/95 shadow-card backdrop-blur-sm">
      {/* 标题区域 */}
      <div className="border-b border-brand-beige/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base font-light tracking-wide text-brand-charcoal">
              专属护肤方案
            </h3>
            <p className="mt-0.5 text-xs text-brand-charcoal/50">
              根据您的肤质与所在地气候定制
            </p>
          </div>

          {/* 气候/位置标签 - 仅在有位置时显示 */}
          {hasValidLocation && (
            <div className="flex items-center gap-1.5 rounded-full bg-brand-champagne/40 px-3 py-1">
              <MapPin className="h-3.5 w-3.5 text-brand-charcoal/50" />
              <span className="text-[11px] text-brand-charcoal/60">
                {province}{city && city !== province ? ` · ${city}` : ""} · {CLIMATE_LABELS[climate]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 方案级别选择 - Tab式切换 */}
      <div className="flex border-b border-brand-beige/20">
        {(Object.keys(LEVEL_LABELS) as RoutineLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`relative flex-1 py-3 text-center text-sm transition-all ${selectedLevel === level
              ? "text-brand-charcoal"
              : "text-brand-charcoal/40 hover:text-brand-charcoal/60"
              }`}
          >
            <span className="font-medium">{LEVEL_LABELS[level].name}</span>
            <span className="ml-1 text-[10px] uppercase tracking-wider opacity-60">
              {LEVEL_LABELS[level].nameEn}
            </span>
            {selectedLevel === level && (
              <m.div
                layoutId="level-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold"
              />
            )}
          </button>
        ))}
      </div>

      {/* 场景选择 */}
      <div className="grid grid-cols-4 gap-1 p-3">
        {(Object.keys(SCENARIO_LABELS) as RoutineScenario[]).map((scenario) => (
          <button
            key={scenario}
            onClick={() => setSelectedScenario(scenario)}
            className={`group flex flex-col items-center gap-2 rounded-xl py-3 transition-all ${selectedScenario === scenario
              ? "bg-brand-champagne/50"
              : "hover:bg-brand-champagne/20"
              }`}
          >
            <div className={`transition-transform ${selectedScenario === scenario ? "scale-110" : ""}`}>
              {scenarioIcons[scenario]}
            </div>
            <span className={`text-[11px] ${selectedScenario === scenario ? "font-medium text-brand-charcoal" : "text-brand-charcoal/50"
              }`}>
              {SCENARIO_LABELS[scenario].name}
            </span>
          </button>
        ))}
      </div>

      {/* 护肤步骤详情 */}
      <AnimatePresence mode="wait">
        <m.div
          key={`${selectedLevel}-${selectedScenario}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="px-4 pb-4"
        >
          {/* 方案概览 */}
          <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-champagne/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-charcoal/50" />
              <span className="text-xs text-brand-charcoal/70">预计用时 {currentRoutine.totalDuration}</span>
            </div>
            <span className="text-[10px] text-brand-charcoal/40">{LEVEL_LABELS[selectedLevel].desc}</span>
          </div>

          {/* 步骤列表 */}
          <div className="space-y-2">
            {currentRoutine.steps.map((step, index) => (
              <div
                key={step.order}
                className="group rounded-xl border border-brand-beige/30 bg-brand-champagne/10 p-3 transition-all hover:border-brand-beige/50 hover:bg-brand-champagne/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold/20 text-xs font-medium text-brand-charcoal">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-brand-charcoal">{step.name}</span>
                        <span className="text-[10px] uppercase tracking-wider text-brand-charcoal/40">{step.nameEn}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-brand-charcoal/50">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-brand-charcoal/40">{step.duration}</span>
                    {step.frequency && (
                      <p className="mt-0.5 text-[10px] text-brand-gold">{step.frequency}</p>
                    )}
                  </div>
                </div>

                {/* 用量推荐 */}
                {step.dosage && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                    <Droplet className="h-3.5 w-3.5 text-brand-gold" />
                    <span className="text-[11px] text-brand-charcoal/70">
                      <span className="font-medium text-brand-charcoal">{step.dosage.productName}</span>
                      <span className="mx-1.5 text-brand-beige">|</span>
                      {step.dosage.description}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 小贴士 */}
          {currentRoutine.tips && currentRoutine.tips.length > 0 && (
            <div className="mt-4 rounded-xl bg-gradient-to-r from-brand-gold/10 to-brand-champagne/30 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
                <span className="text-xs font-medium text-brand-charcoal">护肤小贴士</span>
              </div>
              <ul className="space-y-1">
                {currentRoutine.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-brand-charcoal/60">
                    <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand-gold/50" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 查看产品链接 */}
          <Link
            href="/products"
            className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand-charcoal py-3 text-sm font-medium text-brand-linen transition-all hover:bg-brand-charcoal/90 active:scale-[0.98]"
          >
            <span>查看推荐产品</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </m.div>
      </AnimatePresence>
    </div>
  );
}

