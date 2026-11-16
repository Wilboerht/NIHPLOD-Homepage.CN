"use client";

/**
 * Webhook / Backchannel 失败补偿队列页面（仅超级管理员）
 * - 资料变更 Webhook 与 Backchannel Logout 的失败补偿队列查看
 * - 支持立即重投（忽略退避时间）与丢弃单条记录
 */
import { useCallback, useEffect, useState } from "react";
import { Webhook, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { DataTable, type Column } from "@/components/admin";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { cn } from "@/lib/utils";

type Kind = "webhook" | "backchannel";

interface FailureItem {
  id: string;
  userId: string;
  userPhone: string | null;
  userNickname: string | null;
  clientId: string;
  clientName: string | null;
  attempts: number;
  nextRetryAt: string;
  createdAt: string;
  hasPayload: boolean;
  lastError: string | null;
}

const KIND_TABS: { key: Kind; label: string }[] = [
  { key: "webhook", label: "资料变更 Webhook" },
  { key: "backchannel", label: "Backchannel Logout" },
];

function QueueInfoHint() {
  return (
    <details className="group relative inline-block">
      <summary
        className="flex cursor-pointer list-none items-center rounded-full p-1 text-brand-primary transition-colors hover:bg-brand-primary/5 [&::-webkit-details-marker]:hidden"
        aria-label="查看队列处理说明"
        title="查看队列处理说明"
      >
        <Webhook className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-3 text-xs leading-relaxed text-brand-charcoal/80 shadow-popover">
        <p className="font-medium text-brand-charcoal">队列处理说明</p>
        <p className="mt-1.5">
          重投会立即向目标地址发起一次投递（忽略退避时间）；失败则按指数退避安排下次自动重试。
        </p>
        <p className="mt-2">达到上限或目标已不可用时，记录会被丢弃且不再自动重投。</p>
      </div>
    </details>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

export default function AdminWebhookFailuresPage() {
  return (
    <RequirePermission permission="webhooks:read">
      <AdminWebhookFailuresContent />
    </RequirePermission>
  );
}

function AdminWebhookFailuresContent() {
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("webhooks:write");
  const kind: Kind = get("kind", "webhook") === "backchannel" ? "backchannel" : "webhook";
  const page = getNumber("page", 1);
  const [items, setItems] = useState<FailureItem[]>([]);
  const [counts, setCounts] = useState<Record<Kind, number>>({ webhook: 0, backchannel: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<FailureItem | null>(null);
  const [dropTarget, setDropTarget] = useState<FailureItem | null>(null);

  const takeLatest = useLatestRequest();
  const fetchItems = useCallback(
    async (targetKind: Kind, targetPage: number) => {
      const isLatest = takeLatest();
      setLoading(true);
      try {
        const data = await apiGet<{
          items: FailureItem[];
          pagination: { total: number; totalPages: number };
          counts: Record<Kind, number>;
        }>("/api/admin/webhook-failures", {
          kind: targetKind,
          page: targetPage,
          pageSize: 20,
        });
        if (!isLatest()) return;
        setItems(data.items);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
        setCounts(data.counts);
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
    deferInEffect(() => fetchItems(kind, page));
  }, [kind, page, fetchItems]);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, totalPages, update]);

  const handleRetry = async (item: FailureItem) => {
    setActioningId(item.id);
    try {
      const submit = () =>
        apiPost<{ status: string; message: string; error: string | null }>(
          "/api/admin/webhook-failures",
          { kind, id: item.id, action: "retry" }
        );
      let data: { status: string; message: string; error: string | null };
      try {
        data = await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        data = await submit();
      }
      if (data.status === "failed") {
        // 附带目标端返回的具体错误（HTTP 状态/错误内容），便于定位失败原因
        showError(data.error ? `${data.message}：${data.error}` : data.message);
        fetchItems(kind, page);
      } else {
        success(data.message);
        if (items.length === 1 && page > 1) {
          update({ page: String(page - 1) }, { resetPage: false });
        } else {
          fetchItems(kind, page);
        }
      }
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "重投失败");
    } finally {
      setActioningId(null);
      setRetryTarget(null);
    }
  };

  const handleDrop = async (item: FailureItem) => {
    setActioningId(item.id);
    try {
      const submit = () =>
        apiPost<{ message: string }>("/api/admin/webhook-failures", {
          kind,
          id: item.id,
          action: "delete",
        });

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
      if (items.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchItems(kind, page);
      }
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "丢弃失败");
    } finally {
      setActioningId(null);
      setDropTarget(null);
    }
  };

  const columns: Column<FailureItem>[] = [
    {
      key: "clientName",
      title: "目标 Client",
      width: "200px",
      render: (_, item) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-charcoal">{item.clientName || "—"}</p>
          <p className="truncate font-mono text-xs text-ink-muted">{item.clientId}</p>
        </div>
      ),
    },
    {
      key: "userId",
      title: "用户",
      width: "200px",
      render: (_, item) => (
        <div className="min-w-0">
          <p className="truncate text-brand-charcoal/80">{item.userNickname || "未设置昵称"}</p>
          <p className="truncate font-mono text-xs text-ink-muted">
            {item.userPhone || item.userId}
          </p>
        </div>
      ),
    },
    {
      key: "attempts",
      title: "已重试",
      width: "80px",
      numeric: true,
      render: (value) => `${value ?? 0} 次`,
    },
    {
      key: "nextRetryAt",
      title: "下次重试",
      width: "160px",
      render: (value) => (
        <span className="text-xs text-brand-charcoal/70">{formatDateTime(String(value))}</span>
      ),
    },
    {
      key: "createdAt",
      title: "首次失败",
      width: "160px",
      render: (value) => (
        <span className="text-xs text-brand-charcoal/70">{formatDateTime(String(value))}</span>
      ),
    },
    {
      key: "hasPayload",
      title: "载荷摘要",
      width: "220px",
      render: (_, item) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-muted">
            {item.hasPayload ? "已保存（含用户资料）" : "无"}
          </p>
          {item.lastError ? (
            <p className="truncate text-xs text-status-danger-fg" title={item.lastError}>
              {item.lastError}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "id",
      title: "操作",
      width: "180px",
      align: "right",
      render: (_, item) =>
        canWrite ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              loading={actioningId === item.id}
              disabled={actioningId !== null && actioningId !== item.id}
              leftIcon={<RotateCw className="h-3.5 w-3.5" />}
              onClick={() => setRetryTarget(item)}
            >
              重投
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-status-danger-fg hover:bg-status-danger-soft"
              disabled={actioningId !== null}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setDropTarget(item)}
            >
              丢弃
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-muted">只读</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知失败队列"
        description="查看资料变更 Webhook 与 Backchannel Logout 的投递失败记录。"
        accessory={<QueueInfoHint />}
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => fetchItems(kind, page)}
          >
            刷新
          </Button>
        }
      />

      <AdminHubTabs section="notifications" />

      {/* 队列切换 */}
      <div className="flex flex-wrap gap-2">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={kind === tab.key}
            onClick={() => update({ kind: tab.key })}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
              kind === tab.key
                ? "border-brand-charcoal bg-brand-charcoal text-white"
                : "border-line-strong bg-white text-brand-charcoal/70 hover:border-brand-charcoal/30"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                kind === tab.key ? "bg-white/20" : "bg-brand-charcoal/5"
              )}
            >
              {counts[tab.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

            <DataTable
        columns={columns}
        data={items}
        loading={loading}
        error={loadError ? "无法获取失败队列，请检查网络连接" : null}
        onRetry={() => {
          setLoadError(false);
          fetchItems(kind, page);
        }}
        rowKey="id"
        density="compact"
        tableLayout="fixed"
        minWidth="1000px"
        emptyText="队列为空，当前没有投递失败的记录"
        ariaLabel="通知失败队列"
        pagination={{
          page,
          pageSize: 20,
          total,
          onChange: (nextPage) => update({ page: String(nextPage) }, { resetPage: false }),
        }}
        mobileCard={(item) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-charcoal">{item.clientName || "—"}</p>
                <p className="truncate font-mono text-xs text-ink-muted">{item.clientId}</p>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">{item.attempts} 次</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
              <span className="col-span-2 truncate">
                用户：{item.userNickname || item.userPhone || item.userId}
              </span>
              <span>下次：{formatDateTime(item.nextRetryAt)}</span>
              <span>首次：{formatDateTime(item.createdAt)}</span>
              <span className="col-span-2">
                载荷：{item.hasPayload ? "已保存（含用户资料）" : "无"}
              </span>
              {item.lastError && (
                <span className="col-span-2 text-status-danger-fg" title={item.lastError}>
                  最近错误：{item.lastError}
                </span>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-2">
              {canWrite ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={actioningId === item.id}
                    disabled={actioningId !== null && actioningId !== item.id}
                    leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                    onClick={() => setRetryTarget(item)}
                  >
                    重投
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-status-danger-fg hover:bg-status-danger-soft"
                    disabled={actioningId !== null}
                    onClick={() => setDropTarget(item)}
                  >
                    丢弃
                  </Button>
                </>
              ) : (
                <span className="text-xs text-ink-muted">只读</span>
              )}
            </div>
          </div>
        )}
      />

<ConfirmDialog
        open={!!retryTarget}
        onClose={() => setRetryTarget(null)}
        onConfirm={() => {
          if (retryTarget) return handleRetry(retryTarget);
        }}
        title="立即重投"
        type="warning"
        description={`确定立即向「${retryTarget?.clientName || retryTarget?.clientId}」重投该通知吗？`}
        confirmText="立即重投"
        loading={actioningId === retryTarget?.id}
      />

      {/* 丢弃确认 */}
      <ConfirmDialog
        open={!!dropTarget}
        onClose={() => setDropTarget(null)}
        onConfirm={() => {
          if (dropTarget) return handleDrop(dropTarget);
        }}
        title="丢弃失败记录"
        description="确定丢弃该记录吗？丢弃后不再自动重投，目标端将收不到本次通知。"
        confirmText="确认丢弃"
        type="danger"
        loading={actioningId === dropTarget?.id}
      />
      {totpModal}
    </div>
  );
}
