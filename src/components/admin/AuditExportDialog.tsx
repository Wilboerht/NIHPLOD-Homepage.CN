"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileJson, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { isTotpRequired, useTotpConfirm } from "@/hooks/useTotpConfirm";
import { downloadFromUrl } from "@/lib/client-download";

interface ExportJob {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  format: "csv" | "jsonl";
  processedRows: number;
  totalRows: number;
  sha256: string | null;
  error: string | null;
  expiresAt: string | null;
}

export function AuditExportDialog({
  open,
  onClose,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  filters: Record<string, string | number | boolean | undefined>;
}) {
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [format, setFormat] = useState<"csv" | "jsonl">("csv");
  const [creating, setCreating] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const createJob = async () => {
    setCreating(true);
    try {
      const payload = { stream: "audit", format, filters, reason: "后台审计导出" };
      let created: { id: string };
      try {
        created = await apiPost<{ id: string }>("/api/admin/audit-logs/exports", payload);
      } catch (error) {
        if (isTotpRequired(error)) {
          const verified = await requireTotp(
            error instanceof ApiError ? error.code : undefined
          );
          if (!verified) return;
          created = await apiPost<{ id: string }>("/api/admin/audit-logs/exports", payload);
        } else {
          throw error;
        }
      }
      toast.success("导出任务已创建");
      setJob({ id: created.id, status: "QUEUED", format, processedRows: 0, totalRows: 0, sha256: null, error: null, expiresAt: null });
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const data = await apiGet<ExportJob>(`/api/admin/audit-logs/exports/${created.id}`);
          setJob(data);
          if (data.status === "SUCCEEDED" || data.status === "FAILED" || data.status === "EXPIRED") {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      }, 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建导出任务失败");
    } finally {
      setCreating(false);
    }
  };

  const download = async () => {
    if (!job) return;
    try {
      await downloadFromUrl(
        `/api/admin/audit-logs/exports/${job.id}/download`,
        `audit-export-${job.id}.${job.format}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (isTotpRequired(error) || message.includes("二次验证") || message.includes("TOTP")) {
        const verified = await requireTotp("TOTP_REQUIRED");
        if (verified) {
          await downloadFromUrl(
            `/api/admin/audit-logs/exports/${job.id}/download`,
            `audit-export-${job.id}.${job.format}`
          );
        }
        return;
      }
      toast.error(message || "下载失败");
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="导出审计日志" size="md">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            导出会生成独立文件，创建和下载都需要二次验证。文件 24 小时后失效。
          </div>
          <Select
            label="格式"
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "jsonl")}
            options={[
              { value: "csv", label: "CSV（Excel 可直接打开）" },
              { value: "jsonl", label: "JSONL（供 SIEM/脚本处理）" },
            ]}
          />
          {job ? (
            <div className="space-y-2 rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 text-sm">
              <div className="flex items-center gap-2">
                {job.status === "SUCCEEDED" ? (
                  <FileJson className="h-4 w-4 text-emerald-600" />
                ) : job.status === "FAILED" || job.status === "EXPIRED" ? (
                  <FileJson className="h-4 w-4 text-red-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                )}
                <span>
                  状态：{job.status}
                  {job.status === "RUNNING" && `（${job.processedRows}/${job.totalRows}）`}
                </span>
              </div>
              {job.sha256 && (
                <p className="break-all font-mono text-[11px] text-brand-charcoal/60">
                  sha256: {job.sha256}
                </p>
              )}
              {job.error && <p className="text-xs text-red-600">{job.error}</p>}
              {job.status === "SUCCEEDED" && (
                <Button
                  size="sm"
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={() => void download()}
                >
                  下载文件
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
            <Button
              size="sm"
              loading={creating}
              disabled={Boolean(job && job.status !== "FAILED" && job.status !== "EXPIRED")}
              onClick={() => void createJob()}
            >
              {job ? "重新创建" : "创建导出任务"}
            </Button>
          </div>
        </div>
      </Modal>
      {totpModal}
    </>
  );
}
