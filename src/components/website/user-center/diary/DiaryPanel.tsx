"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import {
  CalendarCheck,
  ChevronLeft,
  Flame,
  NotebookPen,
  RefreshCw,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { HistorySession } from "@/components/website/user-center/diary/TestHistoryList";
import { TestHistoryList } from "@/components/website/user-center/diary/TestHistoryList";
import { DiaryTimeline, STATE_META, type DiaryEntry } from "@/components/website/user-center/diary/DiaryTimeline";
import { DiaryCalendar } from "@/components/website/user-center/diary/DiaryCalendar";
import { TrendChart, type TrendsData } from "@/components/website/user-center/diary/TrendChart";
import { CheckInTrend } from "@/components/website/user-center/diary/CheckInTrend";
import { CheckInModal } from "@/components/website/user-center/diary/CheckInModal";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import { localDateStr } from "@/lib/local-date";
import { parseClientDate, isAutoDiaryEntry } from "@/lib/diary-utils";

const TESTS_PAGE_SIZE = 50;
const ENTRIES_PAGE_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8000;

interface DiarySummary {
  totalCheckins: number;
  currentStreak: number;
  longestStreak: number;
  testCount: number;
}

/**
 * 统一请求封装：走官网 fetchWithAuth（写自动带 CSRF；401 自动刷新会话，
 * 刷新失败触发全局登出流程），并带 8s 超时防挂起。
 */
function diaryFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithAuth(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

// 60s 短缓存：趋势与测肤列表重复开关弹层时不重复请求（打卡/删除通过刷新路径绕开）
// 注意缓存解析后的 JSON 而非 Response——Response body 只能消费一次，缓存 Response 会导致二次读取抛 "body stream already read"
// key 必须带用户标识（scope）：同设备退出再登录另一账号时（SPA 无刷新），
// 仅按 URL 缓存会把上一账号的趋势/测肤记录透给新账号
const SHORT_CACHE_TTL_MS = 60_000;
const shortCache = new Map<string, { ts: number; promise: Promise<unknown> }>();
function fetchWithShortCache(url: string, scope: string): Promise<unknown> {
  const key = `${scope}:${url}`;
  const hit = shortCache.get(key);
  if (hit && Date.now() - hit.ts < SHORT_CACHE_TTL_MS) return hit.promise;
  const promise = diaryFetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<unknown>;
  });
  promise.catch(() => shortCache.delete(key));
  shortCache.set(key, { ts: Date.now(), promise });
  return promise;
}

// 打卡/删除等数据变更后作废趋势与测肤列表缓存，保证下次打开立即拉取新数据
function bustShortCache(): void {
  for (const key of Array.from(shortCache.keys())) {
    if (key.includes("/api/user/skincare-trends") || key.includes("/api/user/skincare-tests")) {
      shortCache.delete(key);
    }
  }
}

/** 时间窗截止时刻（N 天前）。模块级工具：react-hooks/purity 禁止组件作用域内调用 Date.now 等非纯函数 */
function daysAgoCutoff(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * DiaryPanel — 「护肤档案」面板（2026-09 由独立 DiaryModal 合并进用户中心「护肤档案」tab）
 * 肌肤变化 + 护肤历程时间线；「全部记录」为面板内视图切换（原内容淡出 → 记录淡入），
 * 打卡保持二级弹层。面板外壳/滚动锁/Escape 由 UserCenterModal 统一负责；本面板自带标题与滚动区。
 */
export function DiaryPanel() {
  const { user } = useAuth();
  // 短缓存/请求的用户隔离标识：依赖 user?.id 而非 user 引用（定时续期返回同内容新对象不应触发重置）
  const userId = user?.id;
  const toast = useToast();

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  // 日记列表加载失败标记：区分"查询失败"与"真的没有记录"，避免 401/网络抖动显示成空白引导
  const [entriesError, setEntriesError] = useState(false);
  // 服务端是否还有更早的日记条目（来自分页响应的 hasMore；游标分页下 total 口径会变化，不能再用 length < total 判断）
  const [entriesHasMore, setEntriesHasMore] = useState(false);
  const [entriesLoadingMore, setEntriesLoadingMore] = useState(false);
  const [diaryRefreshKey, setDiaryRefreshKey] = useState(0);
  // 游标分页：当前已加载最旧一条的日历日（YYYY-MM-DD），"加载更早"时作为 before 参数
  const entriesCursorRef = useRef<string | null>(null);
  const [summary, setSummary] = useState<DiarySummary | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [trendsLoaded, setTrendsLoaded] = useState(false);
  // 趋势加载失败：与"测肤不足 2 次"区分，失败展示错误条 + 重试，而不是解锁引导
  const [trendsError, setTrendsError] = useState(false);
  const [trendsRefreshKey, setTrendsRefreshKey] = useState(0);
  const [tests, setTests] = useState<HistorySession[]>([]);
  const [testsLoaded, setTestsLoaded] = useState(false);
  // 测肤列表加载失败标记：区分"查询失败"与"真的没有记录"，避免 401/网络抖动显示成空白态
  const [testsError, setTestsError] = useState(false);
  const [testsTotal, setTestsTotal] = useState(0);
  const [testsLoadingMore, setTestsLoadingMore] = useState(false);
  const [testsExhausted, setTestsExhausted] = useState(false);
  // 游标分页：当前已加载最旧一条测肤记录的完成时间（ISO），"加载更早"时作为 before 参数
  const testsCursorRef = useRef<string | null>(null);
  const loadedTestIdsRef = useRef<Set<string>>(new Set());
  // "今天"快照（YYYY-MM-DD）：每次打开弹层时刷新，供时间线/日历/打卡色带统一使用，
  // 避免子组件渲染期调用 new Date()（react-hooks/purity）且跨午夜常驻后口径不刷新
  const [todayStr, setTodayStr] = useState(() => localDateStr(new Date()));
  // 日历热力图
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => localDateStr(new Date()).slice(0, 7));
  const [calendarEntries, setCalendarEntries] = useState<DiaryEntry[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  // 全部记录翻页位置保留
  const [lastHistoryPage, setLastHistoryPage] = useState(1);
  // 删除中条目 id
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 请求时序守卫：打开/切号/重开时自增；所有异步回调写回 state 前比对，
  // 防止旧账号/旧请求的晚到响应串入当前界面（bootstrap/趋势/日历由 effect cancelled 覆盖）
  const requestSeqRef = useRef(0);

  // 打卡弹层：existing 为 null 表示新建；dateStr 为目标日历日（补打卡为过去日期）
  const [checkIn, setCheckIn] = useState<{ open: boolean; existing: DiaryEntry | null; dateStr: string | null }>({
    open: false,
    existing: null,
    dateStr: null,
  });
  // 视图切换：true=全部记录（同一弹层内内容淡去切换，不开新弹层）
  const [historyView, setHistoryView] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 近 30 天内有效打卡天数（与 CheckInTrend 的 30 天窗口口径一致，避免旧数据触发空图）
  const recentCheckInCount = useMemo(() => {
    const today = parseClientDate(todayStr);
    if (!today) return 0;
    const cutoffStr = new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    return entries.filter(
      (e) => Boolean(STATE_META[e.skinState]) && e.date.slice(0, 10) >= cutoffStr
    ).length;
  }, [entries, todayStr]);

  // 趋势按天聚合（本地日历日，同日多次测肤取当日最后一次）：
  // 图看趋势、时间线看明细——单日多次对长期趋势是噪声，且避免 X 轴出现重复日期/等距失真
  const aggregatedTrends = useMemo<TrendsData | null>(() => {
    if (!trends || !Array.isArray(trends.dates) || !Array.isArray(trends.scores)) return null;
    const byDay = new Map<string, { date: string; score: number }>();
    for (let i = 0; i < trends.dates.length; i++) {
      const day = localDateStr(new Date(trends.dates[i]));
      byDay.set(day, { date: trends.dates[i], score: trends.scores[i] });
    }
    const days = Array.from(byDay.values()).slice(-30); // 保留最近 30 天，供时间窗切换
    // 聚合后不足两个"天"无法构成趋势（如当天连测两次）→ 视为无趋势，走解锁引导
    if (days.length < 2) return null;
    return { dates: days.map((d) => d.date), scores: days.map((d) => d.score) };
  }, [trends]);

  // 图表时间窗：近 7 天 / 近 30 天（默认 30 天，可切近 7 天聚焦近期）
  const [trendRange, setTrendRange] = useState<7 | 30>(30);
  // 时间窗截止时刻：渲染期禁止调用 Date.now 等非纯函数（react-hooks/purity），
  // 由切换事件与挂载 effect 维护；null = 尚未初始化（渲染占位）
  const [rangeCutoff, setRangeCutoff] = useState<number | null>(null);
  useEffect(() => {
    if (rangeCutoff === null) deferInEffect(() => setRangeCutoff(daysAgoCutoff(trendRange)));
  }, [rangeCutoff, trendRange]);
  const switchTrendRange = (r: 7 | 30) => {
    setTrendRange(r);
    setRangeCutoff(daysAgoCutoff(r));
  };

  // 按时间窗过滤后的趋势数据；窗口内测肤日不足 2 天 → null（该窗口无趋势可看）
  const rangeTrends = useMemo<TrendsData | null>(() => {
    if (!aggregatedTrends || rangeCutoff === null) return null;
    const idx = aggregatedTrends.dates.findIndex((d) => new Date(d).getTime() >= rangeCutoff);
    if (idx === -1) return null;
    const dates = aggregatedTrends.dates.slice(idx);
    const scores = aggregatedTrends.scores.slice(idx);
    return dates.length >= 2 ? { dates, scores } : null;
  }, [aggregatedTrends, rangeCutoff]);

  // 切换视图时内容区回到顶部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [historyView]);

  // 聚合首屏响应落库：条目 + 分页信息 + 里程碑统计（含游标复位）
  const applyBootstrap = useCallback((data: {
    data?: DiaryEntry[];
    pagination?: { total?: number; hasMore?: boolean };
    summary?: DiarySummary | null;
  }) => {
    const list = data.data ?? [];
    setEntries(list);
    setEntriesHasMore(data.pagination?.hasMore ?? false);
    entriesCursorRef.current = list.length > 0 ? list[list.length - 1].date.slice(0, 10) : null;
    setSummary(data.summary ?? null);
  }, []);

  // 聚合首屏直传（不走缓存）：打卡/删除/重试等需要立即回源的路径
  const fetchBootstrap = useCallback(async (limit: number) => {
    const res = await diaryFetch(`/api/user/skincare-archive?bootstrap=1&limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // 测肤记录首屏加载：带 60s 短缓存（重复开关弹层不重复请求）；
  // 失败置 testsError（区别于"无记录"），重试时先作废缓存强制回源；
  // seq 守卫：账号切换/重开后晚到的旧响应不再写回
  const loadTests = useCallback(async (bustCache = false) => {
    const seq = requestSeqRef.current;
    if (bustCache) bustShortCache();
    setTestsError(false);
    try {
      const data = (await fetchWithShortCache(`/api/user/skincare-tests?page=1&limit=${TESTS_PAGE_SIZE}&lite=1`, userId ?? "anon")) as {
        history?: HistorySession[];
        pagination?: { total?: number };
      };
      if (seq !== requestSeqRef.current) return;
      const history: HistorySession[] = data.history ?? [];
      setTests(history);
      testsCursorRef.current = history.length > 0 ? history[history.length - 1].completedAt : null;
      loadedTestIdsRef.current = new Set(history.map((t) => t.sessionId));
      setTestsTotal(data.pagination?.total ?? 0);
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      console.error("Test history fetch error:", e);
      setTestsError(true);
    } finally {
      if (seq === requestSeqRef.current) setTestsLoaded(true);
    }
  }, [userId]);

  // 打卡保存/删除后刷新：聚合首屏直传回源（条目 + 里程碑统计一次返回），
  // 带回已加载过的条目数量（不多拉一页）+ 折叠回"近 30 天"（refreshKey 自增触发时间线收起）
  const refreshEntries = useCallback(() => {
    const seq = requestSeqRef.current;
    const limit = Math.max(ENTRIES_PAGE_SIZE, entries.length);
    fetchBootstrap(limit)
      .then((data) => {
        if (seq !== requestSeqRef.current) return;
        applyBootstrap(data);
        setEntriesLoaded(true);
        setDiaryRefreshKey((k) => k + 1);
      })
      .catch((e) => {
        if (seq !== requestSeqRef.current) return;
        console.error("Diary fetch error:", e);
        setEntriesLoaded(true);
        // 刷新失败要明确告知：打卡/删除刚提示成功，列表却没更新会让用户以为丢记录
        toast.error("列表刷新失败，请稍后再试");
      });
    // 日历视图同步刷新
    setCalendarRefreshKey((k) => k + 1);
    // 数据变更后作废短缓存，保证趋势/测肤列表/聚合首屏下次打开拉取新数据
    bustShortCache();
  }, [entries.length, fetchBootstrap, applyBootstrap, toast]);

  // 时间线"加载更早"：游标分页追加更早的日记（before = 当前最旧一条的日历日），
  // 分页期间新增打卡不会像 offset 分页那样漂移；append 时按 id 去重兜底
  const loadMoreEntries = useCallback(async () => {
    const seq = requestSeqRef.current;
    const cursor = entriesCursorRef.current;
    if (entriesLoadingMore || !cursor) return;
    setEntriesLoadingMore(true);
    try {
      const res = await diaryFetch(`/api/user/skincare-archive?limit=${ENTRIES_PAGE_SIZE}&before=${cursor}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== requestSeqRef.current) return;
      const list: DiaryEntry[] = data.data ?? [];
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...list.filter((e) => !seen.has(e.id))];
      });
      setEntriesHasMore(data.pagination?.hasMore ?? false);
      if (list.length > 0) entriesCursorRef.current = list[list.length - 1].date.slice(0, 10);
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      console.error("Load more entries error:", e);
      toast.error("加载失败，请稍后再试");
    } finally {
      if (seq === requestSeqRef.current) setEntriesLoadingMore(false);
    }
  }, [entriesLoadingMore, toast]);

  // 日记首屏加载失败后的重试（与测肤列表 testsError 对称处理）
  const retryEntries = useCallback(() => {
    setEntriesError(false);
    setEntriesLoaded(false);
    entriesCursorRef.current = null;
    const seq = requestSeqRef.current;
    fetchBootstrap(ENTRIES_PAGE_SIZE)
      .then((data) => {
        if (seq !== requestSeqRef.current) return;
        applyBootstrap(data);
        setEntriesLoaded(true);
      })
      .catch((e) => {
        if (seq !== requestSeqRef.current) return;
        console.error("Diary fetch error:", e);
        setEntriesError(true);
        setEntriesLoaded(true);
      });
  }, [fetchBootstrap, applyBootstrap]);

  // 依赖 userId 而非 user 引用：定时续期（/api/auth/me）返回内容相同的新对象时，
  // 不应触发本 effect 重置面板数据造成"刷新抖动"
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // 时序守卫自增：切号/重开时作废所有在途请求的写回（配合各回调里的 seq 比对）
    requestSeqRef.current += 1;

    deferInEffect(() => {
      setEntries([]);
      setEntriesLoaded(false);
      setEntriesError(false);
      setEntriesHasMore(false);
      setEntriesLoadingMore(false);
      entriesCursorRef.current = null;
      // 每次进入面板刷新"今天"快照：跨午夜后重进，今日打卡/日历描边等口径保持正确
      setTodayStr(localDateStr(new Date()));
      // 进入面板时回到顶部（用户中心按 tab 切换挂载/卸载，重置保证再次进入从顶部开始）
      scrollRef.current?.scrollTo({ top: 0 });
      setSummary(null);
      setTrends(null);
      setTrendsLoaded(false);
      setTests([]);
      setTestsLoaded(false);
      setTestsError(false);
      setTestsExhausted(false);
      setTestsTotal(0);
      setTestsLoadingMore(false);
      loadedTestIdsRef.current = new Set();
      setHistoryView(false);
      testsCursorRef.current = null;
      setCalendarView(false);
      setCalendarEntries([]);
      setCalendarError(false);
      // 日历月份回到本月：避免上次停留在历史月份，重开切到日历时困惑
      setCalendarMonth(localDateStr(new Date()).slice(0, 7));
      setLastHistoryPage(1);
      setDeletingId(null);
      // 打卡弹层状态一并复位：极端情况下（如弹层内跳转导致档案被关）重开不会残留上次的打卡抽屉
      setCheckIn({ open: false, existing: null, dateStr: null });
    });

    // 聚合首屏（条目 + 里程碑统计一次请求）始终直传回源：测肤完成会在服务端自动生成
    // 当日日记条目，若走 60s 短缓存，测肤后立刻重开弹层会看不到刚生成的记录；
    // 请求扇出已由聚合减半（原来 entries + summary 两次独立请求），无需再靠缓存省流
    fetchBootstrap(ENTRIES_PAGE_SIZE)
      .then((data) => {
        if (cancelled) return;
        applyBootstrap(data);
        setEntriesLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Diary fetch error:", e);
        // 区分"加载失败"与"无记录"：失败时展示错误条 + 重试，而非空态引导
        setEntriesError(true);
        setEntriesLoaded(true);
      });

    deferInEffect(loadTests);

    return () => {
      cancelled = true;
    };
  }, [userId, fetchBootstrap, applyBootstrap, loadTests]);

  // 趋势加载独立成 effect（带 60s 短缓存，重复开关弹层不重复请求）：
  // 失败可单独重试，不牵连条目/测肤列表；错误态与"测肤不足 2 次"的解锁引导区分开
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    deferInEffect(() => {
      setTrendsError(false);
      setTrendsLoaded(false);
    });
    fetchWithShortCache("/api/user/skincare-trends", userId)
      .then((raw) => {
        if (cancelled) return;
        const data = raw as { data?: TrendsData | null };
        setTrends(data.data ?? null); // 测肤 < 2 次时后端返回 data: null
        setTrendsLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Trends fetch error:", e);
        setTrendsError(true);
        setTrendsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, trendsRefreshKey]);

  const retryTrends = useCallback(() => {
    bustShortCache();
    setTrendsRefreshKey((k) => k + 1);
  }, []);

  // 日历热力图：切换视图/月份时按需拉取该月条目；打卡保存/删除后随 refreshKey 重拉
  useEffect(() => {
    if (!userId || !calendarView) return;
    let cancelled = false;
    deferInEffect(() => {
      setCalendarLoading(true);
      setCalendarError(false);
    });
    diaryFetch(`/api/user/skincare-archive?month=${calendarMonth}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        setCalendarEntries(data.data ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Calendar month fetch error:", e);
        setCalendarError(true);
      })
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, calendarView, calendarMonth, calendarRefreshKey]);

  // 时间线「加载更早」：游标分页追加更早的测肤记录（before = 当前最旧一条的完成时间），
  // 分页期间新增测肤不会像 offset 页码推导那样漂移；sessionId 去重兜底，无新增时置 exhausted
  const loadMoreTests = useCallback(async () => {
    const seq = requestSeqRef.current;
    const cursor = testsCursorRef.current;
    if (testsLoadingMore) return;
    // 游标为空说明首屏为空（或数据不一致：total>0 但首页无记录）——无法定位"更早"，直接封底避免死按钮
    if (!cursor) {
      setTestsExhausted(true);
      return;
    }
    setTestsLoadingMore(true);
    try {
      const res = await diaryFetch(`/api/user/skincare-tests?limit=${TESTS_PAGE_SIZE}&lite=1&before=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== requestSeqRef.current) return;
      const more: HistorySession[] = data.history ?? [];
      const unique = more.filter((t) => !loadedTestIdsRef.current.has(t.sessionId));
      unique.forEach((t) => loadedTestIdsRef.current.add(t.sessionId));
      setTests((prev) => [...prev, ...unique]);
      if (more.length > 0) testsCursorRef.current = more[more.length - 1].completedAt;
      setTestsTotal(data.pagination?.total ?? 0);
      if (unique.length === 0) setTestsExhausted(true);
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      console.error("Load more tests error:", e);
    } finally {
      if (seq === requestSeqRef.current) setTestsLoadingMore(false);
    }
  }, [testsLoadingMore]);

  // 删除日记条目（含历史日期）；删除后刷新列表/统计/日历
  const handleDeleteEntry = useCallback(async (entry: DiaryEntry) => {
    if (deletingId) return;
    const seq = requestSeqRef.current;
    setDeletingId(entry.id);
    try {
      const res = await diaryFetch(`/api/user/skincare-archive?date=${entry.date.slice(0, 10)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (seq !== requestSeqRef.current) return;
      toast.success("记录已删除");
      refreshEntries();
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      console.error("Diary delete error:", e);
      toast.error("删除未成功，请稍后再试");
    } finally {
      if (seq === requestSeqRef.current) setDeletingId(null);
    }
  }, [deletingId, refreshEntries, toast]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex h-full flex-col">
        {/* 桌面端标题栏（移动端标题由账户弹层头部显示）：视图切换时标题随视图变化；
            全部测肤记录为整面板级视图切换，入口固定在标题栏（不再埋在左列中部） */}
        <div className="hidden shrink-0 items-center justify-between border-b border-stone-200/60 px-6 pb-6 pt-10 md:flex md:px-16">
          <h2 className="text-xl font-medium tracking-wide text-stone-800">
            {historyView ? "测肤记录" : "护肤档案"}
          </h2>
          {!historyView && (
            <button
              type="button"
              onClick={() => setHistoryView(true)}
              className="shrink-0 h-9 inline-flex items-center px-4 rounded-full border border-brand-charcoal/20 text-brand-charcoal/60 text-[12px] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal cursor-pointer"
            >
              全部测肤记录 →
            </button>
          )}
        </div>

        {/* 内容区（可滚动）：两视图淡出/淡入切换，同一面板内完成 */}
        <div
          ref={scrollRef}
          className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6 md:px-16"
        >
                <AnimatePresence mode="wait" initial={false}>
                  {historyView ? (
                    <m.div
                      key="history"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <button
                          type="button"
                          onClick={() => setHistoryView(false)}
                          aria-label="返回护肤档案"
                          className="w-8 h-8 -ml-1 flex items-center justify-center rounded-full text-brand-charcoal/55 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.04] transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <span className="text-[12px] text-brand-charcoal/60 font-light tracking-[0.05em]">
                          返回护肤档案
                        </span>
                      </div>
                      <TestHistoryList
                        pageSize={TESTS_PAGE_SIZE}
                        initialPage={lastHistoryPage}
                        initialSessions={lastHistoryPage <= 1 ? tests.slice(0, TESTS_PAGE_SIZE) : undefined}
                        initialTotal={testsTotal}
                        onPageChange={setLastHistoryPage}
                      />
                    </m.div>
                  ) : (
                    <m.div
                      key="main"
                      className="min-h-full flex flex-col"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                {/* 移动端：整面板级入口（桌面端在标题栏），随主视图淡入淡出 */}
                <div className="mb-4 flex justify-end md:hidden">
                  <button
                    type="button"
                    onClick={() => setHistoryView(true)}
                    className="shrink-0 h-9 inline-flex items-center px-4 rounded-full border border-brand-charcoal/20 text-brand-charcoal/60 text-[12px] transition-colors hover:border-brand-charcoal/50 hover:text-brand-charcoal cursor-pointer"
                  >
                    全部测肤记录 →
                  </button>
                </div>

                {/* ===== 登录：概览（肌肤变化 + 打卡）+ 时间线 ===== */}
                {/* PC 端（lg+）非对称双列（6:4，左列概览更宽）；左列 sticky 且限高内部滚动，
                    避免左列高于视口时 pin 住后底部内容不可达；移动端单列堆叠 */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)] lg:gap-10">
                    {/* 左列：肌肤变化（趋势）+ 打卡（色带/连续性统计），语义分组 */}
                    <section className="mb-8 lg:mb-0 lg:self-start lg:sticky lg:top-0 lg:max-h-[min(576px,calc(100dvh_-_9.5rem))] lg:overflow-y-auto lg:scrollbar-hide lg:pr-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[15px] font-medium text-stone-800 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-stone-400" strokeWidth={1.5} />
                          肌肤变化
                        </h3>
                        <div className="flex items-center gap-3">
                          {aggregatedTrends && (
                            <div className="flex items-center gap-2" role="group" aria-label="趋势时间范围">
                              {([7, 30] as const).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => switchTrendRange(r)}
                                  aria-pressed={trendRange === r}
                                  className={`inline-flex items-center rounded-full border px-4 py-2 text-xs transition-colors active:opacity-70 cursor-pointer ${
                                    trendRange === r
                                      ? "border-brand-charcoal/40 bg-brand-charcoal/10 font-medium text-brand-charcoal"
                                      : "border-brand-charcoal/30 bg-white/40 text-brand-charcoal hover:border-brand-charcoal/60 hover:bg-brand-charcoal/5"
                                  }`}
                                >
                                  近 {r} 天
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 趋势区：与时间轴同风格的极简平铺（无卡片外壳，靠留白组织） */}
                      {!trendsLoaded || !entriesLoaded ? (
                        <div className="animate-pulse">
                          {/* 摘要骨架：与 TrendChart 真实布局一致（左：标签+大字+日期，右：差值胶囊），避免加载完成瞬间跳动 */}
                          <div className="flex items-end justify-between mb-4">
                            <div>
                              <div className="h-3 w-24 rounded-full bg-brand-charcoal/[0.06] mb-2.5" />
                              <div className="h-9 w-32 rounded-lg bg-brand-charcoal/[0.08] mb-2.5" />
                              <div className="h-3 w-20 rounded-full bg-brand-charcoal/[0.06]" />
                            </div>
                            <div className="h-6 w-16 rounded-full bg-brand-charcoal/[0.06]" />
                          </div>
                          {/* 图表骨架 */}
                          <div className="h-40 rounded-xl bg-brand-charcoal/[0.04]" />
                        </div>
                      ) : trendsError ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <span className="text-[13px] text-brand-charcoal/70 font-light">
                            肌肤变化加载失败，可能是网络波动或登录状态过期
                          </span>
                          <button
                            type="button"
                            onClick={retryTrends}
                            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-brand-primary text-white text-[12px] font-medium hover:bg-brand-primary-dark transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
                            重试
                          </button>
                        </div>
                      ) : aggregatedTrends ? (
                        <div>
                          {rangeCutoff === null ? (
                            <div className="h-32" />
                          ) : rangeTrends ? (
                            <TrendChart trends={rangeTrends} />
                          ) : (
                            <div className="py-6 text-center">
                              <p className="text-[13px] text-brand-charcoal/60 font-light">
                                近 {trendRange} 天内测肤不足 2 次，暂无趋势可看
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 解锁引导：以说明为主；操作入口统一在右列空态，避免同屏重复 CTA */
                        <div className="py-6 text-center">
                          <p className="text-[13px] text-brand-charcoal/70 font-light leading-[1.8] tracking-[0.06em] mb-2">
                            完成两次不同日期的测肤后解锁肌肤变化
                          </p>
                          <p className="text-[13px] text-brand-charcoal/60 font-light leading-[1.8] tracking-[0.06em]">
                            定期测肤，看见肌肤的真实变化
                          </p>
                        </div>
                      )}

                      {/* 测肤次数并入「肌肤变化」语境，不再混进打卡统计 */}
                      {summary && summary.testCount > 0 && (
                        <p className="mt-4 text-center text-[11px] text-brand-charcoal/60 font-light tracking-[0.06em]">
                          累计测肤 {summary.testCount} 次
                        </p>
                      )}

                      {/* 打卡：与测肤趋势语义分离的独立子区块（色带 + 连续性统计）。
                          列数跟随实际项数（最长连续为 0 时不占列） */}
                      {summary && summary.totalCheckins > 0 && (
                        <div className="mt-8 border-t border-stone-200/60 pt-6">
                          <h3 className="text-[15px] font-medium text-stone-800 flex items-center gap-2 mb-4">
                            <Flame className="w-4 h-4 text-amber-600" strokeWidth={1.5} />
                            打卡
                          </h3>
                          {recentCheckInCount >= 2 && (
                            <div className="mb-4">
                              <CheckInTrend entries={entries} todayStr={todayStr} />
                            </div>
                          )}
                          <div className={`grid ${summary.longestStreak > 0 ? "grid-cols-3" : "grid-cols-2"} pt-4 border-t border-stone-200/60`}>
                            <div className="flex flex-col items-center gap-1.5 py-1 border-r border-stone-200/60 last:border-r-0">
                              <p className="text-xl font-serif font-light text-brand-charcoal leading-none">
                                {summary.currentStreak}
                                <span className="ml-0.5 text-[11px] font-sans font-light text-brand-charcoal/65">天</span>
                              </p>
                              <p className="flex items-center gap-1 text-[11px] text-brand-charcoal/65 font-light">
                                <Flame className="w-3 h-3 text-amber-600" strokeWidth={1.8} />
                                连续打卡
                              </p>
                            </div>
                            <div className="flex flex-col items-center gap-1.5 py-1 border-r border-stone-200/60 last:border-r-0">
                              <p className="text-xl font-serif font-light text-brand-charcoal leading-none">
                                {summary.totalCheckins}
                                <span className="ml-0.5 text-[11px] font-sans font-light text-brand-charcoal/65">次</span>
                              </p>
                              <p className="flex items-center gap-1 text-[11px] text-brand-charcoal/65 font-light">
                                <CalendarCheck className="w-3 h-3 text-brand-charcoal/65" strokeWidth={1.8} />
                                累计打卡
                              </p>
                            </div>
                            {summary.longestStreak > 0 && (
                              <div className="flex flex-col items-center gap-1.5 py-1 border-r border-stone-200/60 last:border-r-0">
                                <p className="text-xl font-serif font-light text-brand-charcoal leading-none">
                                  {summary.longestStreak}
                                  <span className="ml-0.5 text-[11px] font-sans font-light text-brand-charcoal/65">天</span>
                                </p>
                                <p className="flex items-center gap-1 text-[11px] text-brand-charcoal/65 font-light">
                                  <Trophy className="w-3 h-3 text-amber-500" strokeWidth={1.8} />
                                  最长连续
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 护肤历程 */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[15px] font-medium text-stone-800 flex items-center gap-2">
                          <NotebookPen className="w-4 h-4 text-stone-400" strokeWidth={1.5} />
                          护肤历程
                        </h3>
                        {/* 视图切换：独立胶囊（风格对齐会员中心「录入消费」/渠道选择） */}
                        <div className="flex items-center gap-2" role="group" aria-label="历程视图切换">
                          {([
                            { key: false, label: "时间线" },
                            { key: true, label: "日历" },
                          ] as const).map((v) => (
                            <button
                              key={v.label}
                              type="button"
                              onClick={() => setCalendarView(v.key)}
                              aria-pressed={calendarView === v.key}
                              className={`inline-flex items-center rounded-full border px-4 py-2 text-xs transition-colors active:opacity-70 cursor-pointer ${
                                calendarView === v.key
                                  ? "border-brand-charcoal/40 bg-brand-charcoal/10 font-medium text-brand-charcoal"
                                  : "border-brand-charcoal/30 bg-white/40 text-brand-charcoal hover:border-brand-charcoal/60 hover:bg-brand-charcoal/5"
                              }`}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {calendarView ? (
                        <>
                          {calendarError && (
                            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                              <span className="text-[13px] text-brand-charcoal/70 font-light">
                                日历加载失败，可能是网络波动
                              </span>
                              <button
                                type="button"
                                onClick={() => setCalendarRefreshKey((k) => k + 1)}
                                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-brand-primary text-white text-[12px] font-medium hover:bg-brand-primary-dark transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
                                重试
                              </button>
                            </div>
                          )}
                          <DiaryCalendar
                            entries={calendarEntries}
                            month={calendarMonth}
                            todayStr={todayStr}
                            onMonthChange={setCalendarMonth}
                            onBackfill={(dateStr) => setCheckIn({ open: true, existing: null, dateStr })}
                            onSelectEntry={(entry) => {
                              // 测肤自动条目对用户不算手动打卡：点按走"接管"语义（existing=null 新建覆盖）；
                              // 手动打卡条目带入旧值编辑（与时间线的入口语义一致）
                              setCheckIn({
                                open: true,
                                existing: isAutoDiaryEntry(entry) ? null : entry,
                                dateStr: entry.date.slice(0, 10),
                              });
                            }}
                            loading={calendarLoading}
                          />
                        </>
                      ) : (
                        <>
                        {testsError && (
                          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <span className="text-[13px] text-brand-charcoal/70 font-light">
                              测肤记录加载失败，可能是网络波动或登录状态过期
                            </span>
                            <button
                              type="button"
                              onClick={() => loadTests(true)}
                              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-brand-primary text-white text-[12px] font-medium hover:bg-brand-primary-dark transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
                              重试
                            </button>
                          </div>
                        )}
                        {entriesError ? (
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <span className="text-[13px] text-brand-charcoal/70 font-light">
                              护肤记录加载失败，可能是网络波动或登录状态过期
                            </span>
                            <button
                              type="button"
                              onClick={retryEntries}
                              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-brand-primary text-white text-[12px] font-medium hover:bg-brand-primary-dark transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
                              重试
                            </button>
                          </div>
                        ) : (
                        <DiaryTimeline
                          entries={entries}
                          tests={tests}
                          loading={!entriesLoaded || !testsLoaded}
                          todayStr={todayStr}
                          onCheckIn={(existing, dateStr) => setCheckIn({ open: true, existing, dateStr })}
                          onDeleteEntry={handleDeleteEntry}
                          deletingId={deletingId}
                          hasMoreTests={!testsExhausted && tests.length < testsTotal}
                          testsLoadingMore={testsLoadingMore}
                          onLoadMoreTests={loadMoreTests}
                          hasMoreEntries={entriesHasMore}
                          entriesLoadingMore={entriesLoadingMore}
                          onLoadMoreEntries={loadMoreEntries}
                          refreshKey={diaryRefreshKey}
                        />
                        )}
                        </>
                      )}
                    </section>
                </div>
                  </m.div>
                )}
                </AnimatePresence>
        </div>
      </div>

      {/* 二级弹层：打卡/补打卡（DOM 顺序在弹层主体之后，AccountModal Portal 内自然置顶）；全部记录已改为同面板内视图切换 */}
      <CheckInModal
        isOpen={checkIn.open && !!user}
        existing={checkIn.existing}
        dateStr={checkIn.dateStr ?? undefined}
        onClose={() => setCheckIn((s) => ({ ...s, open: false }))}
        onSaved={refreshEntries}
      />
    </LazyMotion>
  );
}
