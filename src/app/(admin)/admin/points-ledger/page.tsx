"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { formatDateTime } from "@/lib/format";
import { POINT_LEDGER_TYPE_OPTIONS } from "@/lib/point-meta";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useListQuery } from "@/hooks/useListQuery";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import {
  AdminHubTabs,
  AdminSearchInput,
  DataTable,
  DateRangeFilter,
  PageHeader,
  RequirePermission,
  StatStrip,
  type Column,
} from "@/components/admin";

interface LedgerItem {
  id: string;
  type: string;
  typeLabel: string;
  source: string;
  sourceLabel: string;
  amount: number;
  remaining: number | null;
  reference: string;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; phone: string };
}

interface ListResponse {
  items: LedgerItem[];
  summary: {
    available: number;
    issuedLast7Days: number;
    consumedLast7Days: number;
    expiringIn30Days: number;
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const columns: Column<LedgerItem>[] = [
  {
    key: "createdAt",
    title: "时间",
    width: "150px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">{formatDateTime(row.createdAt)}</span>
    ),
  },
  {
    key: "user",
    title: "用户",
    width: "220px",
    render: (_, row) => (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-brand-charcoal">
          {row.user.nickname || "未设置昵称"}
        </p>
        <p className="truncate font-mono text-xs text-brand-charcoal/65">{row.user.phone}</p>
        <p className="truncate font-mono text-[10px] text-brand-charcoal/65">{row.user.id}</p>
      </div>
    ),
  },
  {
    key: "typeLabel",
    title: "类型",
    width: "110px",
    render: (_, row) => <Badge variant="secondary">{row.typeLabel}</Badge>,
  },
  {
    key: "amount",
    title: "分值",
    width: "100px",
    align: "right",
    render: (_, row) => (
      <span
        className={
          row.amount >= 0
            ? "font-semibold tabular-nums text-emerald-600"
            : "font-semibold tabular-nums text-red-600"
        }
      >
        {row.amount > 0 ? "+" : ""}
        {row.amount.toLocaleString("zh-CN")}
      </span>
    ),
  },
  {
    key: "remaining",
    title: "剩余",
    width: "90px",
    align: "right",
    render: (_, row) => (
      <span className="tabular-nums text-brand-charcoal/75">
        {row.remaining === null ? "—" : row.remaining.toLocaleString("zh-CN")}
      </span>
    ),
  },
  {
    key: "reference",
    title: "Reference",
    width: "220px",
    render: (_, row) => (
      <span className="break-all font-mono text-xs text-brand-charcoal/70">{row.reference}</span>
    ),
  },
  {
    key: "note",
    title: "备注",
    width: "220px",
    render: (_, row) => (
      <span className="line-clamp-2 text-xs text-brand-charcoal/65">{row.note ?? "—"}</span>
    ),
  },
  {
    key: "expiresAt",
    title: "过期时间",
    width: "140px",
    render: (_, row) => (
      <span className="text-xs text-brand-charcoal/65">
        {row.expiresAt ? formatDateTime(row.expiresAt) : "—"}
      </span>
    ),
  },
];

function PointsLedgerContent() {
  const toast = useToast();
  const { get, getNumber, update } = useListQuery();
  const page = getNumber("page", 1);
  const search = get("search");
  const type = get("type");
  const reference = get("reference");
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const takeLatest = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    try {
      const result = await apiGet<ListResponse>("/api/admin/points-ledger", {
        page,
        pageSize: 20,
        search: search || undefined,
        type: type || undefined,
        reference: reference || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (!isLatest()) return;
      setData(result);
      setLoadError(false);
    } catch (error) {
      if (!isLatest()) return;
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "加载积分流水失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [dateFrom, dateTo, page, reference, search, takeLatest, toast, type]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  useEffect(() => {
    const totalPages = data?.pagination.totalPages ?? 0;
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [data?.pagination.totalPages, page, update]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (type) params.set("type", type);
      if (reference) params.set("reference", reference);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      await downloadFromUrl(
        `/api/admin/points-ledger/export?${params.toString()}`,
        "points-ledger.csv"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const hasFilters = Boolean(search || type || reference || dateFrom || dateTo);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="全局积分流水"
        description="财务只读：可用积分、发放/消耗与过期情况；导出默认脱敏并写审计。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              导出 CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              loading={loading}
              onClick={load}
            >
              刷新
            </Button>
          </div>
        }
      />

      <AdminHubTabs section="points" />

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <StatStrip
          items={[
            { label: "可用积分总额", value: (summary?.available ?? 0).toLocaleString("zh-CN") },
            {
              label: "近 7 日发放",
              value: `+${(summary?.issuedLast7Days ?? 0).toLocaleString("zh-CN")}`,
            },
            {
              label: "近 7 日消耗",
              value: (summary?.consumedLast7Days ?? 0).toLocaleString("zh-CN"),
            },
            {
              label: "30 天内过期",
              value: (summary?.expiringIn30Days ?? 0).toLocaleString("zh-CN"),
            },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <AdminSearchInput
            value={search}
            onCommit={(next) => update({ search: next || null }, { replace: true })}
            ariaLabel="搜索用户"
            placeholder="用户 ID / 完整手机号 / 昵称"
            className="xl:max-w-sm xl:flex-1"
          />
          <AdminSearchInput
            value={reference}
            onCommit={(next) => update({ reference: next || null }, { replace: true })}
            ariaLabel="搜索 reference"
            placeholder="订单号 / reference"
            className="xl:max-w-xs"
          />
          <div className="w-full sm:w-40">
            <Select
              aria-label="按流水类型筛选"
              value={type}
              onChange={(event) => update({ type: event.target.value || null })}
              options={[{ value: "", label: "全部类型" }, ...POINT_LEDGER_TYPE_OPTIONS]}
            />
          </div>
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={({ from, to }) =>
              update({ dateFrom: from || null, dateTo: to || null })
            }
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({
                  search: null,
                  type: null,
                  reference: null,
                  dateFrom: null,
                  dateTo: null,
                })
              }
            >
              清除筛选
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        error={loadError ? "积分流水加载失败，请稍后重试" : null}
        onRetry={load}
        rowKey="id"
        density="compact"
        tableLayout="fixed"
        minWidth="1280px"
        emptyText="暂无积分流水"
        pagination={
          data
            ? {
                page: data.pagination.page,
                pageSize: data.pagination.pageSize,
                total: data.pagination.total,
                onChange: (nextPage) => update({ page: String(nextPage) }),
              }
            : undefined
        }
        mobileCard={(row) => (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.typeLabel}</span>
              <span
                className={
                  row.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"
                }
              >
                {row.amount > 0 ? "+" : ""}
                {row.amount.toLocaleString("zh-CN")}
              </span>
            </div>
            <p className="text-xs text-brand-charcoal/65">
              {row.user.nickname || "未设置昵称"} · {row.user.phone}
            </p>
            <p className="break-all font-mono text-xs text-brand-charcoal/65">{row.reference}</p>
            <p className="text-xs text-brand-charcoal/65">{formatDateTime(row.createdAt)}</p>
          </div>
        )}
      />
    </div>
  );
}

export default function PointsLedgerPage() {
  return (
    <RequirePermission permission="points:read">
      <PointsLedgerContent />
    </RequirePermission>
  );
}
