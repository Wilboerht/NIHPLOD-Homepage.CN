"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, ScanFace } from "lucide-react";
import { deferInEffect } from "@/hooks/deferInEffect";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

const ADVISOR_URL = (process.env.NEXT_PUBLIC_ADVISOR_URL || "https://advisor.nihplod.cn").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8000;

/**
 * TestHistoryList — 测肤记录列表（含数据拉取与分页）
 * 使用方：账户弹层「护肤档案」面板（DiaryPanel）的测肤记录视图
 * 数据源：/api/user/skincare-tests（分页、排除冷层归档）
 * 条目为一行紧凑式：日期 · 肤质 · 分数，点击进入报告详情
 */

export interface HistoryAnalysisResult {
  faceAnalysis?: { overallScore?: number; skinAge?: number };
  skinProfile?: { type?: string; typeLabel?: string; concerns?: string[]; skinAge?: number };
  skinType?: { typeLabel?: string };
  concerns?: string[];
}

export interface HistorySession {
  sessionId: string;
  completedAt: string;
  analysisResult?: HistoryAnalysisResult;
}

interface TestHistoryListProps {
  /** 传入时显示内置标题栏（标题 + 共 N 条）；模态框场景可不传（模态框自带标题） */
  title?: string;
  pageSize?: number;
  /** 提供非空首屏数据时跳过初始拉取（需与 pageSize 对齐），避免重复请求同一接口 */
  initialSessions?: HistorySession[];
  /** 首屏数据对应的服务端总条数（配合 initialSessions 使用） */
  initialTotal?: number;
  /** 初始页码（配合父级保留翻页位置） */
  initialPage?: number;
  /** 翻页回调（父级保存当前位置，重新进入时恢复） */
  onPageChange?: (page: number) => void;
  /** 每次数据加载完成后回调 */
  onDataChange?: (sessions: HistorySession[], total: number) => void;
}

function formatDay(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function TestHistoryList({
  title,
  pageSize = 10,
  initialSessions,
  initialTotal = 0,
  initialPage,
  onPageChange,
  onDataChange,
}: TestHistoryListProps) {
  const hasInitial = !!initialSessions && initialSessions.length > 0;
  const [history, setHistory] = useState<HistorySession[]>(initialSessions ?? []);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(initialPage ?? 1);
  const [totalPages, setTotalPages] = useState(initialTotal > 0 ? Math.ceil(initialTotal / pageSize) : 0);
  const [total, setTotal] = useState(initialTotal);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // 走官网 fetchWithAuth：401 自动刷新会话，刷新失败触发全局登出流程
      const res = await fetchWithAuth(`/api/user/skincare-tests?page=${page}&limit=${pageSize}&lite=1`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sessions: HistorySession[] = data.history ?? [];
      const totalCount: number = data.pagination?.total || 0;
      setHistory(sessions);
      setTotalPages(data.pagination?.totalPages || 0);
      setTotal(totalCount);
      onDataChange?.(sessions, totalCount);
    } catch (e) {
      console.error("History fetch error:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, onDataChange]);

  useEffect(() => {
    // 已提供首屏数据：跳过初始拉取，避免与父级（DiaryPanel 时间线）重复请求
    if (hasInitial) return;
    deferInEffect(fetchHistory);
  }, [fetchHistory, hasInitial]);

  useEffect(() => {
    onPageChange?.(page);
  }, [page, onPageChange]);

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-medium text-brand-charcoal">{title}</h3>
          {total > 0 && <span className="text-[12px] text-brand-charcoal/60">共 {total} 条</span>}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3 pt-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 pl-1 py-2.5">
              <div className="h-3 w-12 rounded-full bg-brand-charcoal/[0.06]" />
              <div className="h-3 flex-1 rounded-full bg-brand-charcoal/[0.06]" />
              <div className="h-3 w-14 rounded-full bg-brand-charcoal/[0.06]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="h-48 flex flex-col items-center justify-center gap-4">
          <p className="text-[13px] text-brand-charcoal/60">测肤记录加载失败，请检查网络后重试</p>
          <button
            type="button"
            onClick={fetchHistory}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-full text-[12px] tracking-[0.05em] text-brand-primary border border-brand-charcoal/20 hover:border-brand-charcoal/50 hover:bg-brand-charcoal/[0.04] transition-all duration-300"
          >
            重新加载
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-14 md:py-20">
          <Clock className="w-7 h-7 mx-auto mb-3 text-brand-charcoal/40" strokeWidth={1.5} />
          <h3 className="text-[15px] font-medium text-brand-charcoal mb-1.5">暂无测肤记录</h3>
          <p className="text-[13px] text-brand-charcoal/60 mb-5">开始第一次 AI 皮肤分析</p>
          <Link
            href={`${ADVISOR_URL}/?start=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-9 px-5 rounded-full text-[12px] tracking-[0.05em] text-brand-primary border border-brand-charcoal/20 hover:border-brand-charcoal/50 hover:bg-brand-charcoal/[0.04] transition-all duration-300"
          >
            <ScanFace className="w-3.5 h-3.5" />
            立即测肤
          </Link>
        </div>
      ) : (
        <div>
          {history.map((session, i) => {
            const result = session.analysisResult;
            const score = result?.faceAnalysis?.overallScore;
            const skinType = result?.skinProfile?.typeLabel || result?.skinType?.typeLabel;
            // 按天分组：新日期渲染分组头（日期 + 细线），行内日期改测肤时间，消除同天多条重复日期噪音
            const day = formatDay(session.completedAt);
            const prevDay = i > 0 ? formatDay(history[i - 1].completedAt) : null;
            const isNewDay = day !== prevDay;
            // 跨年分组头补年份：与列表最新条目年份不同时显示"2025.9.8"
            const year = new Date(session.completedAt).getFullYear();
            const latestYear = new Date(history[0].completedAt).getFullYear();
            const showYear = year !== latestYear;
            const time = new Date(session.completedAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            // 分数颜色分级：≥80 绿 / 60-79 品牌棕 / <60 红——扫读"哪次状态好"一眼可辨
            const scoreTone =
              typeof score === "number" && score > 0
                ? score >= 80
                  ? "text-[#4C8055]"
                  : score < 60
                    ? "text-red-500"
                    : "text-brand-charcoal"
                : "text-brand-charcoal";

            return (
              <div key={session.sessionId}>
                {isNewDay && (
                  <div className="pt-4 pb-1.5 first:pt-0 flex items-center gap-2.5">
                    <span className="shrink-0 text-[11px] font-medium text-brand-charcoal/60 tabular-nums">
                      {showYear ? `${year}.${day}` : day}
                    </span>
                    <span className="flex-1 h-px bg-stone-200/60" />
                  </div>
                )}
                <Link
                  href={`${ADVISOR_URL}/reports/${session.sessionId}?skipCover=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 pl-1 py-2.5 rounded-md hover:bg-brand-charcoal/[0.03] transition-colors"
                >
                  <span className="shrink-0 w-12 text-[12px] text-brand-charcoal/60 font-light tabular-nums">
                    {time}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[13px] text-brand-charcoal/85">
                    {skinType || "肌肤分析"}
                  </span>
                  <span className={`shrink-0 text-[13px] font-medium tabular-nums ${scoreTone}`}>
                    {score != null && score > 0 ? `${score} 分` : "—"}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-brand-charcoal/40 group-hover:text-brand-charcoal/60 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1.5 py-2 pr-2 text-[12px] text-brand-charcoal/60 hover:text-brand-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            上一页
          </button>

          <span className="text-[12px] text-brand-charcoal/60">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1.5 py-2 pl-2 text-[12px] text-brand-charcoal/60 hover:text-brand-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            下一页
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
