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
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import {
  buildNeedsAttentionCsv,
  pickNeedsAttentionRows,
  type SpentImportRowResult,
} from "@/lib/spent-import-rows";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";

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
  URL.revokeObjectURL(url);
}

interface PreviewRowItem {
  rowIndex: number;
  /** 服务端签发的行令牌（预览不回传明文手机号） */
  phoneToken: string | null;
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
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 导入弹窗 */
export function SpentImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ExecuteData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 弹窗关闭后忽略在途响应，避免下次打开时旧预览/结果“复活”
  const generationRef = useRef(0);

  const handleClose = () => {
    generationRef.current += 1;
    setStep("upload");
    setPreview(null);
    setResult(null);
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
    const generation = generationRef.current;
    setImporting(true);
    try {
      const okRows = preview.rows.filter((r) => r.status === "ok");
      const submit = (totpCode?: string) =>
        apiPost<ExecuteData>("/api/admin/spent-import/execute", {
          fileName: preview.fileName,
          fileHash: preview.fileHash,
          totpCode,
          rows: okRows.map((r) => ({
            phoneToken: r.phoneToken,
            amount: r.amount,
            channel: r.channel,
            orderNo: r.orderNo,
            purchasedAt: r.purchasedAt,
            note: r.note,
          })),
        });

      let data: ExecuteData;
      try {
        data = await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const code = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!code) return;
        data = await submit(code);
      }

      if (generation !== generationRef.current) return;
      setResult(data);
      setStep("result");
      success("导入完成");
    } catch (e) {
      if (generation !== generationRef.current) return;
      showError(e instanceof ApiError ? e.message : "导入失败，请稍后重试");
    } finally {
      if (generation === generationRef.current) setImporting(false);
    }
  };

  // 需人工修正的行（重复/失败）：用于结果页逐行回看与 CSV 导出
  const needsAttentionRows = result?.rows ? pickNeedsAttentionRows(result.rows) : [];

  return (
    <>
    <Modal open={open} onClose={handleClose} size="xl" title="Excel 批量导入消费记录">
      {step === "upload" && (
        <div>
          <p className="text-sm text-gray-500">
            请先下载模板，按表头填写后上传。仅支持 .xlsx / .xls / .csv，单次最多 1000 行；
            金额为整数（元），负数表示退款冲正；未注册手机号的行会标记错误并跳过。
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => window.open("/api/admin/spent-import/template", "_blank")}
            >
              <Download className="mr-1.5 h-4 w-4" />
              下载模板
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="mr-1.5 h-4 w-4" />
              {uploading ? "解析中..." : "选择文件上传"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
          />
          <div className="mt-6 rounded-lg bg-gray-50 p-4 text-xs text-gray-500">
            <p className="font-medium text-gray-600">模板列说明</p>
            <ul className="mt-2 space-y-1">
              <li>手机号（必填）：11 位大陆手机号，须已注册官网账户</li>
              <li>金额（元，必填）：非零整数，正数累加消费、负数冲正（退款）</li>
              <li>消费日期（选填）：如 2026-01-15</li>
              <li>渠道（选填）：天猫国际 / 抖音商城 / 小红书 / 线下专柜 / 经销渠道 / 其它</li>
              <li>订单号/小票号（选填）：参与幂等去重，建议填写</li>
              <li>备注（选填）</li>
            </ul>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="truncate text-gray-600">{preview.fileName}</span>
            <span className="text-gray-400">
              共 {preview.rows.length} 行 · 可导入 {preview.okCount} 行 · 错误 {preview.errorCount} 行
            </span>
            <span className="text-gray-700">
              合计金额 <span className="font-medium">¥{preview.totalAmount.toLocaleString()}</span>
            </span>
          </div>

          <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">行</th>
                  <th className="px-3 py-2 font-medium">手机号</th>
                  <th className="px-3 py-2 font-medium">金额</th>
                  <th className="px-3 py-2 font-medium">渠道</th>
                  <th className="px-3 py-2 font-medium">消费日期</th>
                  <th className="px-3 py-2 font-medium">订单号</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => (
                  <tr key={r.rowIndex}>
                    <td className="px-3 py-2 text-gray-400">{r.rowIndex}</td>
                    <td className="px-3 py-2 text-gray-700">{r.maskedPhone ?? "-"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.amount != null ? `¥${r.amount.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.channelLabel ?? "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{r.purchasedAt ?? "-"}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-mono text-gray-600">
                      {r.orderNo ?? "-"}
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

          <div className="mt-5 flex justify-end gap-3">
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
            <Button onClick={handleExecute} disabled={importing || preview.okCount === 0}>
              {importing ? "导入中..." : `确认导入（${preview.okCount} 行）`}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-medium text-gray-800">{result.successRows}</p>
              <p className="mt-1 text-xs text-gray-500">成功入账</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-medium text-gray-800">{result.duplicateRows}</p>
              <p className="mt-1 text-xs text-gray-500">重复跳过</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-medium text-gray-800">{result.errorRows}</p>
              <p className="mt-1 text-xs text-gray-500">失败</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-2xl font-medium text-gray-800">
                ¥{result.totalAmount.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-gray-500">净入账金额</p>
            </div>
          </div>
          {(needsAttentionRows.length > 0 || result.errorRows > 0) && (
            <p className="mt-3 text-xs text-gray-500">
              重复/失败行未入账：请按下方行号修正或删除 Excel 中对应行后重新导入（已成功行因幂等不会重复入账）。
            </p>
          )}

          {needsAttentionRows.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
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
              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
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
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                          第 {row.rowIndex} 行
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">
                          {row.phone || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.amount}</td>
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
                        <td className="px-3 py-2 text-xs text-gray-500">{row.error || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={handleClose}>完成</Button>
          </div>
        </div>
      )}
    </Modal>
    {totpModal}
    </>
  );
}

/** 导入历史弹窗（含整批撤销） */
export function ImportHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [undoTarget, setUndoTarget] = useState<ImportBatchItem | null>(null);
  const [undoing, setUndoing] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{
        batches: ImportBatchItem[];
        pagination: { page: number; totalPages: number };
      }>("/api/admin/spent-import", { page, pageSize: 10 });
      setBatches(data.batches);
      setTotalPages(data.pagination.totalPages);
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      showError(e instanceof ApiError ? e.message : "加载导入历史失败");
    } finally {
      setLoading(false);
    }
  }, [page, showError]);

  useEffect(() => {
    if (open) {
      deferInEffect(fetchBatches);
    }
  }, [open, fetchBatches]);

  const handleUndo = async () => {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/spent-import/${undoTarget.id}/undo`, { totpCode });

      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const code = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!code) return;
        await submit(code);
      }

      success("已撤销该批次，消费额已按行冲正");
      setUndoTarget(null);
      fetchBatches();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "撤销失败");
    } finally {
      setUndoing(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title="导入历史">
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="text-sm text-red-500">加载导入历史失败</p>
              <Button variant="outline" size="sm" onClick={fetchBatches}>
                重试
              </Button>
            </div>
          ) : batches.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">暂无导入记录</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
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
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-700">
                      {b.fileName}
                      {b.undoneAt && (
                        <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          已撤销
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {b.totalRows} / {b.successRows} / {b.duplicateRows} / {b.errorRows}
                    </td>
                    <td className="px-3 py-2 text-gray-700">¥{b.totalAmount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-600">{b.adminName}</td>
                    <td className="px-3 py-2 text-gray-500">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              第 {page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
        onClose={() => setUndoTarget(null)}
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
      />
      {totpModal}
    </>
  );
}
