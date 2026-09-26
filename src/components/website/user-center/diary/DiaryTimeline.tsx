"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Angry,
  ChevronRight,
  Frown,
  Laugh,
  Loader2,
  Meh,
  Pencil,
  Smile,
  Trash2,
} from "lucide-react";
import type { HistorySession } from "@/components/website/user-center/diary/TestHistoryList";
import { deferInEffect } from "@/hooks/deferInEffect";
import { localDateStr } from "@/lib/local-date";
import { isAutoDiaryEntry, isDiaryDateInRange, parseClientDate } from "@/lib/diary-utils";

const ADVISOR_URL = (process.env.NEXT_PUBLIC_ADVISOR_URL || "https://advisor.nihplod.cn").replace(/\/+$/, "");

/**
 * DiaryTimeline — 护肤历程时间线（PRD v1.5）
 * 合并两类事件按日分组倒序：日记打卡 + 测肤里程碑；
 * 空日期不渲染，今天置顶，默认只展开最近有记录的三天 + "加载更早"。
 * 同日既有测肤又有其自动生成的日记条目时，隐藏自动日记卡避免重复展示。
 */

export interface DiaryEntry {
  id: string;
  date: string; // ISO，UTC 零点，表示客户端本地日历日
  skinState: string;
  tags?: string[] | null;
  note?: string | null;
  /** 测肤自动生成条目的来源会话（可跳转对应报告）；手动打卡为空 */
  sessionId?: string | null;
}

export const STATE_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  great: { label: "很好", color: "#4C8055", icon: Laugh },
  good: { label: "不错", color: "#7A9A5B", icon: Smile },
  normal: { label: "一般", color: "#F59E0B", icon: Meh },
  bad: { label: "较差", color: "#D97706", icon: Frown },
  terrible: { label: "很差", color: "#EF4444", icon: Angry },
};

const RECENT_GROUPS = 3;

type TimelineEvent =
  | { kind: "diary"; entry: DiaryEntry }
  | { kind: "test"; test: HistorySession };

interface DayGroup {
  dateStr: string;
  events: TimelineEvent[];
}

interface DiaryTimelineProps {
  entries: DiaryEntry[];
  tests: HistorySession[];
  loading: boolean;
  /** "今天"快照（YYYY-MM-DD，父级在弹层打开时刷新），避免渲染期调用 new Date() */
  todayStr: string;
  /** 打开打卡弹层：existing 为 null 新建（dateStr 目标日期），非 null 编辑该日记录 */
  onCheckIn?: (existing: DiaryEntry | null, dateStr: string) => void;
  /** 删除指定日记条目（时间线卡片删除入口） */
  onDeleteEntry?: (entry: DiaryEntry) => void;
  /** 正在删除的条目 id（禁用态/加载提示） */
  deletingId?: string | null;
  /** 服务端还有更早的测肤记录未拉取（分页未拉完） */
  hasMoreTests?: boolean;
  /** 正在分页拉取更早的测肤记录 */
  testsLoadingMore?: boolean;
  /** 请求加载更早的测肤记录（追加到 tests） */
  onLoadMoreTests?: () => void;
  /** 服务端还有更早的日记记录未拉取（分页未拉完） */
  hasMoreEntries?: boolean;
  /** 正在分页拉取更早的日记记录 */
  entriesLoadingMore?: boolean;
  /** 请求加载更早的日记记录（追加到 entries） */
  onLoadMoreEntries?: () => void;
  /** 日记列表刷新（如打卡保存）后自增，用于收起"近 30 天"折叠态 */
  refreshKey?: number;
}

export function DiaryTimeline({
  entries,
  tests,
  loading,
  todayStr,
  onCheckIn,
  onDeleteEntry,
  deletingId,
  hasMoreTests = false,
  testsLoadingMore = false,
  onLoadMoreTests,
  hasMoreEntries = false,
  entriesLoadingMore = false,
  onLoadMoreEntries,
  refreshKey,
}: DiaryTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 打卡保存/刷新日记后回到"近 30 天"折叠态；
  // 追加分页（entries 尾部新增）不重置展开态
  useEffect(() => {
    deferInEffect(() => setShowAll(false));
  }, [refreshKey]);

  // 删除确认 3s 未操作自动复原，避免误触后一直停留在确认态
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, TimelineEvent[]>();
    for (const entry of entries) {
      const day = entry.date.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), { kind: "diary", entry }]);
    }
    for (const test of tests) {
      const day = localDateStr(new Date(test.completedAt));
      byDay.set(day, [...(byDay.get(day) ?? []), { kind: "test", test }]);
    }
    // 今天永远置顶（即使无事件，用于"今天还没记录"引导态）
    if (!byDay.has(todayStr)) byDay.set(todayStr, []);
    return Array.from(byDay.entries())
      .map(([dateStr, events]) => ({ dateStr, events }))
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [entries, tests, todayStr]);

  // 默认只展开「最近有记录的三天」（今天组恒显示——无论是否有事件），其余收起由"加载更早"展开
  const visibleGroups = showAll
    ? groups
    : groups
        .filter((g) => g.dateStr === todayStr || g.events.length > 0)
        .slice(0, RECENT_GROUPS);
  const hiddenCount = groups.length - visibleGroups.length;
  const hasAnyEvent = entries.length > 0 || tests.length > 0;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 pt-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="w-7 shrink-0">
              <div className="h-5 w-5 mx-auto rounded-md bg-brand-charcoal/[0.08]" />
            </div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-2/5 rounded-full bg-brand-charcoal/[0.06]" />
              <div className="h-3 w-4/5 rounded-full bg-brand-charcoal/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const dayOf = (dateStr: string) => String(parseInt(dateStr.slice(8, 10), 10));
  const monthLabelOf = (dateStr: string) =>
    `${dateStr.slice(0, 4)} 年 ${parseInt(dateStr.slice(5, 7), 10)} 月`;
  const canBackfill = (dateStr: string) => {
    const d = parseClientDate(dateStr);
    const today = parseClientDate(todayStr);
    return !!d && !!today && isDiaryDateInRange(d, today);
  };

  return (
    <div>
      {!hasAnyEvent && (
        /* 空态引导：无框居中（与左列"解锁引导"同一种样式语言，全站弹层一致） */
        <div className="py-10 text-center mb-6">
          <p className="text-[13px] text-brand-charcoal/70 font-light leading-[1.8] tracking-[0.06em] mb-4">
            完成一次测肤后，这里会自动生成你的护肤记录
          </p>
          <div className="flex items-center justify-center gap-3">
            {onCheckIn && (
              <button
                type="button"
                onClick={() => onCheckIn(null, todayStr)}
                className="inline-flex items-center justify-center px-5 h-9 rounded-full bg-brand-primary text-white text-[12px] tracking-[0.08em] font-medium transition-colors hover:bg-brand-primary-dark cursor-pointer"
              >
                今日打卡
              </button>
            )}
            <Link
              href={`${ADVISOR_URL}/?start=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-9 px-4 rounded-full border border-brand-charcoal/20 text-brand-charcoal/60 text-[12px] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal"
            >
              去测肤 →
            </Link>
          </div>
        </div>
      )}

      {hasAnyEvent && visibleGroups.map((group, gi) => {
        const isToday = group.dateStr === todayStr;
        const month = group.dateStr.slice(0, 7);
        const hasTest = group.events.some((e) => e.kind === "test");
        // 同日既有测肤又有其自动生成的日记条目时，隐藏自动日记卡，避免同一次测肤重复展示；
        // 当日无测肤事件时自动日记卡正常展示（如历史认领补建的条目）
        const visibleEvents = group.events.filter(
          (e) => e.kind === "test" || !isAutoDiaryEntry(e.entry) || !hasTest
        );
        // 当日的日记条目（含被隐藏的自动条目）：补打卡/打卡入口据此决定是新建还是接管编辑
        const dayDiaryEntry =
          group.events.flatMap((e) => (e.kind === "diary" ? [e.entry] : []))[0] ?? null;
        // 仅"手动打卡"算已记录：测肤自动生成的条目对用户不算打卡（时间线上也与测肤事件去重隐藏），
        // 未手动打卡时入口应显示"记录/补打卡"，点击以新建打卡覆盖自动条目
        const manualDiaryEntry =
          dayDiaryEntry && !isAutoDiaryEntry(dayDiaryEntry) ? dayDiaryEntry : null;
        // 当日测肤最高分（用于手动打卡卡片的同日对照提示）
        const dayScores = group.events
          .flatMap((e) => (e.kind === "test" ? [e.test] : []))
          .map((t) => t.analysisResult?.faceAnalysis?.overallScore)
          .filter((s): s is number => typeof s === "number" && s > 0);
        const maxDayScore = dayScores.length > 0 ? Math.max(...dayScores) : null;
        // 跨月时插入月份分隔行（纯函数判定，不依赖渲染期可变状态）
        const monthDivider =
          gi === 0 || visibleGroups[gi - 1].dateStr.slice(0, 7) !== month
            ? monthLabelOf(group.dateStr)
            : null;

        return (
          <div key={group.dateStr}>
            {monthDivider && (
              <div className="mb-4 mt-3 first:mt-0">
                <span className="text-[12px] tracking-[0.2em] text-brand-charcoal/55">
                  {monthDivider}
                </span>
              </div>
            )}
            <div className="flex gap-3 md:gap-4">
              {/* 左轴：日号（极简，无星期）；今天以「今日」字面标注 */}
              <div className="w-10 shrink-0 pt-0.5 text-center">
                <div className={`text-base font-serif leading-tight ${isToday ? "text-brand-charcoal font-medium" : "text-brand-charcoal/75"}`}>
                  {isToday ? "今日" : `${dayOf(group.dateStr)}日`}
                </div>
              </div>

              {/* 右侧事件列：细竖线串联，事件直接平铺（无卡片） */}
              <div className="relative flex-1 border-l border-stone-200/60 pl-5 pb-6 space-y-4">
                {/* 今日打卡引导：今天没有任何事件时展示完整引导盒；有测肤等事件但无日记时补一条打卡入口 */}
                {isToday && !visibleEvents.some((e) => e.kind === "diary") && (
                  visibleEvents.length === 0 ? (
                    <div className="relative">
                      <span className="absolute -left-[22px] top-1 w-2 h-2 rounded-full border-2 border-dashed border-brand-charcoal/25 bg-[#F7F4EE]" />
                      <div className="flex items-center gap-3">
                        <span className="flex-1 text-[13px] text-brand-charcoal/60 font-light">
                          今天还没有记录
                        </span>
                        {onCheckIn && (
                          <button
                            type="button"
                            onClick={() => onCheckIn(null, todayStr)}
                            className="shrink-0 min-h-9 px-3.5 rounded-full border border-brand-charcoal/20 text-brand-charcoal/70 text-[12px] font-light tracking-[0.05em] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal cursor-pointer"
                          >
                            今日打卡
                          </button>
                        )}
                        <Link
                          href={`${ADVISOR_URL}/?start=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 min-h-9 inline-flex items-center px-3.5 rounded-full border border-brand-charcoal/20 text-brand-charcoal/70 text-[12px] font-light tracking-[0.05em] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal"
                        >
                          去测肤 →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    onCheckIn && (
                      <div className="relative">
                        <span className="absolute -left-[22px] top-1 w-2 h-2 rounded-full border-2 border-dashed border-brand-charcoal/25 bg-[#F7F4EE]" />
                        <button
                          type="button"
                          onClick={() => onCheckIn(manualDiaryEntry, todayStr)}
                          className="inline-flex items-center min-h-9 px-3.5 rounded-full border border-brand-charcoal/20 text-brand-charcoal/70 text-[12px] font-light tracking-[0.05em] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal cursor-pointer"
                        >
                          {manualDiaryEntry ? "编辑今日记录 →" : "今日打卡"}
                        </button>
                      </div>
                    )
                  )
                )}

                {/* 补打卡：过去的空日期（写入窗口内）提供补录入口，错过不再永久断档。
                    当日已有被隐藏的测肤自动条目时改为编辑入口，避免 upsert 静默覆盖 */}
                {!isToday &&
                  !visibleEvents.some((e) => e.kind === "diary") &&
                  onCheckIn &&
                  canBackfill(group.dateStr) && (
                    <div className="relative">
                      <span className="absolute -left-[22px] top-1 w-2 h-2 rounded-full border-2 border-dashed border-brand-charcoal/25 bg-[#F7F4EE]" />
                      <button
                        type="button"
                        onClick={() => onCheckIn(manualDiaryEntry, group.dateStr)}
                        className="text-left text-[12px] text-brand-charcoal/55 font-light hover:text-brand-charcoal transition-colors cursor-pointer"
                      >
                        {manualDiaryEntry ? "编辑记录 →" : "补打卡 →"}
                      </button>
                    </div>
                  )}

                {visibleEvents.map((ev, i) => {
                  if (ev.kind === "diary") {
                    const meta = STATE_META[ev.entry.skinState] ?? STATE_META.normal;
                    const Icon = meta.icon;
                    const auto = isAutoDiaryEntry(ev.entry);
                    // 测肤自动条目带会话 id 时可跳转对应报告（同日已显示测肤里程碑时本卡会被隐藏，互不冲突）
                    const autoReportUrl = auto && ev.entry.sessionId ? `${ADVISOR_URL}/reports/${ev.entry.sessionId}?skipCover=1` : null;
                    return (
                      <div key={`d-${ev.entry.id}-${i}`} className="relative group">
                        <span
                          className="absolute -left-[22px] top-1 w-2 h-2 rounded-full border-2 border-[#F7F4EE]"
                          style={{ backgroundColor: meta.color }}
                        />
                        {/* 操作按钮：移动端常显（无 hover 可依赖），桌面端悬浮行尾显现；行内不占位（极简）。
                            编辑限写入窗口内（补录语义）；删除不受窗口限制（含历史数据，隐私诉求），与 DELETE 接口口径一致 */}
                        <div className="absolute right-0 -top-0.5 flex items-center gap-0.5 lg:hidden lg:group-hover:flex">
                          {onCheckIn && (isToday || canBackfill(group.dateStr)) && (
                            <button
                              type="button"
                              onClick={() => onCheckIn(ev.entry, group.dateStr)}
                              aria-label={isToday ? "编辑今日记录" : "编辑记录"}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-brand-charcoal/55 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.05] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                          {onDeleteEntry && (confirmDeleteId === ev.entry.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingId === ev.entry.id}
                                onClick={() => onDeleteEntry(ev.entry)}
                                className="h-8 px-3 flex items-center rounded-full bg-red-50 text-red-500 text-[11px] font-light tracking-[0.05em] disabled:opacity-50 cursor-pointer"
                              >
                                确认删除
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="h-8 px-3 flex items-center rounded-full text-brand-charcoal/65 text-[11px] font-light hover:bg-brand-charcoal/[0.05] cursor-pointer"
                              >
                                取消
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ev.entry.id)}
                              aria-label="删除记录"
                              className="w-8 h-8 flex items-center justify-center rounded-full text-brand-charcoal/65 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                            </button>
                          ))}
                        </div>

                        {/* 事件内容：平铺直叙，无卡片边框与底色 */}
                        {autoReportUrl ? (
                          <Link href={autoReportUrl} target="_blank" rel="noopener noreferrer" className="block pr-16">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: meta.color }}>
                                <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                                {meta.label}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-brand-charcoal/55 group-hover:text-brand-charcoal transition-colors">
                                查看报告
                                <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </div>
                            {ev.entry.note && (
                              <p className="mt-1 text-[13px] text-stone-800/75 font-light leading-[1.8] tracking-[0.06em]">
                                {ev.entry.note}
                              </p>
                            )}
                          </Link>
                        ) : (
                          <div className="pr-16">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: meta.color }}>
                                <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                                {meta.label}
                              </span>
                              {ev.entry.tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[11px] text-brand-charcoal/60"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            {ev.entry.note && (
                              <p className="mt-1 text-[13px] text-stone-800/75 font-light leading-[1.8] tracking-[0.06em]">
                                {ev.entry.note}
                              </p>
                            )}
                            {/* 同日冲突提示：手动打卡与测肤评分同屏时，补一句客观评分帮助对照 */}
                            {!auto && maxDayScore != null && (
                              <p className="mt-1 text-[11px] text-brand-charcoal/55 font-light">
                                同日测肤 {maxDayScore} 分
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 测肤里程碑：同样去卡片化，实心圆点 + 单行文本链接
                  const result = ev.test.analysisResult;
                  const score = result?.faceAnalysis?.overallScore;
                  const skinType = result?.skinProfile?.typeLabel || result?.skinType?.typeLabel;
                  return (
                    <div key={`t-${ev.test.sessionId}-${i}`} className="relative">
                      <span className="absolute -left-[22px] top-1 w-2 h-2 rounded-full border-2 border-[#F7F4EE] bg-brand-primary" />
                      <Link
                        href={`${ADVISOR_URL}/reports/${ev.test.sessionId}?skipCover=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2 pr-4"
                      >
                        <span className="text-[12px] font-medium text-brand-charcoal">完成测肤</span>
                        {skinType && (
                          <span className="text-[12px] text-brand-charcoal/65 font-light truncate">{skinType}</span>
                        )}
                        {score != null && score > 0 && (
                          <span className="text-[12px] text-brand-charcoal/60 font-light shrink-0">{score} 分</span>
                        )}
                        <ChevronRight className="w-3 h-3 shrink-0 text-brand-charcoal/55 group-hover:text-brand-charcoal/60 group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {(hiddenCount > 0 || hasMoreTests || hasMoreEntries) && (
        <button
          type="button"
          onClick={() => {
            if (hiddenCount > 0 || hasMoreTests || hasMoreEntries) setShowAll(true);
            onLoadMoreTests?.();
            onLoadMoreEntries?.();
          }}
          disabled={testsLoadingMore || entriesLoadingMore}
          className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-full border border-stone-200/60 text-[12px] text-brand-charcoal/60 font-light tracking-[0.08em] hover:border-brand-charcoal/40 hover:text-brand-charcoal transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
        >
          {(testsLoadingMore || entriesLoadingMore) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {hiddenCount > 0 ? `加载更早的记录（还有 ${hiddenCount} 天）` : "加载更早的记录"}
        </button>
      )}
    </div>
  );
}
