"use client";

/**
 * 定时任务监控页面（仅超级管理员）
 * - 展示任务清单与最近运行状态（成功/失败/耗时）
 * - 支持手动触发（写审计 run_cron_task）
 */
import { useCallback, useEffect, useState } from "react";
import { Timer, RefreshCw, Play, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";

interface TaskLastRun {
  startedAt: string;
  finishedAt: string;
  success: boolean;
  trigger: string;
  error: string | null;
}

interface CronTask {
  name: string;
  cronExpression: string;
  lastRun: TaskLastRun | null;
}

interface CronRun {
  id: string;
  taskName: string;
  trigger: string;
  success: boolean;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
  const { can: canAdmin } = useAdminPermissions();
  const canRun = canAdmin("cron:run");
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [recentRuns, setRecentRuns] = useState<CronRun[]>([]);
  const [cronEnabled, setCronEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [triggerTarget, setTriggerTarget] = useState<CronTask | null>(null);
  const [triggering, setTriggering] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{
        cronEnabled: boolean;
        tasks: CronTask[];
        recentRuns: CronRun[];
      }>("/api/admin/cron-tasks");
      setTasks(data.tasks);
      setRecentRuns(data.recentRuns);
      setCronEnabled(data.cronEnabled);
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      showError(err instanceof Error ? err.message : "加载定时任务失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchTasks);
  }, [fetchTasks]);

  const handleTrigger = async () => {
    if (!triggerTarget) return;
    setTriggering(true);
    try {
      const data = await apiPost<{ message: string }>("/api/admin/cron-tasks", {
        taskName: triggerTarget.name,
      });
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
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-medium text-brand-charcoal">
            <Timer className="h-6 w-6 text-brand-primary" />
            定时任务
          </h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            查看后台任务运行状态，支持手动触发；任务失败会自动记录原因
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchTasks}
        >
          刷新
        </Button>
      </div>

      {/* 未启用提示 */}
      {!cronEnabled && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            当前进程内定时任务未启用（ENABLE_LOCAL_CRON 未设为 true），以下任务不会自动运行，
            但仍可手动触发；生产环境请确认由外部调度或本地 cron 承担。
          </p>
        </div>
      )}

      {/* 任务列表 */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <p className="text-sm text-red-500">加载定时任务失败</p>
          <Button variant="outline" size="sm" onClick={fetchTasks}>
            重试
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <Empty className="h-64" title="暂无定时任务" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs uppercase text-brand-charcoal/50">
                <th className="px-4 py-3 font-medium">任务</th>
                <th className="px-4 py-3 font-medium">调度表达式</th>
                <th className="px-4 py-3 font-medium">最近运行</th>
                <th className="px-4 py-3 font-medium">结果</th>
                <th className="px-4 py-3 font-medium">耗时</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-charcoal/8">
              {tasks.map((task) => (
                <tr key={task.name} className="hover:bg-brand-charcoal/[0.02]">
                  <td className="px-4 py-3 font-medium text-brand-charcoal">{task.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-charcoal/60">
                    {task.cronExpression}
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/70">
                    {task.lastRun ? formatDateTime(task.lastRun.startedAt) : "从未运行"}
                    {task.lastRun && (
                      <span className="ml-1 text-xs text-brand-charcoal/40">
                        ({task.lastRun.trigger === "manual" ? "手动" : "自动"})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!task.lastRun ? (
                      <span className="text-xs text-brand-charcoal/40">—</span>
                    ) : task.lastRun.success ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        成功
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-red-500"
                        title={task.lastRun.error ?? undefined}
                      >
                        <XCircle className="h-4 w-4" />
                        失败
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/60">
                    {task.lastRun
                      ? formatDuration(task.lastRun.startedAt, task.lastRun.finishedAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canRun ? (
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Play className="h-3.5 w-3.5" />}
                        onClick={() => setTriggerTarget(task)}
                      >
                        手动执行
                      </Button>
                    ) : (
                      <span className="text-xs text-brand-charcoal/40">只读</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 最近运行记录 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-brand-charcoal">最近运行记录</h2>
        {recentRuns.length === 0 ? (
          <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无运行记录</p>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-charcoal/10 px-4 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {run.success ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                  )}
                  <span className="truncate text-sm text-brand-charcoal/80">{run.taskName}</span>
                  <span className="text-xs text-brand-charcoal/40">
                    {run.trigger === "manual" ? "手动" : "自动"}
                  </span>
                  {!run.success && run.error && (
                    <span className="max-w-[24rem] truncate text-xs text-red-500" title={run.error}>
                      {run.error}
                    </span>
                  )}
                </div>
                <span className="text-xs text-brand-charcoal/40">
                  {formatDateTime(run.startedAt)} · {formatDuration(run.startedAt, run.finishedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 手动触发确认 */}
      <ConfirmDialog
        open={!!triggerTarget}
        onClose={() => setTriggerTarget(null)}
        onConfirm={handleTrigger}
        title="手动执行定时任务"
        description={`确定立即执行「${triggerTarget?.name}」吗？任务将在当前请求内同步执行，可能耗时较长。`}
        confirmText="确认执行"
        loading={triggering}
      />
    </div>
  );
}
