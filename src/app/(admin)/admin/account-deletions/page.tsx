"use client";

/**
 * 账号注销申请管理页
 * - 注销申请列表（默认展示执行失败 FAILED，可切换状态筛选；手机号脱敏）
 * - FAILED 申请支持人工重试：同步执行注销任务并立即返回结果
 *   （重试为不可逆操作，需 users:delete 权限 + 二次确认）
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCw } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useLatestRequest } from "@/hooks/useLatestRequest";
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
  FAILED: { label: "失败", className: "bg-status-danger-soft text-status-danger-fg" },
  PENDING: { label: "冷静期", className: "bg-status-warning-soft text-status-warning-strong" },
  RUNNING: { label: "执行中", className: "bg-status-info-soft text-status-info-fg" },
  COMPLETED: { label: "已完成", className: "bg-status-success-soft text-status-success-fg" },
  CANCELLED: { label: "已撤回", className: "bg-brand-charcoal/5 text-ink-muted" },
};

function DeletionWarningHint() {
  return (
    <details className="group relative inline-block">
      <summary
        className="flex cursor-pointer list-none items-center rounded-full p-1 text-status-warning-fg transition-colors hover:bg-status-warning-soft [&::-webkit-details-marker]:hidden"
        aria-label="查看注销任务执行说明"
        title="查看注销任务执行说明"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-status-warning-line bg-white p-3 text-xs leading-relaxed text-brand-charcoal/80 shadow-popover">
        <p className="font-medium text-status-warning-strong">注销任务执行说明</p>
        <p className="mt-1.5">
          重试会立即同步执行注销任务（撤销全部会话与子站授权、解绑第三方身份、匿名化个人数据），操作不可逆。
        </p>
        <p className="mt-2">连续失败达到上限的申请不会自动重试，需排查失败原因后在此人工处理。</p>
      </div>
    </details>
  );
}

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
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { can: canAdmin, role } = useAdminPermissions();
  const isOwnerActor = role === "owner";
  const { requireTotp, totpModal } = useTotpConfirm();
  const canRetry = canAdmin("users:delete") && (isOwnerActor || canAdmin("approvals:request"));
  const canCancel = canAdmin("users:delete");
  const statusParam = get("status", "FAILED");
  const status: DeletionStatus = STATUS_TABS.some((tab) => tab.key === statusParam)
    ? (statusParam as DeletionStatus)
    : "FAILED";
  const page = getNumber("page", 1);
  const [items, setItems] = useState<DeletionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<DeletionItem | null>(null);
  const [forceRetry, setForceRetry] = useState(false);
  const [retryReason, setRetryReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<DeletionItem | null>(null);

  const takeLatest = useLatestRequest();
  const fetchItems = useCallback(
    async (targetStatus: DeletionStatus, targetPage: number) => {
      const isLatest = takeLatest();
      setLoading(true);
      try {
        const data = await apiGet<{
          items: DeletionItem[];
          pagination: { total: number; totalPages: number };
        }>("/api/admin/account-deletions", {
          status: targetStatus,
          page: targetPage,
          pageSize: 20,
        });
        if (!isLatest()) return;
        setItems(data.items);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
        setLoadError(false);
      } catch {
        if (!isLatest()) return;
        setLoadError(true);
      } finally {
        if (isLatest()) setLoading(false);
      }
    },
    [takeLatest]
  );

  useEffect(() => {
    deferInEffect(() => fetchItems(status, page));
  }, [status, page, fetchItems]);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, totalPages, update]);

  const handleRetry = async (item: DeletionItem, force: boolean) => {
    if (retryReason.trim().length < 2) return;
    setActioningId(item.id);
    try {
      if (!isOwnerActor) {
        await apiPost("/api/admin/approvals", {
          policyKey: "user.delete",
          payload: { userId: item.userId },
          reason: retryReason.trim(),
        });
        window.dispatchEvent(new Event("admin:nav-counts-refresh"));
        success("已提交 owner 审批；审批通过后系统将重新执行注销");
        setRetryTarget(null);
        setForceRetry(false);
        fetchItems(status, page);
        return;
      }

      const submit = () =>
        apiPost<{ status: string; message: string }>("/api/admin/account-deletions", {
          id: item.id,
          reason: retryReason.trim(),
          ...(force ? { force: true } : {}),
        });

      let data: { status: string; message: string };
      try {
        data = await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) {
          setRetryTarget(null);
          return;
        }
        data = await submit();
      }
      if (data.status === "completed") {
        success(data.message);
      } else {
        showError(data.message);
      }
      setRetryTarget(null);
      setForceRetry(false);
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      if (data.status === "completed" && items.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchItems(status, page);
      }
    } catch (e) {
      // 失败（如达到重试上限返回 409）时保留弹窗，便于勾选「强制重试」后再次提交
      showError(e instanceof ApiError ? e.message : "重试失败");
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (item: DeletionItem) => {
    setActioningId(item.id);
    try {
      const submit = () => apiPost(`/api/admin/account-deletions/${item.id}/cancel`, {});
      try {
        await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        await submit();
      }
      success("注销申请已撤回");
      setCancelTarget(null);
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      fetchItems(status, page);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "撤回失败");
    } finally {
      setActioningId(null);
    }
  };

  const renderActions = (item: DeletionItem) => {
    if (item.status === "FAILED") {
      return canRetry ? (
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
        <span className="text-xs text-ink-muted">只读</span>
      );
    }
    if (item.status === "PENDING" && canCancel) {
      return (
        <Button
          variant="outline"
          size="sm"
          loading={actioningId === item.id}
          disabled={actioningId !== null && actioningId !== item.id}
          onClick={() => setCancelTarget(item)}
        >
          撤回申请
        </Button>
      );
    }
    return <span className="text-xs text-ink-muted">—</span>;
  };

  const columns: Column<DeletionItem>[] = [
    {
      key: "user",
      title: "用户",
      width: "220px",
      render: (_value, item) => (
        <div className="min-w-0">
          <p className="truncate text-brand-charcoal/80">
            {item.userNickname || "未设置昵称"}
          </p>
          <p className="truncate font-mono text-xs text-ink-muted">
            {item.userPhone || item.userId}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      title: "状态",
      width: "100px",
      render: (_value, item) => (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            STATUS_BADGES[item.status].className
          )}
        >
          {STATUS_BADGES[item.status].label}
        </span>
      ),
    },
    {
      key: "reason",
      title: "注销原因",
      width: "180px",
      render: (_value, item) => (
        <p className="truncate text-xs text-ink-muted" title={item.reason ?? undefined}>
          {item.reason || "—"}
        </p>
      ),
    },
    {
      key: "requestedAt",
      title: "申请时间",
      width: "170px",
      render: (_value, item) => (
        <span className="text-brand-charcoal/70">{formatDateTime(item.requestedAt)}</span>
      ),
    },
    {
      key: "scheduledAt",
      title: "预定执行",
      width: "170px",
      render: (_value, item) => (
        <span className="text-brand-charcoal/70">{formatDateTime(item.scheduledAt)}</span>
      ),
    },
    ...(status === "CANCELLED"
      ? [
          {
            key: "cancelledAt",
            title: "撤回时间",
            width: "170px",
            render: (_value: unknown, item: DeletionItem) => (
              <span className="text-brand-charcoal/70">
                {formatDateTime(item.cancelledAt)}
              </span>
            ),
          },
        ]
      : status === "COMPLETED"
        ? [
            {
              key: "completedAt",
              title: "完成时间",
              width: "170px",
              render: (_value: unknown, item: DeletionItem) => (
                <span className="text-brand-charcoal/70">
                  {formatDateTime(item.completedAt)}
                </span>
              ),
            },
          ]
        : []),
    {
      key: "attempts",
      title: "已尝试",
      width: "90px",
      numeric: true,
      render: (_value, item) => <span>{item.attempts} 次</span>,
    },
    {
      key: "lastError",
      title: "失败原因",
      width: "220px",
      render: (_value, item) => (
        <p className="truncate text-xs text-ink-muted" title={item.lastError ?? undefined}>
          {item.lastError || "—"}
        </p>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "110px",
      render: (_value, item) => renderActions(item),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="注销申请管理"
        description="查看冷静期、执行失败与已完成的注销申请。"
        accessory={<DeletionWarningHint />}
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

      {/* 状态切换 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={status === tab.key}
            onClick={() => update({ status: tab.key })}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              status === tab.key
                ? "border-brand-charcoal bg-brand-charcoal text-white"
                : "border-line-strong bg-white text-brand-charcoal/70 hover:border-brand-charcoal/30"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表（移动端卡片） */}
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        error={loadError ? "加载失败，请检查网络连接" : null}
        onRetry={() => {
          setLoadError(false);
          fetchItems(status, page);
        }}
        rowKey="id"
        minWidth="960px"
        emptyText="暂无记录"
        ariaLabel="注销申请列表"
        pagination={
          total > 0
            ? {
                page,
                pageSize: 20,
                total,
                onChange: (nextPage) =>
                  update({ page: String(nextPage) }, { resetPage: false }),
              }
            : undefined
        }
        mobileCard={(item) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-charcoal">
                  {item.userNickname || "未设置昵称"}
                </p>
                <p className="truncate font-mono text-xs text-ink-muted">
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
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
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
              <p className="mt-2 rounded-lg bg-status-danger-soft px-2 py-1.5 text-xs text-status-danger-fg">
                {item.lastError}
              </p>
            )}
            <div className="mt-2 flex justify-end border-t border-line pt-2">
              {renderActions(item)}
            </div>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!retryTarget}
        onClose={() => {
          setRetryTarget(null);
          setForceRetry(false);
          setRetryReason("");
        }}
        onConfirm={() => {
          if (retryTarget) return handleRetry(retryTarget, forceRetry);
        }}
        title="人工重试注销"
        description={`确定立即对用户「${retryTarget?.userNickname || retryTarget?.userPhone || retryTarget?.userId}」重新执行注销吗？该操作将匿名化其个人数据且不可恢复。`}
        confirmText="立即执行"
        confirmDisabled={retryReason.trim().length < 2}
        type="danger"
        loading={actioningId === retryTarget?.id}
      >
        <Input
          label="重试原因 / 工单号（必填）"
          value={retryReason}
          maxLength={200}
          onChange={(event) => setRetryReason(event.target.value)}
          placeholder="如：子站故障已恢复 / OPS-20261110-01"
        />
        {isOwnerActor && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-status-warning-line bg-status-warning-soft p-3">
            <input
              type="checkbox"
              checked={forceRetry}
              onChange={(e) => setForceRetry(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-status-warning-strong">
                强制重试（忽略重试次数上限）
              </span>
              <span className="mt-0.5 block text-xs text-status-warning-fg">
                该申请已自动重试 {retryTarget?.attempts ?? 0}{" "}
                次。勾选后将重置重试计数并立即执行，请先排查失败原因。
              </span>
            </span>
          </label>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => (cancelTarget ? handleCancel(cancelTarget) : undefined)}
        title="撤回注销申请"
        description={`确定撤回用户「${cancelTarget?.userNickname || cancelTarget?.userPhone || cancelTarget?.userId}」的注销申请吗？撤回后账号保持可用。`}
        confirmText="确认撤回"
        type="warning"
        loading={actioningId === cancelTarget?.id}
      />
      {totpModal}
    </div>
  );
}
