"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lock, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDateTimeSeconds as formatDate } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { PageHeader, RequirePermission } from "@/components/admin";

interface Bucket {
  stream: "audit" | "sso";
  day: string;
  count: number;
  bytes: number;
  holdsExcluded: number;
  eligible: number;
  archiveVerified: boolean;
  backupVerified: boolean;
}

interface Preview {
  cutoffs: { stream: "audit" | "sso"; cutoff: string }[];
  buckets: Bucket[];
  expectedCount: number;
  expectedBytes: number;
  holdsExcluded: number;
  previewHash: string;
  ready: boolean;
  warnings: string[];
}

interface PreviewResponse {
  preview: Preview;
  enabled: boolean;
  allowLocalOnly: boolean;
  canExecute: boolean;
}

interface RetentionJob {
  id: string;
  requestedByEmail: string | null;
  requestedByRole: string;
  reason: string;
  status: string;
  expectedCount: number;
  deletedCount: number;
  deletedBytes: number;
  holdsExcluded: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
}

interface LegalHold {
  id: string;
  targetType: string | null;
  targetId: string | null;
  userId: string | null;
  adminId: string | null;
  reason: string;
  createdByEmail: string | null;
  active: boolean;
  createdAt: string;
  releasedAt: string | null;
  expiresAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function RetentionContent() {
  const toast = useToast();
  const { role, can } = useAdminPermissions();
  const isOwner = role === "owner" && can("audit:retention:execute");
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [jobs, setJobs] = useState<RetentionJob[]>([]);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [localOnlyAck, setLocalOnlyAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdForm, setHoldForm] = useState({
    targetType: "",
    targetId: "",
    userId: "",
    adminId: "",
    reason: "",
    totpCode: "",
  });
  const [releaseHold, setReleaseHold] = useState<LegalHold | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseCode, setReleaseCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preview, jobData, holdData] = await Promise.all([
        apiGet<PreviewResponse>("/api/admin/audit-retention/preview"),
        apiGet<{ items: RetentionJob[] }>("/api/admin/audit-retention/jobs"),
        isOwner
          ? apiGet<{ items: LegalHold[] }>("/api/admin/audit-holds")
          : Promise.resolve({ items: [] as LegalHold[] }),
      ]);
      setData(preview);
      setJobs(jobData.items);
      setHolds(holdData.items);
    } catch {
      toast.error("加载审计保留信息失败");
    } finally {
      setLoading(false);
    }
  }, [isOwner, toast]);

  useEffect(() => {
    deferInEffect(load);
  }, [load]);

  const execute = async () => {
    if (!data) return;
    if (!localOnlyAck) {
      toast.error("请先确认本地归档是唯一副本");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/admin/audit-retention/execute", {
        reason,
        confirmation,
        totpCode,
        localOnlyAck: true,
        previewHash: data.preview.previewHash,
      });
      toast.success("清理任务已创建，worker 将在 1 分钟内执行");
      setExecuteOpen(false);
      setReason("");
      setConfirmation("");
      setTotpCode("");
      setLocalOnlyAck(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建清理任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  const createHold = async () => {
    setSubmitting(true);
    try {
      await apiPost("/api/admin/audit-holds", {
        targetType: holdForm.targetType || undefined,
        targetId: holdForm.targetId || undefined,
        userId: holdForm.userId || undefined,
        adminId: holdForm.adminId || undefined,
        reason: holdForm.reason,
        totpCode: holdForm.totpCode,
      });
      toast.success("法律保留已设置");
      setHoldOpen(false);
      setHoldForm({
        targetType: "",
        targetId: "",
        userId: "",
        adminId: "",
        reason: "",
        totpCode: "",
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置法律保留失败");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelJob = async (id: string) => {
    setSubmitting(true);
    try {
      await apiPost(`/api/admin/audit-retention/jobs/${id}/cancel`, {});
      toast.success("清理任务已取消");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消失败");
    } finally {
      setSubmitting(false);
    }
  };

  const release = async () => {
    if (!releaseHold) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/admin/audit-holds/${releaseHold.id}/release`, {
        reason: releaseReason,
        totpCode: releaseCode,
      });
      toast.success("法律保留已解除");
      setReleaseHold(null);
      setReleaseReason("");
      setReleaseCode("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解除法律保留失败");
    } finally {
      setSubmitting(false);
    }
  };

  const disabledReason = !data
    ? "加载中"
    : !data.enabled
      ? "AUDIT_RETENTION_ENABLED 未开启"
      : !data.allowLocalOnly
        ? "未确认本地唯一副本"
        : data.preview.expectedCount === 0
          ? "当前没有到期数据"
          : !isOwner
            ? "仅 owner 可执行"
            : "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="审计保留"
        description="到期清理默认不自动执行；仅 owner 可通过 TOTP 发起，独立 worker 使用 audit_retention 角色执行"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={load}
          >
            刷新
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">可删除记录</p>
          <p className="mt-1 text-2xl font-semibold">{data?.preview.expectedCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">预计释放空间</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatBytes(data?.preview.expectedBytes ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">法律保留排除</p>
          <p className="mt-1 text-2xl font-semibold">{data?.preview.holdsExcluded ?? 0}</p>
        </div>
        <div className="rounded-xl border border-brand-charcoal/10 bg-white p-4">
          <p className="text-xs text-brand-charcoal/60">清理开关</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
            {data?.enabled ? (
              <Badge variant="success">已启用</Badge>
            ) : (
              <Badge variant="warning">未启用</Badge>
            )}
            {data?.allowLocalOnly ? (
              <Badge variant="danger">本地唯一副本</Badge>
            ) : (
              <Badge variant="secondary">未确认本地唯一副本</Badge>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-charcoal">到期预览</h3>
            <p className="mt-1 text-xs text-brand-charcoal/60">
              AuditLog 保留 1825 天 / SSO 保留 730 天；当前最早数据尚未到期。
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="h-4 w-4" />}
            disabled={Boolean(disabledReason)}
            title={disabledReason || "执行到期清理"}
            onClick={() => setExecuteOpen(true)}
          >
            {isOwner ? "执行到期清理" : "仅 owner 可执行"}
          </Button>
        </div>

        {data && data.preview.warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              删除前必须处理的警告
            </div>
            <ul className="list-disc space-y-1 pl-5">
              {data.preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-brand-charcoal/10 text-left text-xs text-brand-charcoal/60">
              <tr>
                <th className="py-2 pr-3 font-medium">流</th>
                <th className="py-2 pr-3 font-medium">日期</th>
                <th className="py-2 pr-3 text-right font-medium">条数</th>
                <th className="py-2 pr-3 text-right font-medium">可删</th>
                <th className="py-2 pr-3 text-right font-medium">大小</th>
                <th className="py-2 pr-3 text-center font-medium">归档</th>
                <th className="py-2 pr-3 text-center font-medium">备份</th>
                <th className="py-2 text-right font-medium">Hold 排除</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-brand-charcoal/60">
                    加载中...
                  </td>
                </tr>
              ) : data && data.preview.buckets.length > 0 ? (
                data.preview.buckets.map((bucket) => (
                  <tr
                    key={`${bucket.stream}-${bucket.day}`}
                    className="border-b border-brand-charcoal/5"
                  >
                    <td className="py-2 pr-3">
                      <Badge variant={bucket.stream === "audit" ? "primary" : "secondary"}>
                        {bucket.stream === "audit" ? "管理审计" : "SSO"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{bucket.day}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{bucket.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{bucket.eligible}</td>
                    <td className="py-2 pr-3 text-right text-xs text-brand-charcoal/60">
                      {formatBytes(bucket.bytes)}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Badge variant={bucket.archiveVerified ? "success" : "danger"}>
                        {bucket.archiveVerified ? "OK" : "缺失"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Badge variant={bucket.backupVerified ? "success" : "danger"}>
                        {bucket.backupVerified ? "OK" : "缺失"}
                      </Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">{bucket.holdsExcluded}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-brand-charcoal/60">
                    当前没有到期待删除数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-brand-charcoal">清理任务</h3>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Lock className="h-4 w-4" />}
              onClick={() => setHoldOpen(true)}
            >
              设置法律保留
            </Button>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-brand-charcoal/10 text-left text-xs text-brand-charcoal/60">
              <tr>
                <th className="py-2 pr-3 font-medium">创建时间</th>
                <th className="py-2 pr-3 font-medium">申请人</th>
                <th className="py-2 pr-3 font-medium">原因</th>
                <th className="py-2 pr-3 text-center font-medium">状态</th>
                <th className="py-2 pr-3 text-right font-medium">预计/实际</th>
                <th className="py-2 pr-3 text-right font-medium">完成</th>
                <th className="py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-brand-charcoal/60">
                    暂无清理任务
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="border-b border-brand-charcoal/5">
                    <td className="py-2 pr-3 text-xs">{formatDate(job.createdAt)}</td>
                    <td className="py-2 pr-3 text-xs">{job.requestedByEmail ?? "-"}</td>
                    <td className="max-w-[260px] truncate py-2 pr-3 text-xs" title={job.reason}>
                      {job.reason}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Badge
                        variant={
                          job.status === "SUCCEEDED"
                            ? "success"
                            : job.status === "FAILED" || job.status === "EXPIRED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums">
                      {job.expectedCount} / {job.deletedCount}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs">
                      {job.finishedAt ? formatDate(job.finishedAt) : "-"}
                    </td>
                    <td className="py-2 text-right">
                      {isOwner && job.status === "PENDING" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={submitting}
                          onClick={() => void cancelJob(job.id)}
                        >
                          取消
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOwner && (
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-charcoal">法律保留</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-brand-charcoal/10 text-left text-xs text-brand-charcoal/60">
                <tr>
                  <th className="py-2 pr-3 font-medium">目标</th>
                  <th className="py-2 pr-3 font-medium">原因</th>
                  <th className="py-2 pr-3 font-medium">创建</th>
                  <th className="py-2 pr-3 text-center font-medium">状态</th>
                  <th className="py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {holds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-brand-charcoal/60">
                      暂无法律保留
                    </td>
                  </tr>
                ) : (
                  holds.map((hold) => (
                    <tr key={hold.id} className="border-b border-brand-charcoal/5">
                      <td className="py-2 pr-3 text-xs">
                        {hold.targetType
                          ? `${hold.targetType}:${hold.targetId}`
                          : hold.userId
                            ? `user:${hold.userId}`
                            : `admin:${hold.adminId}`}
                      </td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-xs" title={hold.reason}>
                        {hold.reason}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {formatDate(hold.createdAt)}
                        <span className="ml-1 text-brand-charcoal/50">{hold.createdByEmail}</span>
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <Badge variant={hold.active ? "danger" : "secondary"}>
                          {hold.active ? "生效中" : "已解除"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {hold.active && (
                          <Button variant="ghost" size="sm" onClick={() => setReleaseHold(hold)}>
                            解除
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={executeOpen}
        onClose={() => setExecuteOpen(false)}
        title="执行审计到期清理"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <ShieldAlert className="h-4 w-4" />
              不可逆操作
            </div>
            将删除已归档且超过保留期的审计记录。当前没有异地备份，本地归档是唯一副本。
          </div>
          <div className="rounded-lg bg-brand-charcoal/[0.03] p-3 text-sm">
            预计删除 <strong>{data?.preview.expectedCount ?? 0}</strong> 条，释放{" "}
            <strong>{formatBytes(data?.preview.expectedBytes ?? 0)}</strong>；法律保留排除{" "}
            <strong>{data?.preview.holdsExcluded ?? 0}</strong> 条。
          </div>
          <Input
            label="原因（至少 10 字）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Input
            label="确认短语"
            placeholder="输入：确认删除审计日志"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Input
            label="TOTP 验证码"
            placeholder="6 位动态验证码或备用码"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.trim())}
            autoComplete="one-time-code"
          />
          <Checkbox
            checked={localOnlyAck}
            onChange={setLocalOnlyAck}
            label="我确认本地归档是唯一副本，并接受磁盘损坏会丢失数据"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setExecuteOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={submitting}
              disabled={
                reason.trim().length < 10 ||
                confirmation !== "确认删除审计日志" ||
                totpCode.length < 6 ||
                !localOnlyAck
              }
              onClick={() => void execute()}
            >
              确认执行
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="设置法律保留" size="md">
        <div className="space-y-4">
          <p className="text-xs text-brand-charcoal/60">
            至少填写 targetType + targetId、userId、adminId 之一。命中的审计记录不会被到期清理。
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="目标类型"
              placeholder="user / admin / order..."
              value={holdForm.targetType}
              onChange={(e) => setHoldForm({ ...holdForm, targetType: e.target.value })}
            />
            <Input
              label="目标 ID"
              value={holdForm.targetId}
              onChange={(e) => setHoldForm({ ...holdForm, targetId: e.target.value })}
            />
            <Input
              label="用户 ID"
              value={holdForm.userId}
              onChange={(e) => setHoldForm({ ...holdForm, userId: e.target.value })}
            />
            <Input
              label="管理员 ID"
              value={holdForm.adminId}
              onChange={(e) => setHoldForm({ ...holdForm, adminId: e.target.value })}
            />
          </div>
          <Input
            label="原因"
            value={holdForm.reason}
            onChange={(e) => setHoldForm({ ...holdForm, reason: e.target.value })}
          />
          <Input
            label="TOTP 验证码"
            value={holdForm.totpCode}
            onChange={(e) => setHoldForm({ ...holdForm, totpCode: e.target.value.trim() })}
            autoComplete="one-time-code"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setHoldOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              loading={submitting}
              disabled={
                holdForm.reason.trim().length < 5 ||
                holdForm.totpCode.length < 6 ||
                !((holdForm.targetType && holdForm.targetId) || holdForm.userId || holdForm.adminId)
              }
              onClick={() => void createHold()}
            >
              设置
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(releaseHold)}
        onClose={() => setReleaseHold(null)}
        title="解除法律保留"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-brand-charcoal/60">
            解除后，命中该目标的审计记录将重新参与到期清理。
          </p>
          <Input
            label="原因"
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
          />
          <Input
            label="TOTP 验证码"
            value={releaseCode}
            onChange={(e) => setReleaseCode(e.target.value.trim())}
            autoComplete="one-time-code"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setReleaseHold(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={submitting}
              disabled={releaseReason.trim().length < 5 || releaseCode.length < 6}
              onClick={() => void release()}
            >
              解除
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function AuditRetentionPage() {
  return (
    <RequirePermission permission="audit:retention:read">
      <RetentionContent />
    </RequirePermission>
  );
}
