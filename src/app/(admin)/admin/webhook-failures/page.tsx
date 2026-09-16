"use client";

/**
 * Webhook / Backchannel 失败补偿队列页面（仅超级管理员）
 * - 资料变更 Webhook 与 Backchannel Logout 的失败补偿队列查看
 * - 支持立即重投（忽略退避时间）与丢弃单条记录
 */
import { useCallback, useEffect, useState } from "react";
import { Webhook, RefreshCw, RotateCw, Trash2, Info } from "lucide-react";
import { RequireAdminRole } from "@/components/admin/RequireAdminRole";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
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
  payload: unknown;
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
    <RequireAdminRole role="owner">
      <AdminWebhookFailuresContent />
    </RequireAdminRole>
  );
}

function AdminWebhookFailuresContent() {
  const { success, error: showError } = useToast();
  const [kind, setKind] = useState<Kind>("webhook");
  const [items, setItems] = useState<FailureItem[]>([]);
  const [counts, setCounts] = useState<Record<Kind, number>>({ webhook: 0, backchannel: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<FailureItem | null>(null);
  const [dropTarget, setDropTarget] = useState<FailureItem | null>(null);

  const fetchItems = useCallback(
    async (targetKind: Kind, targetPage: number) => {
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
      } catch {
        showError("加载失败队列失败");
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    deferInEffect(() => fetchItems(kind, page));
  }, [kind, page, fetchItems]);

  const handleRetry = async (item: FailureItem) => {
    setActioningId(item.id);
    try {
      const data = await apiPost<{ status: string; message: string }>(
        "/api/admin/webhook-failures",
        { kind, id: item.id, action: "retry" }
      );
      if (data.status === "failed") {
        showError(data.message);
      } else {
        success(data.message);
      }
      fetchItems(kind, page);
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
      fetchItems(kind, page);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "丢弃失败");
    } finally {
      setActioningId(null);
      setDropTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-medium text-brand-charcoal">
            <Webhook className="h-6 w-6 text-brand-primary" />
            通知失败队列
          </h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            资料变更 Webhook 与 Backchannel Logout 投递失败记录（cron 自动退避重投，最多 10 次）
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => fetchItems(kind, page)}
        >
          刷新
        </Button>
      </div>

      {/* 说明 */}
      <div className="flex items-start gap-2 rounded-xl border border-brand-charcoal/10 bg-white px-4 py-3 text-sm text-brand-charcoal/60">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-charcoal/40" />
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
            onClick={() => {
              setKind(tab.key);
              setPage(1);
            }}
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

      {/* 列表 */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="h-64" title="队列为空" description="当前没有投递失败的记录" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs uppercase text-brand-charcoal/50">
                <th className="px-4 py-3 font-medium">目标 Client</th>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">已重试</th>
                <th className="px-4 py-3 font-medium">下次重试</th>
                <th className="px-4 py-3 font-medium">首次失败</th>
                <th className="px-4 py-3 font-medium">载荷摘要</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-charcoal/8">
              {items.map((item) => {
                const payloadText = JSON.stringify(item.payload ?? {});
                return (
                  <tr key={item.id} className="hover:bg-brand-charcoal/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-charcoal">{item.clientName || "—"}</p>
                      <p className="font-mono text-xs text-brand-charcoal/40">{item.clientId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-charcoal/80">{item.userNickname || "未设置昵称"}</p>
                      <p className="font-mono text-xs text-brand-charcoal/40">
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
                      <p className="truncate font-mono text-xs text-brand-charcoal/50" title={payloadText}>
                        {payloadText}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={actioningId === item.id}
                          leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                          onClick={() => setRetryTarget(item)}
                        >
                          重投
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setDropTarget(item)}
                        >
                          丢弃
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
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

      {/* 重投确认 */}
      <ConfirmDialog
        open={!!retryTarget}
        onClose={() => setRetryTarget(null)}
        onConfirm={() => {
          if (retryTarget) return handleRetry(retryTarget);
        }}
        title="立即重投"
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
