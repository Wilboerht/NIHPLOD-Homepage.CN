"use client";

/**
 * 账号注销申请管理页
 * - 注销申请列表（默认展示执行失败 FAILED，可切换状态筛选；手机号脱敏）
 * - FAILED 申请支持人工重试：同步执行注销任务并立即返回结果
 *   （重试为不可逆操作，需 users:security:write 权限 + 二次确认）
 */
import { useCallback, useEffect, useState } from "react";
import { UserX, RefreshCw, RotateCw, Info, AlertCircle } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { cn } from "@/lib/utils";

type DeletionStatus = "PENDING" | "RUNNING" | "CANCELLED" | "COMPLETED" | "FAILED";

interface DeletionItem {
  id: string;
  userId: string;
  status: DeletionStatus;
  reason: string | null;
  requestedAt: string;
  scheduledAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
  attempts: number;
  lastError: string | null;
  userPhone: string | null;
  userNickname: string | null;
  userStatus: string | null;
}

const STATUS_TABS: { key: DeletionStatus; label: string }[] = [
  { key: "FAILED", label: "执行失败" },
  { key: "PENDING", label: "冷静期" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CANCELLED", label: "已撤回" },
  { key: "RUNNING", label: "执行中" },
];

const STATUS_BADGES: Record<DeletionStatus, { label: string; className: string }> = {
  FAILED: { label: "失败", className: "bg-red-50 text-red-600" },
  PENDING: { label: "冷静期", className: "bg-amber-50 text-amber-700" },
  RUNNING: { label: "执行中", className: "bg-blue-50 text-blue-600" },
  COMPLETED: { label: "已完成", className: "bg-emerald-50 text-emerald-600" },
  CANCELLED: { label: "已撤回", className: "bg-brand-charcoal/5 text-brand-charcoal/50" },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

export default function AdminAccountDeletionsPage() {
  return (
    <RequirePermission permission="users:read">
      <AdminAccountDeletionsContent />
    </RequirePermission>
  );
}

function AdminAccountDeletionsContent() {
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canRetry = canAdmin("users:security:write");
  const [status, setStatus] = useState<DeletionStatus>("FAILED");
  const [items, setItems] = useState<DeletionItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<DeletionItem | null>(null);
  const [forceRetry, setForceRetry] = useState(false);

  const fetchItems = useCallback(async (targetStatus: DeletionStatus, targetPage: number) => {
    setLoading(true);
    try {
      const data = await apiGet<{
        items: DeletionItem[];
        pagination: { totalPages: number };
      }>("/api/admin/account-deletions", {
        status: targetStatus,
        page: targetPage,
        pageSize: 20,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deferInEffect(() => fetchItems(status, page));
  }, [status, page, fetchItems]);

  const handleRetry = async (item: DeletionItem, force: boolean) => {
    setActioningId(item.id);
    try {
      const data = await apiPost<{ status: string; message: string }>(
        "/api/admin/account-deletions",
        { id: item.id, ...(force ? { force: true } : {}) }
      );
      if (data.status === "completed") {
        success(data.message);
      } else {
        showError(data.message);
      }
      setRetryTarget(null);
      setForceRetry(false);
      fetchItems(status, page);
    } catch (e) {
      // 失败（如达到重试上限返回 409）时保留弹窗，便于勾选「强制重试」后再次提交
      showError(e instanceof ApiError ? e.message : "重试失败");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-brand-primary" />
            注销申请管理
          </span>
        }
        description="用户自助注销申请（冷静期 → 定时任务匿名化执行）；执行失败的申请可在此人工重试"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => fetchItems(status, page)}
          >
            刷新
          </Button>
        }
      />

      {/* 说明 */}
      <div className="flex items-start gap-2 rounded-xl border border-brand-charcoal/10 bg-white px-4 py-3 text-sm text-brand-charcoal/60">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-charcoal/40" />
        <p>
          重试会立即同步执行注销任务（撤销全部会话与子站授权、解绑第三方身份、匿名化个人数据），
          操作不可逆。连续失败达到上限的申请不会自动重试，需排查失败原因后在此人工处理。
        </p>
      </div>

      {/* 状态切换 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              status === tab.key
                ? "border-brand-charcoal bg-brand-charcoal text-white"
                : "border-brand-charcoal/15 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/30"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表（移动端卡片） */}
      <MobileList
        loading={loading}
        error={
          loadError ? (
            <>
              <p className="text-red-500">加载失败</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fetchItems(status, page)}
              >
                重试
              </Button>
            </>
          ) : undefined
        }
        empty={<Empty title="暂无记录" description="当前状态下没有注销申请" />}
      >
        {items.map((item) => (
          <MobileListCard key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-charcoal">
                  {item.userNickname || "未设置昵称"}
                </p>
                <p className="truncate font-mono text-xs text-brand-charcoal/40">
                  {item.userPhone || item.userId}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  STATUS_BADGES[item.status].className
                )}
              >
                {STATUS_BADGES[item.status].label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/60">
              <span>申请：{formatDateTime(item.requestedAt)}</span>
              <span>执行：{formatDateTime(item.scheduledAt)}</span>
              <span>已尝试：{item.attempts} 次</span>
              {item.status === "CANCELLED" && item.cancelledAt && (
                <span>撤回：{formatDateTime(item.cancelledAt)}</span>
              )}
              {item.status === "COMPLETED" && item.completedAt && (
                <span>完成：{formatDateTime(item.completedAt)}</span>
              )}
              {item.reason && <span className="col-span-2">注销原因：{item.reason}</span>}
            </div>
            {item.status === "FAILED" && item.lastError && (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
                {item.lastError}
              </p>
            )}
            <div className="mt-2 flex justify-end border-t border-brand-charcoal/10 pt-2">
              {item.status === "FAILED" ? (
                canRetry ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={actioningId === item.id}
                    disabled={actioningId !== null && actioningId !== item.id}
                    leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                    onClick={() => setRetryTarget(item)}
                  >
                    重试
                  </Button>
                ) : (
                  <span className="text-xs text-brand-charcoal/40">只读</span>
                )
              ) : (
                <span className="text-xs text-brand-charcoal/40">—</span>
              )}
            </div>
          </MobileListCard>
        ))}
      </MobileList>

      {/* 列表（桌面端表格） */}
      <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-red-50 p-4">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-brand-charcoal">加载失败</h2>
            <p className="mt-1 text-sm text-brand-charcoal/50">
              无法获取注销申请列表，请检查网络连接
            </p>
            <button
              onClick={() => {
                setLoadError(false);
                fetchItems(status, page);
              }}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
            >
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <Empty className="h-64" title="暂无记录" description="当前状态下没有注销申请" />
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs uppercase text-brand-charcoal/50">
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">注销原因</th>
                <th className="px-4 py-3 font-medium">申请时间</th>
                <th className="px-4 py-3 font-medium">预定执行</th>
                {status === "CANCELLED" && <th className="px-4 py-3 font-medium">撤回时间</th>}
                {status === "COMPLETED" && <th className="px-4 py-3 font-medium">完成时间</th>}
                <th className="px-4 py-3 font-medium">已尝试</th>
                <th className="px-4 py-3 font-medium">失败原因</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-brand-charcoal/8 divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-brand-charcoal/[0.02]">
                  <td className="px-4 py-3">
                    <p className="text-brand-charcoal/80">{item.userNickname || "未设置昵称"}</p>
                    <p className="font-mono text-xs text-brand-charcoal/40">
                      {item.userPhone || item.userId}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        STATUS_BADGES[item.status].className
                      )}
                    >
                      {STATUS_BADGES[item.status].label}
                    </span>
                  </td>
                  <td className="max-w-[12rem] px-4 py-3">
                    <p
                      className="truncate text-xs text-brand-charcoal/50"
                      title={item.reason ?? undefined}
                    >
                      {item.reason || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/70">
                    {formatDateTime(item.requestedAt)}
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/70">
                    {formatDateTime(item.scheduledAt)}
                  </td>
                  {status === "CANCELLED" && (
                    <td className="px-4 py-3 text-brand-charcoal/70">
                      {formatDateTime(item.cancelledAt)}
                    </td>
                  )}
                  {status === "COMPLETED" && (
                    <td className="px-4 py-3 text-brand-charcoal/70">
                      {formatDateTime(item.completedAt)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-brand-charcoal/70">{item.attempts} 次</td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <p
                      className="truncate text-xs text-brand-charcoal/50"
                      title={item.lastError ?? undefined}
                    >
                      {item.lastError || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {item.status === "FAILED" ? (
                      canRetry ? (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={actioningId === item.id}
                          disabled={actioningId !== null && actioningId !== item.id}
                          leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                          onClick={() => setRetryTarget(item)}
                        >
                          重试
                        </Button>
                      ) : (
                        <span className="text-xs text-brand-charcoal/40">只读</span>
                      )
                    ) : (
                      <span className="text-xs text-brand-charcoal/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-brand-charcoal/50">
          <span>
            第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 重试确认 */}
      <ConfirmDialog
        open={!!retryTarget}
        onClose={() => {
          setRetryTarget(null);
          setForceRetry(false);
        }}
        onConfirm={() => {
          if (retryTarget) return handleRetry(retryTarget, forceRetry);
        }}
        title="人工重试注销"
        description={`确定立即对用户「${retryTarget?.userNickname || retryTarget?.userPhone || retryTarget?.userId}」重新执行注销吗？该操作将匿名化其个人数据且不可恢复。`}
        confirmText="立即执行"
        type="danger"
        loading={actioningId === retryTarget?.id}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <input
            type="checkbox"
            checked={forceRetry}
            onChange={(e) => setForceRetry(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-amber-800">
              强制重试（忽略重试次数上限）
            </span>
            <span className="mt-0.5 block text-xs text-amber-600">
              该申请已自动重试 {retryTarget?.attempts ?? 0}{" "}
              次。勾选后将重置重试计数并立即执行，请先排查失败原因。
            </span>
          </span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
