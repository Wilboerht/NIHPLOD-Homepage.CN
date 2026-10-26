"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiGet, ApiError } from "@/lib/api-client";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { buildNeedsAttentionCsv, type SpentImportRowResult } from "@/lib/spent-import-rows";

type RowStatus = "PENDING" | "SUCCESS" | "DUPLICATE" | "ERROR";
type StatusFilter = "ALL" | Exclude<RowStatus, "PENDING">;

interface BatchSummary {
  id: string;
  fileName: string;
  reason: string | null;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  successRows: number;
  duplicateRows: number;
  errorRows: number;
  totalAmount: number;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
  undoneAt: string | null;
  createdAt: string;
  adminName: string;
}

interface BatchRow {
  id: string;
  rowIndex: number | null;
  phone: string;
  amount: number;
  channel: string | null;
  channelLabel: string | null;
  orderNo: string | null;
  purchasedAt: string | null;
  note: string | null;
  status: RowStatus;
  error: string | null;
  appliedDelta: number | null;
  revertedAt: string | null;
  createdAt: string;
}

interface DetailPayload {
  batch: BatchSummary;
  rows: BatchRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<RowStatus, string> = {
  PENDING: "处理中断",
  SUCCESS: "成功",
  DUPLICATE: "重复跳过",
  ERROR: "失败",
};

const STATUS_VARIANTS: Record<RowStatus, "success" | "warning" | "danger" | "secondary"> = {
  PENDING: "secondary",
  SUCCESS: "success",
  DUPLICATE: "warning",
  ERROR: "danger",
};

const BATCH_STATUS_LABELS: Record<BatchSummary["status"], string> = {
  PROCESSING: "处理中",
  COMPLETED: "已完成",
  FAILED: "未入账",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ImportBatchDetailModal({
  open,
  batchId,
  onClose,
}: {
  open: boolean;
  batchId: string | null;
  onClose: () => void;
}) {
  const { error: showError } = useToast();
  const takeLatest = useLatestRequest();
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || !batchId) return;
    const isLatest = takeLatest();
    apiGet<DetailPayload>(`/api/admin/spent-import/${batchId}`, {
      page,
      pageSize: PAGE_SIZE,
      status,
    })
      .then((data) => {
        if (!isLatest()) return;
        setPayload(data);
        setLoadError("");
      })
      .catch((err) => {
        if (!isLatest()) return;
        setPayload(null);
        setLoadError(err instanceof ApiError ? err.message : "加载导入批次失败，请稍后重试");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, [batchId, open, page, status, takeLatest]);

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
    setLoading(true);
    setLoadError("");
    setPayload(null);
  };

  const changePage = (next: number) => {
    setPage(next);
    setLoading(true);
    setLoadError("");
    setPayload(null);
  };

  const exportIssues = async () => {
    if (!batchId || exporting) return;
    setExporting(true);
    try {
      const data = await apiGet<DetailPayload>(`/api/admin/spent-import/${batchId}`, {
        page: 1,
        pageSize: 1000,
        status: "ALL",
      });
      const rows: SpentImportRowResult[] = data.rows
        .filter((row) => row.status !== "SUCCESS")
        .map((row) => ({
          rowIndex: row.rowIndex,
          phone: row.phone,
          amount: row.amount,
          status: row.status === "DUPLICATE" ? "DUPLICATE" : "ERROR",
          error: row.error ?? (row.status === "PENDING" ? "批次处理中断，未完成入账" : null),
          reference: null,
        }));
      if (rows.length === 0) {
        showError("该批次没有需要修正的行");
        return;
      }
      downloadCsv(`导入批次-${data.batch.fileName}-需修正行.csv`, buildNeedsAttentionCsv(rows));
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const batch = payload?.batch;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      mobileFullScreen
      title="导入批次详情"
      closeOnBackdrop={false}
    >
      {loading ? (
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-brand-charcoal/[0.04]" />
          <div className="h-64 animate-pulse rounded-xl bg-brand-charcoal/[0.04]" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="text-sm text-brand-charcoal/65">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => changePage(1)}>
            重试
          </Button>
        </div>
      ) : !payload || !batch ? null : (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-brand-charcoal">
                {batch.fileName}
              </span>
              <Badge
                variant={
                  batch.undoneAt
                    ? "secondary"
                    : batch.status === "FAILED"
                      ? "danger"
                      : batch.status === "PROCESSING"
                        ? "warning"
                        : "success"
                }
              >
                {batch.undoneAt ? "已撤销" : BATCH_STATUS_LABELS[batch.status]}
              </Badge>
              <span className="text-xs text-brand-charcoal/55">{batch.adminName}</span>
              <span className="text-xs text-brand-charcoal/45">
                {formatDateTime(batch.createdAt)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-brand-charcoal/65 sm:grid-cols-5">
              <span>总数 {batch.totalRows}</span>
              <span>成功 {batch.successRows}</span>
              <span>重复 {batch.duplicateRows}</span>
              <span>失败 {batch.errorRows}</span>
              <span>净入账 ¥{batch.totalAmount.toLocaleString()}</span>
            </div>
            {batch.reason && (
              <p className="mt-2 text-xs text-brand-charcoal/60">原因：{batch.reason}</p>
            )}
            {batch.lastError && (
              <p className="mt-1 text-xs text-red-600">批次错误：{batch.lastError}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["ALL", "全部"],
                  ["SUCCESS", "成功"],
                  ["DUPLICATE", "重复"],
                  ["ERROR", "失败"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={status === key ? "primary" : "outline"}
                  onClick={() => changeStatus(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              loading={exporting}
              onClick={exportIssues}
            >
              导出失败/重复行
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-brand-charcoal/10">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead className="bg-brand-charcoal/[0.03] text-brand-charcoal/55">
                <tr>
                  <th className="px-3 py-2 font-medium">Excel 行</th>
                  <th className="px-3 py-2 font-medium">手机号</th>
                  <th className="px-3 py-2 font-medium">金额</th>
                  <th className="px-3 py-2 font-medium">渠道</th>
                  <th className="px-3 py-2 font-medium">消费日期</th>
                  <th className="px-3 py-2 font-medium">订单号</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">实际入账</th>
                  <th className="px-3 py-2 font-medium">原因/备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-charcoal/[0.06]">
                {payload.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-brand-charcoal/55">
                      没有符合条件的行
                    </td>
                  </tr>
                ) : (
                  payload.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-brand-charcoal/65">
                        {row.rowIndex ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-brand-charcoal/70">
                        {row.phone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-brand-charcoal/75">
                        ¥{row.amount.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-brand-charcoal/65">
                        {row.channelLabel || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-brand-charcoal/65">
                        {row.purchasedAt ? row.purchasedAt.slice(0, 10) : "—"}
                      </td>
                      <td
                        className="max-w-[180px] truncate px-3 py-2 font-mono text-brand-charcoal/65"
                        title={row.orderNo ?? ""}
                      >
                        {row.orderNo || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge variant={STATUS_VARIANTS[row.status]} size="sm">
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-brand-charcoal/70">
                        {row.appliedDelta == null ? "—" : `¥${row.appliedDelta.toLocaleString()}`}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-3 py-2 text-brand-charcoal/60"
                        title={row.error ?? row.note ?? ""}
                      >
                        {row.error || row.note || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {payload.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
              >
                上一页
              </Button>
              <span className="text-xs tabular-nums text-brand-charcoal/55">
                {page}/{payload.pagination.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= payload.pagination.totalPages}
                onClick={() => changePage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
