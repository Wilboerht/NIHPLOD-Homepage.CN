"use client";

/**
 * 消费记录 Excel 批量导入组件（管理端）
 * 两阶段：上传预览（服务端解析校验）→ 确认导入（逐行入账，幂等）。
 * 另含导入历史弹窗（批次列表 + 整批撤销）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiRequest, ApiError } from "@/lib/api-client";
import {
  buildNeedsAttentionCsv,
  pickNeedsAttentionRows,
  type SpentImportRowResult,
} from "@/lib/spent-import-rows";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { ImportBatchDetailModal } from "./ImportBatchDetail";

/** 浏览器端下载文本 CSV（BOM 由内容携带） */
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari/旧内核在点击后立即 revoke 可能取消下载
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface PreviewRowItem {
  rowIndex: number;
  maskedPhone: string | null;
  amount: number | null;
  channel: string | null;
  channelLabel: string | null;
  orderNo: string | null;
  purchasedAt: string | null;
  note: string | null;
  status: "ok" | "error";
  error: string | null;
}

interface PreviewData {
  fileName: string;
  fileHash: string;
  /** 服务端 AES-GCM 加密的完整预览快照 */
  previewToken: string;
  rows: PreviewRowItem[];
  okCount: number;
  errorCount: number;
  totalAmount: number;
}

interface ExecuteData {
  batchId: string;
  totalRows: number;
  successRows: number;
  duplicateRows: number;
  errorRows: number;
  totalAmount: number;
  /** 逐行结果（服务端已脱敏手机号）；旧版接口可能不返回 */
  rows?: SpentImportRowResult[];
}

interface ImportBatchItem {
  id: string;
  fileName: string;
  reason: string | null;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  successRows: number;
  duplicateRows: number;
  errorRows: number;
  totalAmount: number;
  undoneAt: string | null;
  createdAt: string;
  adminName: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

/** 导入弹窗 */
export function SpentImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: showError } = useToast();
  const { role } = useAdminPermissions();
  const isOwner = role === "owner";
  const { requireTotp, totpModal } = useTotpConfirm();
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ExecuteData | null>(null);
  const [reason, setReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 弹窗关闭后忽略在途响应，避免下次打开时旧预览/结果“复活”
  const generationRef = useRef(0);

  const handleClose = () => {
    // 上传/导入进行中不允许关闭，避免结果与失败行列表丢失
    if (uploading || importing) return;
    generationRef.current += 1;
    setStep("upload");
    setPreview(null);
    setResult(null);
    setReason("");
    onClose();
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    // 本地预校验，避免上传后才被服务端拒绝
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      showError("仅支持 .xlsx / .xls / .csv 文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("文件大小不能超过 5MB");
      return;
    }

    const generation = generationRef.current;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiPost<PreviewData>("/api/admin/spent-import/upload", formData);
      if (generation !== generationRef.current) return;
      setPreview(data);
      setReason("");
      setStep("preview");
    } catch (e) {
      if (generation !== generationRef.current) return;
      showError(e instanceof ApiError ? e.message : "文件解析失败");
    } finally {
      if (generation === generationRef.current) setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExecute = async () => {
    if (!preview) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2) {
      showError("请填写导入原因或工单号（至少 2 个字符）");
      return;
    }
    const generation = generationRef.current;
    setImporting(true);
    try {
      const okRows = preview.rows.filter((r) => r.status === "ok");

      if (!isOwner) {
        if (trimmedReason.length < 5) {
          showError("提交 owner 审批时，导入原因至少 5 个字符");
          return;
        }
        await apiPost("/api/admin/approvals", {
          policyKey: "spent.import.execute",
          payload: {
            previewToken: preview.previewToken,
            rowIndexes: okRows.map((r) => r.rowIndex),
            reason: trimmedReason,
          },
          reason: trimmedReason,
        });
        window.dispatchEvent(new Event("admin:nav-counts-refresh"));
        success("已提交 owner 审批；审批通过后系统将自动执行导入");
        if (generation !== generationRef.current) return;
        setStep("upload");
        setPreview(null);
        setReason("");
        onClose();
        return;
      }

      const submit = (totpCode?: string) =>
        apiRequest<ExecuteData>("/api/admin/spent-import/execute", {
          method: "POST",
          timeoutMs: 120000,
          body: {
            previewToken: preview.previewToken,
            rowIndexes: okRows.map((r) => r.rowIndex),
            reason: trimmedReason,
            totpCode,
          },
        });

      let data: ExecuteData;
      try {
        data = await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        data = await submit();
      }

      if (generation !== generationRef.current) return;
      setResult(data);
      setStep("result");
      if (data.successRows > 0) {
        success("导入完成");
      } else {
        showError("没有成功入账的行，请查看结果与导入历史");
      }
    } catch (e) {
      if (generation !== generationRef.current) return;
      showError(e instanceof ApiError ? e.message : "导入失败，请稍后重试");
    } finally {
      if (generation === generationRef.current) setImporting(false);
    }
  };

  // 需人工修正的行（重复/失败）：用于结果页逐行回看与 CSV 导出
  const needsAttentionRows = result?.rows ? pickNeedsAttentionRows(result.rows) : [];

  const footer =
    step === "preview" && preview ? (
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setPreview(null);
            setStep("upload");
          }}
          disabled={importing}
        >
          重新选择文件
        </Button>
        <Button onClick={handleExecute} loading={importing} disabled={preview.okCount === 0}>
          {`确认导入（${preview.okCount} 行）`}
        </Button>
      </div>
    ) : step === "result" ? (
      <div className="flex justify-end">
        <Button onClick={handleClose}>完成</Button>
      </div>
    ) : (
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleClose} disabled={uploading}>
          取消
        </Button>
      </div>
    );

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        size="xl"
        mobileFullScreen
        title="Excel 批量导入消费记录"
        closeOnBackdrop={false}
        closeGuard={() => !uploading && !importing}
        footer={footer}
      >
        {step === "upload" && (
          <div>
            <p className="text-sm text-brand-charcoal/65">
              请先下载模板，按表头填写后上传。仅支持 .xlsx / .xls / .csv，单次最多 500 行；
              金额为整数（元），负数表示退款冲正；订单号/小票号必填，用于跨批次去重。
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => window.open("/api/admin/spent-import/template", "_blank")}
              >
                <Download className="mr-1.5 h-4 w-4" />
                下载模板
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} loading={uploading}>
                <Upload className="mr-1.5 h-4 w-4" />
                选择文件上传
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
            />
            <div className="mt-6 rounded-lg bg-brand-charcoal/[0.03] p-4 text-xs text-brand-charcoal/65">
              <p className="font-medium text-brand-charcoal/70">模板列说明</p>
              <ul className="mt-2 space-y-1">
                <li>手机号（必填）：11 位大陆手机号，须已注册官网账户</li>
                <li>金额（元，必填）：非零整数，正数累加消费、负数冲正（退款）</li>
                <li>消费日期（选填）：如 2026-01-15</li>
                <li>渠道（选填）：天猫国际 / 抖音商城 / 小红书 / 线下专柜 / 经销渠道 / 其它</li>
                <li>订单号/小票号（必填）：跨批次去重，同一用户同一订单号只能入账一次</li>
                <li>备注（选填）</li>
              </ul>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div>
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-charcoal/[0.03] p-3 text-sm">
              <span className="truncate text-brand-charcoal/70">{preview.fileName}</span>
              <span className="text-brand-charcoal/65">
                共 {preview.rows.length} 行 · 可导入 {preview.okCount} 行 · 错误{" "}
                {preview.errorCount} 行
              </span>
              <span className="text-brand-charcoal/70">
                合计金额{" "}
                <span className="font-medium">¥{preview.totalAmount.toLocaleString()}</span>
              </span>
            </div>

            <div className="mt-3">
              <Textarea
                label="导入原因 / 工单号"
                required
                rows={2}
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="如：2026-10 线下专柜消费补录 / FIN-20261024-01"
                hint="会写入审计日志和导入历史，便于财务追溯"
              />
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="sticky top-0 bg-brand-charcoal/[0.03] text-left text-xs text-brand-charcoal/65">
                  <tr>
                    <th className="px-3 py-2 font-medium">行</th>
                    <th className="px-3 py-2 font-medium">手机号</th>
                    <th className="px-3 py-2 font-medium">金额</th>
                    <th className="px-3 py-2 font-medium">渠道</th>
                    <th className="px-3 py-2 font-medium">消费日期</th>
                    <th className="px-3 py-2 font-medium">订单号</th>
                    <th className="px-3 py-2 font-medium">备注</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows.map((r) => (
                    <tr key={r.rowIndex}>
                      <td className="px-3 py-2 text-brand-charcoal/65">{r.rowIndex}</td>
                      <td className="px-3 py-2 text-brand-charcoal/70">{r.maskedPhone ?? "-"}</td>
                      <td className="px-3 py-2 text-brand-charcoal/70">
                        {r.amount != null ? `¥${r.amount.toLocaleString()}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-brand-charcoal/70">{r.channelLabel ?? "-"}</td>
                      <td className="px-3 py-2 text-brand-charcoal/70">{r.purchasedAt ?? "-"}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-brand-charcoal/70">
                        {r.orderNo ?? "-"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-brand-charcoal/70">
                        {r.note ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "ok" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            可导入
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                            {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4 text-center">
                <p className="text-2xl font-medium text-brand-charcoal">{result.successRows}</p>
                <p className="mt-1 text-xs text-brand-charcoal/65">成功入账</p>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4 text-center">
                <p className="text-2xl font-medium text-brand-charcoal">{result.duplicateRows}</p>
                <p className="mt-1 text-xs text-brand-charcoal/65">重复跳过</p>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4 text-center">
                <p className="text-2xl font-medium text-brand-charcoal">{result.errorRows}</p>
                <p className="mt-1 text-xs text-brand-charcoal/65">失败</p>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-4 text-center">
                <p className="text-2xl font-medium text-brand-charcoal">
                  ¥{result.totalAmount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-brand-charcoal/65">净入账金额</p>
              </div>
            </div>
            {(needsAttentionRows.length > 0 || result.errorRows > 0) && (
              <p className="mt-3 text-xs text-brand-charcoal/65">
                重复/失败行未入账：请按下方行号修正或删除 Excel
                中对应行后重新导入（已成功行因幂等不会重复入账）。
              </p>
            )}

            {needsAttentionRows.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-brand-charcoal/70">
                    需修正的行（{needsAttentionRows.length}）
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() =>
                      downloadCsv(
                        `导入需修正行-${preview?.fileName ?? "result"}.csv`,
                        buildNeedsAttentionCsv(needsAttentionRows)
                      )
                    }
                  >
                    导出失败行 CSV
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="sticky top-0 bg-brand-charcoal/[0.03] text-left text-xs text-brand-charcoal/65">
                      <tr>
                        <th className="px-3 py-2 font-medium">Excel 行号</th>
                        <th className="px-3 py-2 font-medium">手机号</th>
                        <th className="px-3 py-2 font-medium">金额（元）</th>
                        <th className="px-3 py-2 font-medium">结果</th>
                        <th className="px-3 py-2 font-medium">原因</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {needsAttentionRows.map((row) => (
                        <tr key={row.rowIndex}>
                          <td className="whitespace-nowrap px-3 py-2 text-brand-charcoal/70">
                            第 {row.rowIndex} 行
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-brand-charcoal/70">
                            {row.phone || "-"}
                          </td>
                          <td className="px-3 py-2 text-brand-charcoal/70">{row.amount}</td>
                          <td className="px-3 py-2">
                            {row.status === "DUPLICATE" ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                                重复跳过
                              </span>
                            ) : (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                                失败
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-brand-charcoal/65">
                            {row.error || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      {totpModal}
    </>
  );
}

/** 导入历史弹窗（含整批撤销） */
export function ImportHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: showError } = useToast();
  const { role } = useAdminPermissions();
  const isOwner = role === "owner";
  const { requireTotp, totpModal } = useTotpConfirm();
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [undoTarget, setUndoTarget] = useState<ImportBatchItem | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const [conflicts, setConflicts] = useState<{
    count: number;
    truncated: boolean;
    items: Array<{
      userId: string;
      orderNo: string;
      sources?: string[];
      importBatchId?: string;
      importAmount?: number;
      adjustmentAmount?: number | null;
      importedAt?: string;
      reviewedAt?: string | null;
      mallAmount?: number;
      mallSyncedAt?: string;
      mallReference?: string;
    }>;
  } | null>(null);

  const takeLatest = useLatestRequest();
  const fetchBatches = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    try {
      const data = await apiGet<{
        batches: ImportBatchItem[];
        pagination: { page: number; totalPages: number };
      }>("/api/admin/spent-import", { page, pageSize: 10 });
      if (!isLatest()) return;
      setBatches(data.batches);
      setTotalPages(data.pagination.totalPages);
      setLoadError(false);
    } catch (e) {
      if (!isLatest()) return;
      setLoadError(true);
      showError(e instanceof ApiError ? e.message : "加载导入历史失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, showError, takeLatest]);

  useEffect(() => {
    if (open) {
      deferInEffect(fetchBatches);
    }
  }, [open, fetchBatches]);

  const checkConflicts = async () => {
    setConflictLoading(true);
    setConflictError("");
    try {
      const data = await apiGet<{
        count: number;
        truncated: boolean;
        items: Array<{
          userId: string;
          orderNo: string;
          sources?: string[];
          importBatchId?: string;
          importAmount?: number;
          adjustmentAmount?: number | null;
          importedAt?: string;
          reviewedAt?: string | null;
          mallAmount?: number;
          mallSyncedAt?: string;
          mallReference?: string;
        }>;
      }>("/api/admin/spent-import/conflicts");
      setConflicts(data);
    } catch (e) {
      setConflicts(null);
      setConflictError(e instanceof ApiError ? e.message : "订单冲突检查失败");
    } finally {
      setConflictLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!undoTarget) return;
    const trimmedReason = undoReason.trim();
    if (trimmedReason.length < 2) {
      showError("请填写撤销原因或工单号（至少 2 个字符）");
      return;
    }
    setUndoing(true);
    try {
      if (!isOwner) {
        if (trimmedReason.length < 5) {
          showError("提交 owner 审批时，撤销原因至少 5 个字符");
          return;
        }
        await apiPost("/api/admin/approvals", {
          policyKey: "spent.import.undo",
          payload: { batchId: undoTarget.id, reason: trimmedReason },
          reason: trimmedReason,
        });
        window.dispatchEvent(new Event("admin:nav-counts-refresh"));
        success("已提交 owner 审批；审批通过后系统将自动撤销该批次");
        setUndoTarget(null);
        setUndoReason("");
        fetchBatches();
        return;
      }

      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/spent-import/${undoTarget.id}/undo`, {
          totpCode,
          reason: trimmedReason,
        });

      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }

      success("已撤销该批次，消费额已按行冲正");
      setUndoTarget(null);
      setUndoReason("");
      fetchBatches();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "撤销失败");
    } finally {
      setUndoing(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        mobileFullScreen
        title="导入历史"
        closeOnBackdrop={false}
        closeGuard={() => !undoing}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.02] px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-brand-charcoal">跨来源订单对账</p>
            <p className="mt-0.5 text-[11px] text-brand-charcoal/55">
              检查最近 90 天导入成功与已通过补录的重复订单号
            </p>
          </div>
          <Button size="sm" variant="outline" loading={conflictLoading} onClick={checkConflicts}>
            检查订单冲突
          </Button>
        </div>

        {conflictError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {conflictError}
          </p>
        )}

        {conflicts && (
          <div className="mb-3 rounded-lg border border-brand-charcoal/10">
            {conflicts.count === 0 ? (
              <p className="px-3 py-2.5 text-xs text-emerald-700">
                未发现导入、补录或商城同步的重复订单
              </p>
            ) : (
              <>
                <p className="border-b border-brand-charcoal/10 px-3 py-2 text-xs font-medium text-red-600">
                  发现 {conflicts.count} 个重复订单，请人工核对
                  {conflicts.truncated ? "（仅展示前 100 条）" : ""}
                </p>
                <div className="divide-y divide-brand-charcoal/[0.06]">
                  {conflicts.items.map((item) => {
                    const sourceLabels: Record<string, string> = {
                      IMPORT: "Excel导入",
                      ADJUSTMENT: "补录审批",
                      MALL_SYNC: "商城同步",
                    };
                    return (
                      <div
                        key={`${item.userId}-${item.orderNo}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-brand-charcoal/75">{item.orderNo}</p>
                          <p className="mt-0.5 text-[11px] text-brand-charcoal/50">
                            来源：
                            {(item.sources ?? [])
                              .map((source) => sourceLabels[source] ?? source)
                              .join(" + ") || "未知"}
                            {" · "}导入 ¥{(item.importAmount ?? 0).toLocaleString()}
                            {" · "}补录 ¥{(item.adjustmentAmount ?? 0).toLocaleString()}
                            {" · "}商城 ¥{(item.mallAmount ?? 0).toLocaleString()}
                            {" · "}用户 {item.userId.slice(0, 8)}…
                            {item.importedAt ? ` · ${formatDateTime(item.importedAt)}` : ""}
                          </p>
                        </div>
                        {item.importBatchId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailBatchId(item.importBatchId as string)}
                          >
                            查看批次
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-charcoal/65" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="text-sm text-red-500">加载导入历史失败</p>
              <Button variant="outline" size="sm" onClick={fetchBatches}>
                重试
              </Button>
            </div>
          ) : batches.length === 0 ? (
            <p className="py-12 text-center text-sm text-brand-charcoal/65">暂无导入记录</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-brand-charcoal/[0.03] text-left text-xs text-brand-charcoal/65">
                <tr>
                  <th className="px-3 py-2 font-medium">文件名</th>
                  <th className="px-3 py-2 font-medium">行数（总/成/重/错）</th>
                  <th className="px-3 py-2 font-medium">净入账</th>
                  <th className="px-3 py-2 font-medium">操作人</th>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((b) => (
                  <tr key={b.id} className={b.undoneAt ? "opacity-60" : ""}>
                    <td className="max-w-[240px] px-3 py-2 text-brand-charcoal/70">
                      <p className="truncate" title={b.fileName}>
                        {b.fileName}
                      </p>
                      {b.reason && (
                        <p
                          className="mt-0.5 truncate text-[11px] text-brand-charcoal/50"
                          title={b.reason}
                        >
                          原因：{b.reason}
                        </p>
                      )}
                      {b.undoneAt ? (
                        <span className="mt-0.5 inline-block rounded-full bg-brand-charcoal/10 px-2 py-0.5 text-[11px] text-brand-charcoal/70">
                          已撤销
                        </span>
                      ) : b.status === "FAILED" ? (
                        <span className="mt-0.5 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-600">
                          未入账
                        </span>
                      ) : b.status === "PROCESSING" ? (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                          处理中
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-brand-charcoal/70">
                      {b.totalRows} / {b.successRows} / {b.duplicateRows} / {b.errorRows}
                    </td>
                    <td className="px-3 py-2 text-brand-charcoal/70">
                      ¥{b.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-brand-charcoal/70">{b.adminName}</td>
                    <td className="px-3 py-2 text-brand-charcoal/65">
                      {formatDateTime(b.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDetailBatchId(b.id)}>
                          详情
                        </Button>
                        {!b.undoneAt && b.successRows > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUndoTarget(b)}
                            disabled={undoing}
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                            撤销
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-brand-charcoal/65">
            <span>
              第 {page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!undoTarget}
        onClose={() => {
          if (undoing) return;
          setUndoTarget(null);
          setUndoReason("");
        }}
        onConfirm={handleUndo}
        title="撤销导入批次"
        description={
          undoTarget
            ? `确定撤销「${undoTarget.fileName}」吗？将按成功入账的 ${undoTarget.successRows} 行逐行冲正消费额（会员等级同步重算），且不可再次撤销。`
            : ""
        }
        type="danger"
        confirmText="确认撤销"
        loading={undoing}
        confirmDisabled={undoReason.trim().length < 2}
      >
        <Textarea
          label="撤销原因 / 工单号"
          required
          rows={2}
          maxLength={200}
          value={undoReason}
          onChange={(event) => setUndoReason(event.target.value)}
          placeholder="如：重复导入 / FIN-20261024-02"
        />
      </ConfirmDialog>
      {open && detailBatchId && (
        <ImportBatchDetailModal
          key={detailBatchId}
          open
          batchId={detailBatchId}
          onClose={() => setDetailBatchId(null)}
        />
      )}
      {totpModal}
    </>
  );
}
