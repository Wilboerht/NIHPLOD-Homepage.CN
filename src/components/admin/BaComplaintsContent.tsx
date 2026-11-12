"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSearch,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { PanelCard } from "@/components/admin/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type {
  BaComplaintActionData,
  BaComplaintDetailData,
  BaComplaintListData,
  BaComplaintStatus,
} from "@/lib/ba-complaints";

const STATUS_LABELS: Record<BaComplaintStatus, string> = {
  PENDING: "待处理",
  INVESTIGATING: "调查中",
  RESOLVED: "已解决",
  REJECTED: "已驳回",
};

const STATUS_VARIANTS: Record<
  BaComplaintStatus,
  "warning" | "primary" | "success" | "secondary"
> = {
  PENDING: "warning",
  INVESTIGATING: "primary",
  RESOLVED: "success",
  REJECTED: "secondary",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "全部状态" },
  { value: "PENDING", label: "待处理" },
  { value: "INVESTIGATING", label: "调查中" },
  { value: "RESOLVED", label: "已解决" },
  { value: "REJECTED", label: "已驳回" },
];

const TRANSITIONS: Record<BaComplaintStatus, BaComplaintStatus[]> = {
  PENDING: ["INVESTIGATING", "RESOLVED", "REJECTED"],
  INVESTIGATING: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusIcon(status: BaComplaintStatus) {
  if (status === "PENDING") return <Clock className="h-3.5 w-3.5" />;
  if (status === "INVESTIGATING") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (status === "RESOLVED") return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[7rem_1fr]">
      <span className="text-brand-charcoal/50">{label}</span>
      <div className="min-w-0 text-brand-charcoal">{children}</div>
    </div>
  );
}

export function BaComplaintsContent({ sourceTabs }: { sourceTabs?: ReactNode }) {
  const { can } = useAdminPermissions();
  const { success, error: showError } = useToast();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("id");
  const canWrite = can("ba:complaints:write");
  const canDelete = can("ba:complaints:delete");

  const [items, setItems] = useState<BaComplaintListData["items"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const takeLatestList = useLatestRequest();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BaComplaintDetailData | null>(null);
  const [detailSensitive, setDetailSensitive] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const takeLatestDetail = useLatestRequest();

  useEffect(() => {
    if (deepLinkId) {
      deferInEffect(() => setSelectedId(deepLinkId));
    }
  }, [deepLinkId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadList = useCallback(async () => {
    const isLatest = takeLatestList();
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        status,
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const data = await apiGet<BaComplaintListData>(
        `/api/admin/subsites/ba/complaints?${params.toString()}`
      );
      if (!isLatest()) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(err instanceof ApiError ? err.message : "加载 BA 举报失败");
      setItems([]);
      setTotal(0);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [debouncedSearch, page, status, takeLatestList]);

  useEffect(() => {
    deferInEffect(loadList);
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string) => {
      const isLatest = takeLatestDetail();
      setDetailLoading(true);
      setDetailError(null);
      try {
        const response = await apiGet<BaComplaintDetailData & { sensitive: boolean }>(
          `/api/admin/subsites/ba/complaints/${encodeURIComponent(id)}`
        );
        if (!isLatest()) return;
        setDetail(response);
        setDetailSensitive(Boolean(response.sensitive));
        setReviewNote(response.complaint.reviewNote ?? "");
      } catch (err) {
        if (!isLatest()) return;
        setDetailError(err instanceof ApiError ? err.message : "加载举报详情失败");
        setDetail(null);
      } finally {
        if (isLatest()) setDetailLoading(false);
      }
    },
    [takeLatestDetail]
  );

  useEffect(() => {
    if (!selectedId) {
      deferInEffect(() => {
        setDetail(null);
        setDetailError(null);
      });
      return;
    }
    deferInEffect(() => loadDetail(selectedId));
  }, [selectedId, loadDetail]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setReviewNote("");
  };

  const closeDetail = () => {
    if (actionLoading) return;
    setSelectedId(null);
    setDeleteOpen(false);
  };

  const submitAction = async (nextStatus?: BaComplaintStatus) => {
    if (!selectedId || !detail) return;
    setActionLoading(nextStatus ?? "note");
    try {
      const data = await apiPatch<BaComplaintActionData>(
        `/api/admin/subsites/ba/complaints/${encodeURIComponent(selectedId)}`,
        {
          ...(nextStatus ? { status: nextStatus } : {}),
          review_note: reviewNote,
        }
      );
      success(nextStatus ? `举报已更新为「${STATUS_LABELS[nextStatus]}」` : "审核备注已保存");
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              complaint: {
                ...prev.complaint,
                status: data.status,
                reviewNote: data.reviewNote,
                handledBy: data.handledBy,
                updatedAt: new Date().toISOString(),
              },
            }
          : prev
      );
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "操作失败");
      if (err instanceof ApiError && err.status === 409) {
        await loadDetail(selectedId);
        await loadList();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!selectedId) return;
    setActionLoading("delete");
    try {
      await apiDelete(`/api/admin/subsites/ba/complaints/${encodeURIComponent(selectedId)}`);
      success("举报已删除（软删除，证据与审计保留）");
      setDeleteOpen(false);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "删除失败");
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const currentStatus = detail?.complaint.status;
  const nextStatuses = currentStatus ? TRANSITIONS[currentStatus] : [];
  const evidence = detail?.complaint.evidence ?? [];
  const auditLogs = detail?.auditLogs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="留言管理"
        description={<>BA 举报共 {total} 条</>}
        actions={
          <>
            {sourceTabs}
            <Button variant="outline" size="sm" onClick={loadList} loading={loading}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      <PanelCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
            <Input
              aria-label="搜索举报编号、渠道或描述"
              placeholder="搜索编号 / 渠道 / 描述"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="按举报状态筛选"
            />
          </div>
          {(search || status !== "ALL") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
                setPage(1);
              }}
            >
              <X className="mr-1 h-4 w-4" />
              清除筛选
            </Button>
          )}
        </div>
      </PanelCard>

      {loadError && (
        <PanelCard className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </PanelCard>
      )}

      <PanelCard className="overflow-hidden p-0">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-brand-charcoal/[0.04]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <FileSearch className="h-8 w-8 text-brand-charcoal/30" />
            <p className="text-sm text-brand-charcoal/60">暂无 BA 举报</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-xs text-brand-charcoal/55">
                  <th className="px-4 py-3 font-medium">举报编号</th>
                  <th className="px-4 py-3 font-medium">渠道</th>
                  <th className="px-4 py-3 font-medium">摘要</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">处理人</th>
                  <th className="px-4 py-3 font-medium">提交时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-brand-charcoal/5 last:border-0 hover:bg-brand-charcoal/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-brand-charcoal/65">
                      {item.id.slice(0, 8)}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3">{item.channel || "—"}</td>
                    <td className="max-w-[18rem] truncate px-4 py-3 text-brand-charcoal/75">
                      {item.descriptionPreview}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[item.status]}>
                        <span className="mr-1 inline-flex">{statusIcon(item.status)}</span>
                        {STATUS_LABELS[item.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-charcoal/65">{item.handledBy || "—"}</td>
                    <td className="px-4 py-3 text-xs text-brand-charcoal/55">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(item.id)}>
                        查看
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-brand-charcoal/60">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            下一页
          </Button>
        </div>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={closeDetail}
        title="BA 举报详情"
        size="lg"
        closeGuard={() => !actionLoading}
      >
        {detailLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-4 animate-pulse rounded bg-brand-charcoal/[0.05]" />
            ))}
          </div>
        ) : detailError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {detailError}
          </div>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANTS[detail.complaint.status]}>
                <span className="mr-1 inline-flex">{statusIcon(detail.complaint.status)}</span>
                {STATUS_LABELS[detail.complaint.status]}
              </Badge>
              <span className="font-mono text-xs text-brand-charcoal/55">
                #{detail.complaint.id.slice(0, 8)}
              </span>
              <span className="text-xs text-brand-charcoal/45">
                提交于 {formatDateTime(detail.complaint.createdAt)}
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-brand-charcoal/10 p-4">
              <DetailRow label="举报内容">
                <p className="whitespace-pre-wrap break-words">{detail.complaint.description}</p>
              </DetailRow>
              <DetailRow label="违规渠道">{detail.complaint.channel || "—"}</DetailRow>
              <DetailRow label="联系方式">
                {detail.complaint.contactInfo || (
                  <span className="text-brand-charcoal/45">
                    {detailSensitive ? "未填写" : "无权限查看（需敏感信息权限）"}
                  </span>
                )}
              </DetailRow>
              <DetailRow label="处理人">{detail.complaint.handledBy || "—"}</DetailRow>
              <DetailRow label="最近更新">{formatDateTime(detail.complaint.updatedAt)}</DetailRow>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-brand-charcoal">
                <ImageIcon className="h-4 w-4" />
                证据图片（{detail.complaint.evidenceCount}）
              </div>
              {evidence.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {evidence.map((image) => (
                    <a
                      key={`${image.index}-${image.url}`}
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-brand-charcoal/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={`举报证据 ${image.index + 1}`}
                        className="h-28 w-full object-cover transition-transform hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-brand-charcoal/50">
                  {detailSensitive
                    ? detail.complaint.evidenceCount > 0
                      ? "证据图片加载失败"
                      : "无证据图片"
                    : "无权限查看证据（需敏感信息权限）"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-charcoal">审核备注</label>
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                rows={3}
                maxLength={2000}
                disabled={!canWrite || Boolean(actionLoading)}
                className="w-full rounded-xl border border-brand-charcoal/15 bg-white p-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 disabled:bg-brand-charcoal/[0.03]"
                placeholder="内部审核备注（不会直接发送给举报人）"
              />
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitAction()}
                    loading={actionLoading === "note"}
                    disabled={Boolean(actionLoading)}
                  >
                    保存备注
                  </Button>
                  {nextStatuses.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      variant={nextStatus === "REJECTED" ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => submitAction(nextStatus)}
                      loading={actionLoading === nextStatus}
                      disabled={Boolean(actionLoading)}
                    >
                      {nextStatus === "INVESTIGATING" ? "开始调查" : null}
                      {nextStatus === "RESOLVED" ? "标记解决" : null}
                      {nextStatus === "REJECTED" ? "无效驳回" : null}
                    </Button>
                  ))}
                </div>
              )}
              {!canWrite && (
                <p className="text-xs text-brand-charcoal/50">无权限修改举报状态或审核备注。</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-brand-charcoal">状态历史</p>
              {auditLogs.length > 0 ? (
                <ul className="space-y-2 border-l-2 border-brand-charcoal/10 pl-3">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-brand-charcoal">{log.action}</span>
                        <span className="text-xs text-brand-charcoal/50">
                          {log.actorName || "系统"} · {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      {log.comment && (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-brand-charcoal/60">
                          {log.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-brand-charcoal/50">暂无状态历史</p>
              )}
            </div>

            {canDelete && (
              <div className="flex justify-end border-t border-brand-charcoal/10 pt-4">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={Boolean(actionLoading)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  删除举报
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="删除 BA 举报"
        description="确定要删除这条举报吗？软删除后举报列表不再显示，证据与审计保留。"
        confirmText="确认删除"
        loading={actionLoading === "delete"}
        type="danger"
      />
    </div>
  );
}
