import type { Prisma } from "@/generated/prisma/client";
import { advisorRequest } from "@/lib/advisor-internal";
import { iterateUserBatches } from "@/lib/user-query";
import {
  ADVISOR_ROLE_LABELS,
  ADVISOR_SKIN_STATE_LABELS,
  MEMBERSHIP_LABELS,
  jsonCell,
  toIso,
  yesNo,
  type ExportCsvEntry,
  type ExportJsonlEntry,
  type UserExportEntry,
  type UserExportGroup,
} from "@/lib/user-export";
import type {
  AdvisorUserAccount,
  AdvisorUserOverview,
  AdvisorUserUsage,
} from "@/types/advisor-user";

const ADVISOR_BATCH_SIZE = 30;
const ADVISOR_CONCURRENCY = 3;
const ADVISOR_PAGE_SIZE = 100;
const ADVISOR_MAX_PAGES = 1000;
const ADVISOR_TIMEOUT_MS = 8000;

interface AdvisorMeta {
  userId: string;
  status: "OK" | "FAILED" | "SKIPPED";
  account: AdvisorUserAccount | null;
  usage: AdvisorUserUsage | null;
  counts: {
    sessions: number;
    completedSessions: number;
    diaryEntries: number;
  };
  error?: {
    stage: "overview";
    code: string;
    message: string;
  };
}

interface AdvisorErrorRow {
  userId: string;
  stage: string;
  code: string;
  message: string;
  fetched: number;
  createdAt: string;
}

export interface AdvisorExportContext {
  meta: Map<string, AdvisorMeta>;
  errors: AdvisorErrorRow[];
  globalFailure: boolean;
  signal?: AbortSignal;
}

export interface AdvisorExportOptions {
  where: Prisma.UserWhereInput;
  groups: readonly UserExportGroup[];
  signal?: AbortSignal;
}

function isGlobalAdvisorError(code: string, status: number): boolean {
  return code === "NOT_CONFIGURED" || code === "UNAUTHORIZED" || status === 401;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickNumber(value: unknown): number | "" {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function addAdvisorError(
  context: AdvisorExportContext,
  error: Omit<AdvisorErrorRow, "createdAt">
): void {
  if (context.errors.some((item) => item.userId === error.userId && item.stage === error.stage)) {
    return;
  }
  context.errors.push({ ...error, createdAt: new Date().toISOString() });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

type AdvisorUserRow = {
  id: string;
  membershipLevel: string;
  totalSpent: number;
  createdAt: Date;
};

async function requestOverview(
  user: AdvisorUserRow
): Promise<
  | { ok: true; overview: AdvisorUserOverview }
  | { ok: false; status: number; code: string; message: string }
> {
  const result = await advisorRequest<{ data?: AdvisorUserOverview }>(
    "/api/internal/admin/user-overview",
    {
      query: {
        userId: user.id,
        level: user.membershipLevel,
        totalSpent: user.totalSpent,
      },
      signQuery: true,
      timeoutMs: ADVISOR_TIMEOUT_MS,
    }
  );
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      code: result.code,
      message: result.message,
    };
  }
  const overview = result.data?.data;
  if (!overview) {
    return {
      ok: false,
      status: 0,
      code: "UPSTREAM_INVALID",
      message: "测肤子站返回结构异常",
    };
  }
  return { ok: true, overview };
}

export async function prepareAdvisorContext(
  options: AdvisorExportOptions
): Promise<AdvisorExportContext> {
  const context: AdvisorExportContext = {
    meta: new Map(),
    errors: [],
    globalFailure: false,
    signal: options.signal,
  };
  const userSelect = {
    id: true,
    createdAt: true,
    membershipLevel: true,
    totalSpent: true,
  } satisfies Prisma.UserSelect;

  for await (const batch of iterateUserBatches({
    where: options.where,
    select: userSelect,
    batchSize: ADVISOR_BATCH_SIZE,
  })) {
    if (context.signal?.aborted) throw new Error("EXPORT_ABORTED");

    if (context.globalFailure) {
      for (const user of batch) {
        if (!context.meta.has(user.id)) {
          context.meta.set(user.id, {
            userId: user.id,
            status: "SKIPPED",
            account: null,
            usage: null,
            counts: { sessions: 0, completedSessions: 0, diaryEntries: 0 },
          });
        }
      }
      continue;
    }

    const users = batch as unknown as AdvisorUserRow[];
    const results = await mapWithConcurrency(users, ADVISOR_CONCURRENCY, async (user) => {
      if (context.signal?.aborted) throw new Error("EXPORT_ABORTED");
      const result = await requestOverview(user).catch((error: unknown) => ({
        ok: false as const,
        status: 0,
        code: "UPSTREAM_ERROR",
        message: error instanceof Error ? error.message : "测肤子站请求异常",
      }));
      return { user, result };
    });

    for (const { user, result } of results) {
      if (result.ok) {
        const overview = result.overview;
        context.meta.set(user.id, {
          userId: user.id,
          status: "OK",
          account: overview.account,
          usage: overview.usage ?? null,
          counts: {
            sessions: overview.counts?.sessions ?? 0,
            completedSessions: overview.counts?.completedSessions ?? 0,
            diaryEntries: overview.counts?.diaryEntries ?? 0,
          },
        });
      } else {
        context.meta.set(user.id, {
          userId: user.id,
          status: "FAILED",
          account: null,
          usage: null,
          counts: { sessions: 0, completedSessions: 0, diaryEntries: 0 },
          error: {
            stage: "overview",
            code: result.code,
            message: result.message,
          },
        });
        addAdvisorError(context, {
          userId: user.id,
          stage: "overview",
          code: result.code,
          message: result.message,
          fetched: 0,
        });
        if (isGlobalAdvisorError(result.code, result.status)) {
          context.globalFailure = true;
        }
      }
    }
  }

  if (context.globalFailure) {
    addAdvisorError(context, {
      userId: "*",
      stage: "global",
      code: "ADVISOR_EXPORT_ABORTED",
      message: "测肤子站未配置或鉴权失败，已跳过剩余测肤数据",
      fetched: 0,
    });
  }

  return context;
}

function shouldFetchSessions(meta: AdvisorMeta): boolean {
  if (meta.status === "SKIPPED") return false;
  return meta.status === "FAILED" || meta.account !== null || meta.counts.sessions > 0;
}

function shouldFetchDiary(meta: AdvisorMeta): boolean {
  if (meta.status === "SKIPPED") return false;
  return meta.status === "FAILED" || meta.account !== null || meta.counts.diaryEntries > 0;
}

function sessionSummary(raw: unknown): unknown[] {
  const record = asRecord(raw) ?? {};
  const analysis = asRecord(record.analysisResult);
  const face = asRecord(analysis?.faceAnalysis);
  const profile = asRecord(analysis?.skinProfile);
  const skinType = asRecord(analysis?.skinType);
  const concerns = profile?.concerns ?? analysis?.concerns ?? [];
  const sessionId = pickString(record.sessionId);
  const completedAt = pickString(record.completedAt);
  return [
    sessionId,
    toIso(completedAt),
    completedAt ? "是" : "否",
    pickNumber(face?.overallScore),
    pickNumber(face?.skinAge) || pickNumber(profile?.skinAge),
    pickString(profile?.typeLabel) || pickString(skinType?.typeLabel),
    jsonCell(concerns),
  ];
}

interface TestHistoryResponse {
  history?: unknown[];
  pagination?: {
    total?: number;
    totalPages?: number;
  };
}

async function* iterateSessionPages(
  userId: string,
  context: AdvisorExportContext,
  lite: boolean
): AsyncGenerator<unknown[], void, unknown> {
  const seen = new Set<string>();
  for (let page = 1; page <= ADVISOR_MAX_PAGES; page += 1) {
    if (context.signal?.aborted) throw new Error("EXPORT_ABORTED");
    if (context.globalFailure) return;
    const result = await advisorRequest<TestHistoryResponse>("/api/internal/test-history", {
      query: {
        userId,
        page,
        limit: ADVISOR_PAGE_SIZE,
        ...(lite ? { lite: 1 } : {}),
      },
      signQuery: true,
      timeoutMs: ADVISOR_TIMEOUT_MS,
    });
    if (!result.ok) {
      addAdvisorError(context, {
        userId,
        stage: lite ? "sessions" : "sessions_full",
        code: result.code,
        message: result.message,
        fetched: seen.size,
      });
      if (isGlobalAdvisorError(result.code, result.status)) {
        context.globalFailure = true;
      }
      return;
    }
    const history = Array.isArray(result.data?.history) ? result.data.history : [];
    const fresh: unknown[] = [];
    for (const item of history) {
      const record = asRecord(item);
      const sessionId = pickString(record?.sessionId);
      if (sessionId && seen.has(sessionId)) continue;
      if (sessionId) seen.add(sessionId);
      fresh.push(item);
    }
    if (fresh.length > 0) yield fresh;
    const totalPages =
      typeof result.data?.pagination?.totalPages === "number"
        ? result.data.pagination.totalPages
        : null;
    if (history.length === 0) return;
    if (totalPages !== null && page >= totalPages) return;
    if (totalPages === null && history.length < ADVISOR_PAGE_SIZE) return;
  }
  addAdvisorError(context, {
    userId,
    stage: lite ? "sessions" : "sessions_full",
    code: "PAGINATION_LIMIT",
    message: `会话分页超过 ${ADVISOR_MAX_PAGES} 页，已停止`,
    fetched: 0,
  });
}

function sessionsEntry(context: AdvisorExportContext): ExportCsvEntry {
  return {
    name: "advisor-sessions.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "会话ID",
      "完成时间",
      "是否完成",
      "综合评分",
      "皮肤年龄",
      "皮肤类型",
      "关注点(JSON)",
    ],
    rows: (async function* () {
      for (const meta of context.meta.values()) {
        if (!shouldFetchSessions(meta)) continue;
        for await (const history of iterateSessionPages(meta.userId, context, true)) {
          for (const item of history) {
            const record = asRecord(item) ?? {};
            const sessionId = pickString(record.sessionId);
            if (!sessionId) continue;
            const summary = sessionSummary(item);
            yield [meta.userId, ...summary];
          }
        }
      }
    })(),
  };
}

function fullAnalysisEntry(context: AdvisorExportContext): ExportJsonlEntry {
  return {
    name: "advisor-session-analysis.jsonl",
    kind: "jsonl",
    lines: (async function* () {
      for (const meta of context.meta.values()) {
        if (!shouldFetchSessions(meta)) continue;
        for await (const history of iterateSessionPages(meta.userId, context, false)) {
          for (const session of history) {
            yield JSON.stringify({ userId: meta.userId, session }) + "\n";
          }
        }
      }
    })(),
  };
}

interface DiaryResponse {
  data?: unknown[];
  pagination?: {
    hasMore?: boolean;
  };
}

function diaryEntry(context: AdvisorExportContext): ExportCsvEntry {
  return {
    name: "advisor-diary.csv",
    kind: "csv",
    headers: ["用户ID", "日记ID", "日期", "肤况", "肤况代码", "标签(JSON)", "备注", "关联会话ID"],
    rows: (async function* () {
      for (const meta of context.meta.values()) {
        if (!shouldFetchDiary(meta)) continue;
        const seen = new Set<string>();
        let before: string | undefined;
        let page = 1;
        for (; page <= ADVISOR_MAX_PAGES; page += 1) {
          if (context.signal?.aborted) throw new Error("EXPORT_ABORTED");
          if (context.globalFailure) break;
          const result = await advisorRequest<DiaryResponse>("/api/internal/diary", {
            query: {
              userId: meta.userId,
              limit: ADVISOR_PAGE_SIZE,
              before,
            },
            signQuery: true,
            timeoutMs: ADVISOR_TIMEOUT_MS,
          });
          if (!result.ok) {
            addAdvisorError(context, {
              userId: meta.userId,
              stage: "diary",
              code: result.code,
              message: result.message,
              fetched: seen.size,
            });
            if (isGlobalAdvisorError(result.code, result.status)) {
              context.globalFailure = true;
            }
            break;
          }
          const entries = Array.isArray(result.data?.data) ? result.data.data : [];
          let lastDate = "";
          for (const item of entries) {
            const record = asRecord(item) ?? {};
            const id = pickString(record.id);
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            const date = pickString(record.date);
            const skinState = pickString(record.skinState);
            lastDate = date;
            yield [
              meta.userId,
              id,
              toIso(date),
              ADVISOR_SKIN_STATE_LABELS[skinState] ?? skinState,
              skinState,
              jsonCell(record.tags),
              pickString(record.note),
              pickString(record.sessionId),
            ];
          }
          const hasMore = result.data?.pagination?.hasMore === true;
          if (!hasMore || entries.length === 0 || !lastDate) break;
          before = lastDate.slice(0, 10);
        }
        if (page > ADVISOR_MAX_PAGES) {
          addAdvisorError(context, {
            userId: meta.userId,
            stage: "diary",
            code: "PAGINATION_LIMIT",
            message: `日记分页超过 ${ADVISOR_MAX_PAGES} 页，已停止`,
            fetched: seen.size,
          });
        }
      }
    })(),
  };
}

function advisorAccountsEntry(
  context: AdvisorExportContext,
  groups: readonly UserExportGroup[]
): ExportCsvEntry {
  const historySelected = groups.some(
    (group) =>
      group === "advisorSessions" || group === "advisorDiary" || group === "advisorFullAnalysis"
  );
  return {
    name: "advisor-accounts.csv",
    kind: "csv",
    headers: [
      "用户ID",
      "是否开通",
      "子站角色",
      "每日测试限额",
      "会员等级",
      "今日已用",
      "累计已用",
      "每日上限",
      "终身上限",
      "是否无限",
      "剩余额度",
      "今日已打卡",
      "会话数",
      "完成会话数",
      "日记数",
      "建档时间",
      "最后活跃",
      "数据状态",
      "错误说明",
    ],
    rows: (async function* () {
      for (const meta of context.meta.values()) {
        const userErrors = context.errors.filter(
          (item) => item.userId === meta.userId && item.stage !== "overview"
        );
        const overviewFailed = meta.status === "FAILED";
        const historyFailed = userErrors.length > 0;
        let statusLabel = "成功";
        if (meta.status === "SKIPPED") statusLabel = "跳过";
        else if (overviewFailed && historyFailed) statusLabel = "失败";
        else if (overviewFailed) statusLabel = historySelected ? "部分成功" : "失败";
        else if (historyFailed) statusLabel = "部分成功";
        else if (context.globalFailure && historySelected) statusLabel = "部分成功";
        const errorMessages = [
          ...(meta.error ? [`${meta.error.code}: ${meta.error.message}`] : []),
          ...userErrors.map((item) => `${item.stage} ${item.code}: ${item.message}`),
        ];
        const account = meta.account;
        const usage = meta.usage;
        const quota = usage?.quota;
        yield [
          meta.userId,
          meta.status === "OK" ? (account ? "是" : "否") : "未知",
          account ? (ADVISOR_ROLE_LABELS[account.role] ?? account.role) : "",
          account?.dailyTestLimit ?? "",
          usage?.level ? (MEMBERSHIP_LABELS[usage.level] ?? usage.level) : "",
          usage?.todayUsed ?? "",
          usage?.totalUsed ?? "",
          quota?.dailyLimit ?? "",
          quota?.lifetimeLimit ?? "",
          quota ? yesNo(quota.unlimited) : "",
          usage?.remaining ?? "",
          usage?.todayCheckedIn === undefined ? "" : yesNo(usage.todayCheckedIn),
          meta.counts.sessions,
          meta.counts.completedSessions,
          meta.counts.diaryEntries,
          toIso(account?.createdAt),
          toIso(account?.lastActiveAt),
          statusLabel,
          errorMessages.join("；"),
        ];
      }
    })(),
  };
}

function advisorErrorsEntry(context: AdvisorExportContext): ExportCsvEntry {
  return {
    name: "advisor-errors.csv",
    kind: "csv",
    headers: ["用户ID", "阶段", "错误码", "错误信息", "已获取条数", "时间"],
    rows: (async function* () {
      for (const error of context.errors) {
        yield [
          error.userId,
          error.stage,
          error.code,
          error.message,
          error.fetched,
          error.createdAt,
        ];
      }
    })(),
  };
}

export function buildAdvisorExportEntries(
  context: AdvisorExportContext,
  groups: readonly UserExportGroup[]
): UserExportEntry[] {
  const selected = new Set(groups);
  const entries: UserExportEntry[] = [];
  if (selected.has("advisorSessions")) entries.push(sessionsEntry(context));
  if (selected.has("advisorFullAnalysis")) entries.push(fullAnalysisEntry(context));
  if (selected.has("advisorDiary")) entries.push(diaryEntry(context));
  if (selected.has("advisorAccount")) entries.push(advisorAccountsEntry(context, groups));
  if (
    selected.has("advisorAccount") ||
    selected.has("advisorSessions") ||
    selected.has("advisorDiary") ||
    selected.has("advisorFullAnalysis")
  ) {
    entries.push(advisorErrorsEntry(context));
  }
  return entries;
}
