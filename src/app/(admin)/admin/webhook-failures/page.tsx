"use client";

/**
 * Webhook / Backchannel 失败补偿队列页面（仅超级管理员）
 * - 资料变更 Webhook 与 Backchannel Logout 的失败补偿队列查看
 * - 支持立即重投（忽略退避时间）与丢弃单条记录
 */
import { useCallback, useEffect, useState } from "react";
import { Webhook, RefreshCw, RotateCw, Trash2, Info, AlertCircle } from "lucide-react";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
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
}

const KIND_TABS: { key: Kind; label: string }[] = [
  { key: "webhook", label: "资料变更 Webhook" },
  { key: "backchannel", label: "Backchannel Logout" },
];

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
  const { can: canAdmin } = useAdminPermissions();
  const canWrite = canAdmin("webhooks:write");
  const kind: Kind = get("kind", "webhook") === "backchannel" ? "backchannel" : "webhook";
  const page = getNumber("page", 1);
  const [items, setItems] = useState<FailureItem[]>([]);
  const [counts, setCounts] = useState<Record<Kind, number>>({ webhook: 0, backchannel: 0 });
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<FailureItem | null>(null);
  const [dropTarget, setDropTarget] = useState<FailureItem | null>(null);

  const fetchItems = useCallback(async (targetKind: Kind, targetPage: number) => {
    setLoading(true);
    try {
      const data = await apiGet<{
        items: FailureItem[];
        pagination: { totalPages: number };
        counts: Record<Kind, number>;
      }>("/api/admin/webhook-failures", {
        kind: targetKind,
        page: targetPage,
        pageSize: 20,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
      setCounts(data.counts);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const data = await apiPost<{ status: string; message: string; error: string | null }>(
        "/api/admin/webhook-failures",
        { kind, id: item.id, action: "retry" }
      );
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
      const data = await apiPost<{ message: string }>("/api/admin/webhook-failures", {
        kind,
        id: item.id,
        action: "delete",
      });
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            <Webhook className="h-5 w-5 text-brand-primary" />
            通知失败队列
          </>
        }
        description="资料变更 Webhook 与 Backchannel Logout 投递失败记录（cron 自动退避重投，最多 10 次）"
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

      {/* 说明 */}
      <div className="flex items-start gap-2 rounded-xl border border-brand-charcoal/10 bg-white px-4 py-3 text-sm text-brand-charcoal/70">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-charcoal/65" />
        <p>
          重投会立即向目标地址发起一次投递（忽略退避时间）；失败则按指数退避安排下次自动重试。
          达到上限或目标已不可用时记录会被丢弃。
        </p>
      </div>

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
                : "border-brand-charcoal/15 bg-white text-brand-charcoal/70 hover:border-brand-charcoal/30"
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

      {/* 移动端卡片 */}
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
                onClick={() => fetchItems(kind, page)}
              >
                重试
              </Button>
            </>
          ) : undefined
        }
        empty="当前没有投递失败的记录"
        isEmpty={!loading && !loadError && items.length === 0}
      >
        {items.map((item) => (
          <MobileListCard key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-charcoal">{item.clientName || "—"}</p>
                <p className="truncate font-mono text-xs text-brand-charcoal/65">{item.clientId}</p>
              </div>
              <span className="shrink-0 text-xs text-brand-charcoal/65">{item.attempts} 次</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
              <span className="col-span-2 truncate">
                用户：{item.userNickname || item.userPhone || item.userId}
              </span>
              <span>下次：{formatDateTime(item.nextRetryAt)}</span>
              <span>首次：{formatDateTime(item.createdAt)}</span>
              <span className="col-span-2">
                载荷：{item.hasPayload ? "已隐藏（含用户资料）" : "—"}
              </span>
            </div>
            <div className="mt-2 flex justify-end gap-2 border-t border-brand-charcoal/10 pt-2">
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
                    className="text-red-600 hover:bg-red-50"
                    disabled={actioningId !== null}
                    onClick={() => setDropTarget(item)}
                  >
                    丢弃
                  </Button>
                </>
              ) : (
                <span className="text-xs text-brand-charcoal/65">只读</span>
              )}
            </div>
          </MobileListCard>
        ))}
      </MobileList>

      {/* 桌面端表格 */}
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
            <p className="mt-1 text-sm text-brand-charcoal/65">无法获取失败队列，请检查网络连接</p>
            <button
              onClick={() => {
                setLoadError(false);
                fetchItems(kind, page);
              }}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
            >
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <Empty className="h-64" title="队列为空" description="当前没有投递失败的记录" />
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs uppercase text-brand-charcoal/65">
                <th className="px-4 py-3 font-medium">目标 Client</th>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">已重试</th>
                <th className="px-4 py-3 font-medium">下次重试</th>
                <th className="px-4 py-3 font-medium">首次失败</th>
                <th className="px-4 py-3 font-medium">载荷摘要</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-brand-charcoal/8 divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-brand-charcoal/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-brand-charcoal">{item.clientName || "—"}</p>
                    <p className="font-mono text-xs text-brand-charcoal/65">{item.clientId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-brand-charcoal/80">{item.userNickname || "未设置昵称"}</p>
                    <p className="font-mono text-xs text-brand-charcoal/65">
                      {item.userPhone || item.userId}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/70">{item.attempts} 次</td>
                  <td className="px-4 py-3 text-brand-charcoal/70">
                    {formatDateTime(item.nextRetryAt)}
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/70">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <p className="truncate text-xs text-brand-charcoal/65">
                      {item.hasPayload ? "已隐藏（含用户资料）" : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <div className="flex gap-2">
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
                          className="text-red-600 hover:bg-red-50"
                          disabled={actioningId !== null}
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setDropTarget(item)}
                        >
                          丢弃
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-brand-charcoal/65">只读</span>
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
        <div className="flex items-center justify-between text-sm text-brand-charcoal/65">
          <span>
            第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) }, { resetPage: false })}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => update({ page: String(page + 1) }, { resetPage: false })}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 重投确认 */}
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
    </div>
  );
}
