"use client";

/**
 * 定时任务监控页面（仅超级管理员）
 * - 展示任务清单与最近运行状态（成功/失败/耗时）
 * - 支持手动触发（写审计 run_cron_task）
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Play, AlertTriangle } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";

type CronRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "SKIPPED";

interface TaskLastRun {
  id: string;
  status: CronRunStatus | null;
  startedAt: string;
  finishedAt: string | null;
  success: boolean | null;
  trigger: string;
  error: string | null;
  durationMs: number | null;
  heartbeatAt: string | null;
}

interface CronTask {
  key: string;
  name: string;
  cronExpression: string;
  isCleanup: boolean;
  timeoutMs: number;
  lastRun: TaskLastRun | null;
}

interface CronRun {
  id: string;
  taskKey: string | null;
  taskName: string;
  trigger: string;
  status: CronRunStatus | null;
  success: boolean | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  heartbeatAt: string | null;
}

interface RunTarget {
  name: string;
  key: string;
  sourceRunId?: string;
}

const STATUS_META: Record<
  CronRunStatus,
  { label: string; variant: "success" | "danger" | "warning" | "secondary" | "primary" }
> = {
  RUNNING: { label: "运行中", variant: "primary" },
  SUCCESS: { label: "成功", variant: "success" },
  FAILED: { label: "失败", variant: "danger" },
  TIMEOUT: { label: "超时", variant: "danger" },
  SKIPPED: { label: "已跳过", variant: "secondary" },
};

function runStatus(
  run: Pick<TaskLastRun, "status" | "success"> | Pick<CronRun, "status" | "success">
): CronRunStatus {
  if (run.status) return run.status;
  return run.success ? "SUCCESS" : "FAILED";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "进行中";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function triggerLabel(trigger: string): string {
  if (trigger === "manual") return "手动触发";
  if (trigger === "external") return "外部调度";
  return "自动调度";
}

export default function AdminCronTasksPage() {
  return (
    <RequirePermission permission="cron:read">
      <AdminCronTasksContent />
    </RequirePermission>
  );
}

function AdminCronTasksContent() {
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { can: canAdmin } = useAdminPermissions();
  const canRun = canAdmin("cron:run");
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [recentRuns, setRecentRuns] = useState<CronRun[]>([]);
  const [cronMode, setCronMode] = useState<"local" | "external" | "disabled">("disabled");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [triggerTarget, setTriggerTarget] = useState<RunTarget | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [runFilter, setRunFilter] = useState<"" | CronRunStatus>("");

  const fetchTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await apiGet<{
          cronEnabled: boolean;
          cronMode: "local" | "external" | "disabled";
          tasks: CronTask[];
          recentRuns: CronRun[];
        }>("/api/admin/cron-tasks", {
          runStatus: runFilter || undefined,
          runLimit: 50,
        });
        setTasks(data.tasks);
        setRecentRuns(data.recentRuns);
        setCronMode(data.cronMode);
        setLoadError(false);
      } catch (err) {
        if (!silent) {
          setLoadError(true);
          showError(err instanceof Error ? err.message : "加载定时任务失败");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showError, runFilter]
  );

  const hasRunning = recentRuns.some((run) => runStatus(run) === "RUNNING");

  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      void fetchTasks(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasRunning, fetchTasks]);

  useEffect(() => {
    deferInEffect(fetchTasks);
  }, [fetchTasks]);

  const handleTrigger = async () => {
    if (!triggerTarget) return;
    setTriggering(true);
    try {
      const submit = () =>
        apiPost<{ message: string }>(
          "/api/admin/cron-tasks",
          {
            ...(triggerTarget.key
              ? { taskKey: triggerTarget.key }
              : { taskName: triggerTarget.name }),
            sourceRunId: triggerTarget.sourceRunId,
          },
          { timeoutMs: 10 * 60 * 1000 }
        );

      let data: { message: string };
      try {
        data = await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        data = await submit();
      }
      success(data.message);
      setTriggerTarget(null);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "任务执行失败");
    } finally {
      setTriggering(false);
      // 成功/失败都刷新，确保"最近运行/失败原因"立即可见
      await fetchTasks();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="定时任务"
        description="查看任务运行状态，支持手动触发；失败原因会保留在最近运行记录中。"
        accessory={
          !loading && !loadError ? (
            <Badge variant={cronMode === "disabled" ? "warning" : "success"}>
              {cronMode === "local"
                ? "本机调度已启用"
                : cronMode === "external"
                  ? "外部调度模式"
                  : "自动调度未启用"}
            </Badge>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void fetchTasks()}
          >
            刷新
          </Button>
        }
      />

      {/* 未启用提示 */}
      {!loading && !loadError && cronMode === "disabled" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>
            当前未启用本机定时任务，也未配置 CRON_SECRET，任务不会自动运行；仍可手动触发。
            生产环境请启用 ENABLE_LOCAL_CRON 或配置外部调度。
          </p>
        </div>
      )}

      {/* 任务列表 */}
      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white">
          <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-4 py-3">
            <h2 className="text-sm font-medium text-brand-charcoal">任务列表</h2>
            <span className="text-xs text-brand-charcoal/65">加载中...</span>
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white">
          <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-4 py-3">
            <h2 className="text-sm font-medium text-brand-charcoal">任务列表</h2>
          </div>
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-500">加载定时任务失败</p>
            <Button variant="outline" size="sm" onClick={() => void fetchTasks()}>
              重试
            </Button>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white">
          <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-4 py-3">
            <h2 className="text-sm font-medium text-brand-charcoal">任务列表</h2>
          </div>
          <Empty className="py-12" title="暂无定时任务" />
        </div>
      ) : (
        <div className="hidden overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white md:block">
          <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-4 py-3">
            <h2 className="text-sm font-medium text-brand-charcoal">任务列表</h2>
            <span className="text-xs text-brand-charcoal/65">共 {tasks.length} 个任务</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs uppercase text-brand-charcoal/65">
                  <th scope="col" className="px-4 py-3 font-medium">
                    任务
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    最近运行
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    结果
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    耗时
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-charcoal/10">
                {tasks.map((task) => (
                  <tr key={task.name} className="hover:bg-brand-charcoal/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-charcoal">{task.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-brand-charcoal/65">
                        {task.cronExpression}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-brand-charcoal/70">
                      <p>{task.lastRun ? formatDateTime(task.lastRun.startedAt) : "从未运行"}</p>
                      {task.lastRun && (
                        <p className="mt-0.5 text-xs text-brand-charcoal/65">
                          {triggerLabel(task.lastRun.trigger)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!task.lastRun ? (
                        <Badge variant="secondary">未运行</Badge>
                      ) : (
                        (() => {
                          const status = runStatus(task.lastRun);
                          const meta = STATUS_META[status];
                          return (
                            <div>
                              <Badge variant={meta.variant}>{meta.label}</Badge>
                              {task.lastRun.error && (
                                <p
                                  className="mt-1 max-w-[18rem] truncate text-xs text-red-500"
                                  title={task.lastRun.error}
                                >
                                  {task.lastRun.error}
                                </p>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-brand-charcoal/70">
                      {task.lastRun
                        ? formatDuration(task.lastRun.startedAt, task.lastRun.finishedAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canRun ? (
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Play className="h-3.5 w-3.5" />}
                          disabled={task.lastRun ? runStatus(task.lastRun) === "RUNNING" : false}
                          onClick={() => setTriggerTarget({ name: task.name, key: task.key })}
                        >
                          {task.lastRun && runStatus(task.lastRun) === "RUNNING"
                            ? "运行中"
                            : "手动执行"}
                        </Button>
                      ) : (
                        <span className="text-xs text-brand-charcoal/65">只读</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !loadError && tasks.length > 0 && (
        <>
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-sm font-medium text-brand-charcoal">任务列表</h2>
            <span className="text-xs text-brand-charcoal/65">共 {tasks.length} 个任务</span>
          </div>
          <MobileList>
            {tasks.map((task) => (
              <MobileListCard key={task.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-brand-charcoal">{task.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-brand-charcoal/65">
                      {task.cronExpression}
                    </p>
                  </div>
                  {!task.lastRun ? (
                    <Badge variant="secondary" className="shrink-0">
                      未运行
                    </Badge>
                  ) : (
                    <Badge
                      variant={STATUS_META[runStatus(task.lastRun)].variant}
                      className="shrink-0"
                    >
                      {STATUS_META[runStatus(task.lastRun)].label}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
                  <span>最近：{task.lastRun ? formatDateTime(task.lastRun.startedAt) : "—"}</span>
                  <span>
                    耗时：
                    {task.lastRun
                      ? formatDuration(task.lastRun.startedAt, task.lastRun.finishedAt)
                      : "—"}
                  </span>
                  {task.lastRun && (
                    <span className="col-span-2 text-brand-charcoal/65">
                      {triggerLabel(task.lastRun.trigger)}
                    </span>
                  )}
                </div>
                {task.lastRun && task.lastRun.error && (
                  <p className="mt-1 line-clamp-2 text-xs text-red-500" title={task.lastRun.error}>
                    {task.lastRun.error}
                  </p>
                )}
                <div className="mt-2 flex justify-end border-t border-brand-charcoal/10 pt-2">
                  {canRun ? (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Play className="h-3.5 w-3.5" />}
                      disabled={task.lastRun ? runStatus(task.lastRun) === "RUNNING" : false}
                      onClick={() => setTriggerTarget({ name: task.name, key: task.key })}
                    >
                      {task.lastRun && runStatus(task.lastRun) === "RUNNING"
                        ? "运行中"
                        : "手动执行"}
                    </Button>
                  ) : (
                    <span className="text-xs text-brand-charcoal/65">只读</span>
                  )}
                </div>
              </MobileListCard>
            ))}
          </MobileList>
        </>
      )}

      {/* 最近运行记录 */}
      <div className="overflow-hidden rounded-2xl border border-brand-charcoal/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-charcoal/10 px-4 py-3">
          <h2 className="text-sm font-medium text-brand-charcoal">最近运行记录</h2>
          <div className="flex items-center gap-2">
            <select
              aria-label="按运行状态筛选"
              className="rounded-lg border border-brand-charcoal/20 bg-white px-2 py-1 text-xs text-brand-charcoal"
              value={runFilter}
              onChange={(event) => setRunFilter(event.target.value as "" | CronRunStatus)}
            >
              <option value="">全部状态</option>
              <option value="RUNNING">运行中</option>
              <option value="SUCCESS">成功</option>
              <option value="FAILED">失败</option>
              <option value="TIMEOUT">超时</option>
              <option value="SKIPPED">已跳过</option>
            </select>
            <span className="text-xs text-brand-charcoal/65">最近 {recentRuns.length} 条</span>
          </div>
        </div>
        {recentRuns.length === 0 ? (
          <p className="py-10 text-center text-sm text-brand-charcoal/65">暂无运行记录</p>
        ) : (
          <div className="divide-y divide-brand-charcoal/10">
            {recentRuns.map((run) => {
              const status = runStatus(run);
              const meta = STATUS_META[status];
              return (
                <div key={run.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="truncate text-sm font-medium text-brand-charcoal/80">
                        {run.taskName}
                      </span>
                      <span className="text-xs text-brand-charcoal/65">
                        {triggerLabel(run.trigger)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-xs text-brand-charcoal/65">
                        {formatDateTime(run.startedAt)} ·{" "}
                        {formatDuration(run.startedAt, run.finishedAt)}
                      </span>
                      {canRun && status !== "RUNNING" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTriggerTarget({
                              name: run.taskName,
                              key: run.taskKey ?? "",
                              sourceRunId: run.id,
                            })
                          }
                        >
                          重跑
                        </Button>
                      )}
                    </div>
                  </div>
                  {run.error && (
                    <p className="mt-1 line-clamp-2 text-xs text-red-500" title={run.error}>
                      {run.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 手动触发确认 */}
      <ConfirmDialog
        open={!!triggerTarget}
        onClose={() => setTriggerTarget(null)}
        onConfirm={handleTrigger}
        title="手动执行定时任务"
        type="warning"
        description={`确定立即执行「${triggerTarget?.name}」吗？任务将在当前请求内同步执行，可能耗时较长。`}
        confirmText="确认执行"
        loading={triggering}
      />
      {totpModal}
    </div>
  );
}
