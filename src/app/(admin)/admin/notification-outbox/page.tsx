"use client";

/**
 * 事务通知 Outbox 管理页
 * 查看短信/微信模板/小程序/WeCom 通知的发送状态，支持重试与丢弃。
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatDateTimeSeconds } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import {
  DataTable,
  PageHeader,
  RequirePermission,
  StatStrip,
  type Column,
} from "@/components/admin";

type NotificationStatus = "PENDING" | "SENDING" | "SENT" | "DEAD" | "SKIPPED";
type NotificationChannel = "SMS" | "WECHAT_TEMPLATE" | "MINIPROGRAM" | "WECOM";

interface OutboxItem {
  id: string;
  idempotencyKey: string;
  channel: NotificationChannel;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  userId: string | null;
  recipient: unknown;
  templateKey: string | null;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListData {
  items: OutboxItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  counts: Partial<Record<NotificationStatus, number>>;
}

const STATUS_META: Record<
  NotificationStatus,
  { label: string; variant: "success" | "danger" | "warning" | "secondary" | "primary" }
> = {
  PENDING: { label: "待发送", variant: "warning" },
  SENDING: { label: "发送中", variant: "primary" },
  SENT: { label: "已发送", variant: "success" },
  DEAD: { label: "死信", variant: "danger" },
  SKIPPED: { label: "已跳过", variant: "secondary" },
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  SMS: "短信",
  WECHAT_TEMPLATE: "微信模板",
  MINIPROGRAM: "小程序",
  WECOM: "WeCom",
};

const columns: Column<OutboxItem>[] = [
  {
    key: "channel",
    title: "渠道",
    width: "100px",
    render: (_, row) => <Badge variant="secondary">{CHANNEL_LABELS[row.channel]}</Badge>,
  },
  {
    key: "eventType",
    title: "事件 / 模板",
    width: "220px",
    render: (_, row) => (
      <div className="min-w-0">
        <p className="truncate text-sm text-brand-charcoal">{row.eventType}</p>
        <p className="truncate font-mono text-xs text-brand-charcoal/55">
          {row.templateKey ?? "-"}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    title: "状态",
    width: "100px",
    render: (_, row) => (
      <Badge variant={STATUS_META[row.status].variant}>{STATUS_META[row.status].label}</Badge>
    ),
  },
  {
    key: "attempts",
    title: "尝试",
    width: "80px",
    align: "right",
    render: (_, row) => `${row.attempts}/${row.maxAttempts}`,
  },
  {
    key: "userId",
    title: "用户 / 幂等键",
    width: "250px",
    render: (_, row) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-xs">{row.userId ?? "-"}</p>
        <p className="truncate font-mono text-[11px] text-brand-charcoal/55">
          {row.idempotencyKey}
        </p>
      </div>
    ),
  },
  {
    key: "nextAttemptAt",
    title: "下次重试 / 发送时间",
    width: "180px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">
        {row.sentAt
          ? `发送于 ${formatDateTimeSeconds(row.sentAt)}`
          : formatDateTimeSeconds(row.nextAttemptAt)}
      </span>
    ),
  },
  {
    key: "lastError",
    title: "最后错误",
    width: "220px",
    render: (_, row) =>
      row.lastError ? (
        <span className="line-clamp-2 text-xs text-red-500" title={row.lastError}>
          {row.lastError}
        </span>
      ) : (
        <span className="text-xs text-brand-charcoal/45">-</span>
      ),
  },
];

function NotificationOutboxContent() {
  const toast = useToast();
  const { can } = useAdminPermissions();
  const canWrite = can("notifications:write");
  const { requireTotp, totpModal } = useTotpConfirm();
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"" | NotificationStatus>("");
  const [channelFilter, setChannelFilter] = useState<"" | NotificationChannel>("");
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    action: "retry" | "discard";
  } | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<ListData>("/api/admin/notification-outbox", {
        page,
        pageSize: 30,
        status: statusFilter || undefined,
        channel: channelFilter || undefined,
      });
      setData(result);
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("加载通知队列失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, channelFilter, toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const submit = async (id: string, action: "retry" | "discard") => {
    setActing(true);
    try {
      const run = () =>
        apiPost<{ message: string }>("/api/admin/notification-outbox", { id, action });
      try {
        await run();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        await run();
      }
      toast.success(action === "retry" ? "已重新入队" : "已丢弃");
      setActionTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "操作失败");
    } finally {
      setActing(false);
    }
  };

  const counts = data?.counts ?? {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="事务通知队列"
        description="短信、微信模板、小程序与 WeCom 通知的事务性发件箱；失败自动重试，死信可人工处理。"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            loading={loading}
            onClick={load}
          >
            刷新
          </Button>
        }
      />

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5">
        <StatStrip
          items={[
            { label: "待发送", value: counts.PENDING ?? 0, muted: !counts.PENDING },
            { label: "发送中", value: counts.SENDING ?? 0, muted: !counts.SENDING },
            { label: "死信", value: counts.DEAD ?? 0, muted: !counts.DEAD },
            { label: "已跳过", value: counts.SKIPPED ?? 0, muted: !counts.SKIPPED },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="按状态筛选"
          className="rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value as "" | NotificationStatus);
          }}
        >
          <option value="">全部状态</option>
          <option value="PENDING">待发送</option>
          <option value="SENDING">发送中</option>
          <option value="SENT">已发送</option>
          <option value="DEAD">死信</option>
          <option value="SKIPPED">已跳过</option>
        </select>
        <select
          aria-label="按渠道筛选"
          className="rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2 text-sm"
          value={channelFilter}
          onChange={(event) => {
            setPage(1);
            setChannelFilter(event.target.value as "" | NotificationChannel);
          }}
        >
          <option value="">全部渠道</option>
          <option value="SMS">短信</option>
          <option value="WECHAT_TEMPLATE">微信模板</option>
          <option value="MINIPROGRAM">小程序</option>
          <option value="WECOM">WeCom</option>
        </select>
      </div>

      {loadError && !data ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-brand-charcoal/10 bg-white py-12">
          <p className="text-sm text-red-500">加载失败，请稍后重试</p>
          <Button variant="outline" size="sm" onClick={load}>
            重新加载
          </Button>
        </div>
      ) : (
        <DataTable
          columns={[
            ...columns,
            ...(canWrite
              ? [
                  {
                    key: "actions",
                    title: "操作",
                    width: "140px",
                    align: "right" as const,
                    render: (_: unknown, row: OutboxItem) => (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                          disabled={row.status !== "DEAD" && row.status !== "SKIPPED"}
                          onClick={() => setActionTarget({ id: row.id, action: "retry" })}
                        >
                          重试
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          disabled={row.status === "SENT" || row.status === "SENDING"}
                          onClick={() => setActionTarget({ id: row.id, action: "discard" })}
                        >
                          丢弃
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          data={data?.items ?? []}
          loading={loading}
          rowKey="id"
          density="compact"
          emptyText="暂无通知记录"
          minWidth="1180px"
          mobileCard={(row) => (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.eventType}</span>
                <Badge variant={STATUS_META[row.status].variant}>
                  {STATUS_META[row.status].label}
                </Badge>
              </div>
              <p className="text-xs text-brand-charcoal/65">
                {CHANNEL_LABELS[row.channel]} · {row.attempts}/{row.maxAttempts} 次
              </p>
              <p className="break-all font-mono text-xs text-brand-charcoal/55">
                {row.idempotencyKey}
              </p>
              {row.lastError && <p className="text-xs text-red-500">{row.lastError}</p>}
              <div className="flex justify-end gap-1 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  disabled={row.status !== "DEAD" && row.status !== "SKIPPED"}
                  onClick={() => setActionTarget({ id: row.id, action: "retry" })}
                >
                  重试
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={row.status === "SENT" || row.status === "SENDING"}
                  onClick={() => setActionTarget({ id: row.id, action: "discard" })}
                >
                  丢弃
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {data && data.pagination.totalPages > 1 && (
        <Pagination
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          onChange={setPage}
        />
      )}

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) return submit(actionTarget.id, actionTarget.action);
        }}
        title={actionTarget?.action === "retry" ? "重新入队通知" : "丢弃通知"}
        type="warning"
        description={
          actionTarget?.action === "retry"
            ? "确认将该通知重新加入发送队列？"
            : "确认丢弃该通知？丢弃后不再自动发送。"
        }
        confirmText={actionTarget?.action === "retry" ? "重新入队" : "确认丢弃"}
        loading={acting}
      />
      {totpModal}
    </div>
  );
}

export default function NotificationOutboxPage() {
  return (
    <RequirePermission permission="notifications:read">
      <NotificationOutboxContent />
    </RequirePermission>
  );
}
