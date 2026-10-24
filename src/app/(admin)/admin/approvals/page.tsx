"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Copy, Plus, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { ApprovalRequestDialog } from "@/components/admin/ApprovalRequestDialog";
import { PageHeader, RequirePermission } from "@/components/admin";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatDateTimeSeconds } from "@/lib/format";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useFreshTotpConfirm } from "@/hooks/useFreshTotpConfirm";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { APPROVAL_POLICIES, type ApprovalPolicyKey } from "@/lib/admin-approval-policy";

interface ApprovalItem {
  id: string;
  policyKey: string;
  action: string;
  executionMode: "AUTO" | "REQUESTER";
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  targetSnapshot: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  reason: string;
  requesterId: string;
  requesterEmail: string | null;
  requesterName: string | null;
  requesterRole: string;
  status: string;
  approverId: string | null;
  approverEmail: string | null;
  approverName: string | null;
  approvedAt: string | null;
  approvalTotpVerifiedAt: string | null;
  decisionNote: string | null;
  executionResult: Record<string, unknown> | null;
  executedAt: string | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: ApprovalItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_META: Record<
  string,
  { label: string; variant: "success" | "danger" | "warning" | "primary" | "secondary" }
> = {
  PENDING: { label: "待审批", variant: "warning" },
  APPROVED: { label: "已通过待执行", variant: "primary" },
  EXECUTING: { label: "执行中", variant: "primary" },
  EXECUTED: { label: "已执行", variant: "success" },
  REJECTED: { label: "已拒绝", variant: "danger" },
  CANCELLED: { label: "已撤回", variant: "secondary" },
  EXPIRED: { label: "已过期", variant: "secondary" },
  EXECUTION_FAILED: { label: "执行失败", variant: "danger" },
  STALE: { label: "目标已变化", variant: "warning" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待审批" },
  { value: "APPROVED", label: "已通过待执行" },
  { value: "EXECUTED", label: "已执行" },
  { value: "REJECTED", label: "已拒绝" },
  { value: "EXPIRED", label: "已过期" },
  { value: "EXECUTION_FAILED", label: "执行失败" },
  { value: "STALE", label: "目标已变化" },
];

function policyLabel(item: ApprovalItem): string {
  return APPROVAL_POLICIES[item.policyKey as ApprovalPolicyKey]?.label ?? item.policyKey;
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, variant: "secondary" as const };
}

function actorName(name: string | null, email: string | null, fallback: string): string {
  return name || email || fallback;
}

export default function ApprovalsPage() {
  return (
    <RequirePermission permissions={["approvals:request", "approvals:review"]}>
      <ApprovalsContent />
    </RequirePermission>
  );
}

function ApprovalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { can, id: currentAdminId, role } = useAdminPermissions();
  const canReview = role === "owner" && can("approvals:review");
  const { requireFreshTotp, freshTotpModal } = useFreshTotpConfirm();

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const status = searchParams.get("status") || "";

  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [secretSaved, setSecretSaved] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const takeLatest = useLatestRequest();
  const fetchItems = useCallback(async () => {
    const isLatest = takeLatest();
    setLoading(true);
    try {
      const data = await apiGet<ListResponse>("/api/admin/approvals", {
        page,
        pageSize: 20,
        status: status || undefined,
      });
      if (!isLatest()) return;
      setItems(data.items);
      setPagination(data.pagination);
      setLoadError(false);
    } catch (error) {
      if (!isLatest()) return;
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "加载审批申请失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, status, takeLatest, toast]);

  useEffect(() => {
    deferInEffect(fetchItems);
  }, [fetchItems]);


  const updateParams = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    if (!next.page) params.set("page", "1");
    router.push(`/admin/approvals?${params.toString()}`);
  };

  const isRequester = selected?.requesterId === currentAdminId;
  const canRetry =
    selected?.status === "EXECUTION_FAILED" &&
    (selected.executionMode === "AUTO" ? canReview : Boolean(isRequester));

  const refreshSelected = async (id: string) => {
    try {
      const data = await apiGet<ApprovalItem>(`/api/admin/approvals/${id}`);
      setSelected(data);
    } catch {
      // list refresh below is enough
    }
  };

  const handleDecision = async (kind: "approve" | "reject") => {
    if (!selected) return;
    if (kind === "reject" && note.trim().length < 2) {
      toast.error("请填写拒绝原因");
      return;
    }
    const code = await requireFreshTotp(
      kind === "approve"
        ? "通过后系统将执行该操作；请输入一次性验证码确认"
        : "拒绝该申请需要一次性验证码确认"
    );
    if (!code) return;

    setActionLoading(kind);
    try {
      const data = await apiPost<{
        request: ApprovalItem | null;
        execution: { ok: boolean; status: string; error?: string } | null;
      }>(`/api/admin/approvals/${selected.id}/${kind}`, {
        totpCode: code,
        note: note.trim() || undefined,
      });
      if (data.execution && !data.execution.ok) {
        toast.error(data.execution.error || "审批已通过，但执行失败");
      } else {
        toast.success(kind === "approve" ? "审批已通过" : "申请已拒绝");
      }
      setNote("");
      await fetchItems();
      if (data.request) {
        await refreshSelected(data.request.id);
      } else {
        setSelected(null);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "审批操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!selected) return;
    setActionLoading("cancel");
    try {
      await apiPost(`/api/admin/approvals/${selected.id}/cancel`);
      toast.success("申请已撤回");
      setSelected(null);
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "撤回失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async () => {
    if (!selected) return;
    const code = await requireFreshTotp("执行审批并领取一次性密钥需要验证身份");
    if (!code) return;

    setActionLoading("execute");
    try {
      const data = await apiPost<{
        secret: string | null;
        execution: { ok: boolean; status: string; error?: string };
      }>(`/api/admin/approvals/${selected.id}/execute`, { totpCode: code });
      if (data.secret) {
        setSecret(data.secret);
        setSecretSaved(false);
        setSecretOpen(true);
      } else if (!data.execution.ok) {
        toast.error(data.execution.error || "执行失败");
      } else {
        toast.success("执行完成");
      }
      await fetchItems();
      await refreshSelected(selected.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "执行失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async () => {
    if (!selected) return;
    const code = await requireFreshTotp("重试将再次执行该审批操作，请输入一次性验证码确认");
    if (!code) return;

    setActionLoading("retry");
    try {
      const data = await apiPost<{
        secret: string | null;
        execution: { ok: boolean; status: string; error?: string };
      }>(`/api/admin/approvals/${selected.id}/retry`, { totpCode: code });
      if (data.secret) {
        setSecret(data.secret);
        setSecretSaved(false);
        setSecretOpen(true);
      } else if (!data.execution.ok) {
        toast.error(data.execution.error || "重试执行失败");
      } else {
        toast.success("重试执行完成");
      }
      await fetchItems();
      await refreshSelected(selected.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "重试失败");
    } finally {
      setActionLoading(null);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const statusTabs = STATUS_OPTIONS;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="审批中心"
        description="非 owner 发起的高风险操作，经 owner 审批后执行或由申请人领取一次性密钥"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {role !== "owner" && can("approvals:request") && (
              <Button
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setRequestOpen(true)}
              >
                发起审批
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchItems}
            >
              刷新
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-44">
            <Select
              label="状态"
              options={statusTabs}
              value={status}
              onChange={(event) => updateParams({ status: event.target.value })}
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-red-500">加载失败</p>
          <Button variant="outline" size="sm" onClick={fetchItems}>
            重试
          </Button>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-brand-charcoal/[0.04]" />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <Empty
          title="暂无审批申请"
          description="达到审批条件的操作会出现在这里"
          className="rounded-2xl border border-brand-charcoal/10 bg-white py-12"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const meta = statusMeta(item.status);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item);
                  setNote("");
                }}
                className="w-full rounded-2xl border border-brand-charcoal/10 bg-white p-4 text-left transition-colors hover:border-brand-primary/30 hover:bg-brand-primary/[0.02]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-charcoal">
                    {policyLabel(item)}
                  </span>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  <Badge variant="secondary">
                    {item.executionMode === "AUTO" ? "自动执行" : "申请人执行"}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-brand-charcoal/65 sm:grid-cols-2 lg:grid-cols-4">
                  <span className="truncate">
                    申请人：{actorName(item.requesterName, item.requesterEmail, item.requesterId)}
                  </span>
                  <span className="truncate">对象：{item.targetLabel || item.targetId || "-"}</span>
                  <span>创建：{formatDateTimeSeconds(item.createdAt)}</span>
                  <span>过期：{formatDateTimeSeconds(item.expiresAt)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-brand-charcoal/65">{item.reason}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-brand-primary">
                  <Clock className="h-3.5 w-3.5" />
                  查看详情与操作
                </div>
              </button>
            );
          })}
        </div>
      )}

      {pagination.total > 0 && (
        <div className="flex justify-center">
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={(nextPage) => updateParams({ page: String(nextPage) })}
          />
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => {
          if (!actionLoading) setSelected(null);
        }}
        title="审批详情"
        size="lg"
        mobileFullScreen
        closeGuard={() => !actionLoading}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-brand-charcoal">
                {policyLabel(selected)}
              </span>
              <Badge variant={statusMeta(selected.status).variant}>
                {statusMeta(selected.status).label}
              </Badge>
              <Badge variant="secondary">
                {selected.executionMode === "AUTO" ? "自动执行" : "申请人执行"}
              </Badge>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <p className="text-xs text-brand-charcoal/65">申请人</p>
                <p className="mt-1 font-medium">
                  {actorName(selected.requesterName, selected.requesterEmail, selected.requesterId)}
                </p>
                <p className="text-xs text-brand-charcoal/65">{selected.requesterRole}</p>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <p className="text-xs text-brand-charcoal/65">审批人</p>
                <p className="mt-1 font-medium">
                  {selected.approverId
                    ? actorName(selected.approverName, selected.approverEmail, selected.approverId)
                    : "待审批"}
                </p>
                {selected.approvedAt && (
                  <p className="text-xs text-brand-charcoal/65">
                    {formatDateTimeSeconds(selected.approvedAt)}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <p className="text-xs text-brand-charcoal/65">对象</p>
                <p className="mt-1 break-all font-medium">
                  {selected.targetLabel || selected.targetId || "-"}
                </p>
              </div>
              <div className="rounded-lg bg-brand-charcoal/[0.03] p-3">
                <p className="text-xs text-brand-charcoal/65">时间</p>
                <p className="mt-1 font-medium">创建 {formatDateTimeSeconds(selected.createdAt)}</p>
                <p className="text-xs text-brand-charcoal/65">
                  过期 {formatDateTimeSeconds(selected.expiresAt)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-brand-charcoal/65">申请原因</p>
              <p className="rounded-lg bg-brand-charcoal/[0.03] p-3 text-sm text-brand-charcoal/80">
                {selected.reason}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-brand-charcoal/65">申请参数</p>
                <pre className="max-h-52 overflow-auto rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 text-xs">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-brand-charcoal/65">目标快照</p>
                <pre className="max-h-52 overflow-auto rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 text-xs">
                  {JSON.stringify(selected.targetSnapshot, null, 2)}
                </pre>
              </div>
            </div>

            {selected.decisionNote && (
              <div>
                <p className="mb-1 text-xs font-medium text-brand-charcoal/65">审批备注</p>
                <p className="rounded-lg bg-brand-charcoal/[0.03] p-3 text-sm">
                  {selected.decisionNote}
                </p>
              </div>
            )}

            {selected.executionResult && (
              <div>
                <p className="mb-1 text-xs font-medium text-brand-charcoal/65">执行结果</p>
                <pre className="max-h-40 overflow-auto rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 text-xs">
                  {JSON.stringify(selected.executionResult, null, 2)}
                </pre>
              </div>
            )}

            {selected.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {selected.error}
              </p>
            )}

            {canReview && selected.status === "PENDING" && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                  <ShieldCheck className="h-4 w-4" />
                  审批操作
                </p>
                <Textarea
                  label="审批备注"
                  placeholder="通过可选填；拒绝必须填写原因"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    leftIcon={<XCircle className="h-4 w-4" />}
                    loading={actionLoading === "reject"}
                    onClick={() => void handleDecision("reject")}
                  >
                    拒绝
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                    loading={actionLoading === "approve"}
                    onClick={() => void handleDecision("approve")}
                  >
                    通过
                  </Button>
                </div>
              </div>
            )}

            {isRequester && selected.status === "PENDING" && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  loading={actionLoading === "cancel"}
                  onClick={() => void handleCancel()}
                >
                  撤回申请
                </Button>
              </div>
            )}

            {isRequester &&
              selected.status === "APPROVED" &&
              selected.executionMode === "REQUESTER" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-sm text-emerald-800">
                    owner 已通过。执行后一次性密钥只显示一次，请准备好接收方。
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      loading={actionLoading === "execute"}
                      onClick={() => void handleExecute()}
                    >
                      执行并领取密钥
                    </Button>
                  </div>
                </div>
              )}

            {canRetry && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                <p className="text-sm text-red-800">上次执行失败，可重新执行。</p>
                {selected.error && (
                  <p className="mt-1 break-all text-xs text-red-700">{selected.error}</p>
                )}
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    loading={actionLoading === "retry"}
                    onClick={() => void handleRetry()}
                  >
                    重试执行
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={secretOpen}
        onClose={() => {
          if (secretSaved) {
            setSecretOpen(false);
            setSecret(null);
          }
        }}
        title="一次性密钥"
        size="md"
        closeOnBackdrop={false}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-brand-charcoal/70">
              <input
                type="checkbox"
                checked={secretSaved}
                onChange={(event) => setSecretSaved(event.target.checked)}
              />
              我已安全保存，关闭后无法再次查看
            </label>
            <Button
              size="sm"
              disabled={!secretSaved}
              onClick={() => {
                setSecretOpen(false);
                setSecret(null);
              }}
            >
              关闭
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-amber-800">
            该密钥只显示一次，不会写入数据库或审计日志。关闭后只能重新发起申请。
          </p>
          <pre className="break-all rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.03] p-3 text-sm">
            {secret}
          </pre>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Copy className="h-4 w-4" />}
            onClick={() => void copySecret()}
          >
            复制密钥
          </Button>
        </div>
      </Modal>

      {requestOpen && (
        <ApprovalRequestDialog open onClose={() => setRequestOpen(false)} onCreated={fetchItems} />
      )}

      {freshTotpModal}
    </div>
  );
}
