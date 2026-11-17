"use client";

/**
 * 消费补录审核后台页面
 * 审核用户提交的全渠道消费凭证，通过后以核实金额累加历史消费（自动重算会员等级）。
 * 权限：查看需 spent:read，代客填写需 spent:create，审核/撤销需 spent:review，
 * Excel 导入需 spent:import；操作写入审计日志。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Undo2,
  UserPlus,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { cn } from "@/lib/utils";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { DataTable, RequirePermission, type Column } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { DateRangeFilter } from "@/components/admin/DateRangeFilter";
import { ApprovalRequestAction } from "@/components/admin/ApprovalRequestAction";
import { APPROVAL_THRESHOLDS } from "@/lib/admin-approval-policy";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import {
  formatDateNumeric as formatDate,
  formatDateTimeNumeric as formatDateTime,
} from "@/lib/format";
import { receiptImageSrc } from "@/lib/spent-adjustment-meta";
import { levelDisplay } from "@/lib/membership";
import { SpentImportModal, ImportHistoryModal } from "./SpentImport";
import { SpentOnBehalfModal } from "./SpentOnBehalf";

type AdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED";
type StatusFilter = "ALL" | AdjustmentStatus;

interface ApplicationItem {
  id: string;
  channel: string;
  channelLabel: string;
  orderNo: string;
  dealerName: string | null;
  amountClaimed: number | null;
  purchasedAt: string | null;
  images: string[];
  note: string | null;
  status: AdjustmentStatus;
  statusLabel: string;
  source: "USER" | "ADMIN";
  sourceLabel: string;
  reviewAmount: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  lastReviewAmount: number | null;
  lastReviewNote: string | null;
  lastReviewedById: string | null;
  lastReviewedAt: string | null;
  undoReason: string | null;
  undoneById: string | null;
  undoneAt: string | null;
  reviewedBy: { name: string; email: string } | null;
  createdByAdmin: { id: string; name: string; email: string } | null;
  createdAt: string;
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    membershipLevel: string;
  };
}

interface ListData {
  applications: ApplicationItem[];
  counts: Record<AdjustmentStatus, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const SPENT_STATUS_META: Record<
  AdjustmentStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  PENDING: { label: "待审核", icon: Clock3, className: "text-status-warning-fg" },
  APPROVED: { label: "已通过", icon: CheckCircle2, className: "text-status-success-fg" },
  REJECTED: { label: "已驳回", icon: XCircle, className: "text-status-danger-fg" },
};

function SpentStatusIcon({
  status,
  showLabel = false,
}: {
  status: AdjustmentStatus;
  showLabel?: boolean;
}) {
  const meta = SPENT_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", meta.className)}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {showLabel ? (
        <span className="text-xs">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "PENDING", label: "待审核" },
  { key: "APPROVED", label: "已通过" },
  { key: "REJECTED", label: "已驳回" },
  { key: "ALL", label: "全部" },
];

function AdminSpentAdjustmentsContent() {
  const { get, getNumber, update } = useListQuery();
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tabParam = get("status", "PENDING");
  const tab: StatusFilter = TABS.some((item) => item.key === tabParam)
    ? (tabParam as StatusFilter)
    : "PENDING";
  const page = getNumber("page", 1);
  const searchParam = get("search");
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");
  const [search, setSearch] = useState(searchParam);
  const [prevSearchParam, setPrevSearchParam] = useState(searchParam);
  if (prevSearchParam !== searchParam) {
    setPrevSearchParam(searchParam);
    setSearch(searchParam);
  }
  const [detail, setDetail] = useState<ApplicationItem | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAmountError, setReviewAmountError] = useState("");
  const [reviewNoteError, setReviewNoteError] = useState("");
  const reviewAmountRef = useRef<HTMLInputElement>(null);
  const reviewNoteRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [undoTarget, setUndoTarget] = useState<ApplicationItem | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  // 每次打开代客补录递增 key，让弹窗以全新表单状态挂载
  const [onBehalfSession, setOnBehalfSession] = useState(0);
  const { success, error: showError } = useToast();

  // 权限：Excel 导入/撤销导入需要 spent:import（与 API 层一致）
  const { can: canAdmin, role, id: currentAdminId } = useAdminPermissions();
  const isOwnerActor = role === "owner";
  const isSelfSubmitted = !!detail && !isOwnerActor && detail.createdByAdmin?.id === currentAdminId;
  const canImport = canAdmin("spent:import");
  const canReadSpent = canAdmin("spent:read");
  const canCreate = canAdmin("spent:create");
  const canReview = canAdmin("spent:review");
  const canRequestApproval = canAdmin("approvals:request");
  const claimedAmount = detail?.amountClaimed ?? 0;
  const typedReviewAmount = Number(reviewAmount);
  const approvalReviewAmount =
    Number.isFinite(typedReviewAmount) && typedReviewAmount > 0 ? typedReviewAmount : claimedAmount;
  const approvalThresholdReached =
    Math.max(claimedAmount, approvalReviewAmount) >= APPROVAL_THRESHOLDS.spentReviewApprove;
  const [serverApprovalRequired, setServerApprovalRequired] = useState(false);
  const requiresOwnerApproval = approvalThresholdReached || serverApprovalRequired;
  const { requireTotp, totpModal } = useTotpConfirm();

  const isReviewDirty =
    detail?.status === "PENDING" &&
    (decision !== "approve" ||
      reviewNote.trim() !== "" ||
      reviewAmount !== (detail.amountClaimed != null ? String(detail.amountClaimed) : ""));
  const { confirmClose: confirmCloseReview } = useUnsavedChanges(isReviewDirty);

  const takeLatestSpent = useLatestRequest();
  const fetchData = useCallback(async () => {
    if (!canReadSpent) {
      setLoading(false);
      return;
    }
    const isLatest = takeLatestSpent();
    setLoading(true);
    try {
      const result = await apiGet<ListData>("/api/admin/spent-adjustments", {
        page,
        pageSize: 20,
        status: tab === "ALL" ? undefined : tab,
        search: searchParam || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (!isLatest()) return;
      setData(result);
      setLoadError(false);
    } catch {
      if (!isLatest()) return;
      setLoadError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
    }, [
    page,
    tab,
    searchParam,
    dateFrom,
    dateTo,
    canReadSpent,
    takeLatestSpent,
  ]);

  useEffect(() => {
    deferInEffect(fetchData);
  }, [fetchData]);

  useEffect(() => {
    const totalPages = data?.pagination.totalPages ?? 0;
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, data?.pagination.totalPages, update]);

  // 搜索防抖写入 URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== searchParam) {
        update({ search: next || null }, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchParam, update]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "ALL") params.set("status", tab);
      if (searchParam) params.set("search", searchParam);
      const dateFrom = get("dateFrom");
      const dateTo = get("dateTo");
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      await downloadFromUrl(
        `/api/admin/spent-adjustments/export?${params.toString()}`,
        "spent-adjustments.csv"
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = (item: ApplicationItem) => {
    setDetail(item);
    setDecision("approve");
    setReviewAmount(item.amountClaimed != null ? String(item.amountClaimed) : "");
    setReviewNote("");
    setReviewAmountError("");
    setReviewNoteError("");
    setServerApprovalRequired(false);
  };

  const handleReview = async () => {
    if (!detail) return;
    if (decision === "approve") {
      const amount = Number(reviewAmount);
      if (!reviewAmount || !Number.isInteger(amount) || amount <= 0) {
        setReviewAmountError("请填写正整数核实金额（元）");
        reviewAmountRef.current?.focus();
        return;
      }
    }
    if (decision === "reject" && !reviewNote.trim()) {
      setReviewNoteError("请填写驳回原因");
      reviewNoteRef.current?.focus();
      return;
    }
    setReviewAmountError("");
    setReviewNoteError("");
    setSaving(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/spent-adjustments/${detail.id}/review`, {
          decision,
          reviewAmount: decision === "approve" ? Number(reviewAmount) : undefined,
          reviewNote: reviewNote.trim() || undefined,
          totpCode,
        });

      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }

      success(decision === "approve" ? "已通过并完成入账" : "已驳回");
      setDetail(null);
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      if (tab !== "ALL" && data?.applications.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchData();
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "APPROVAL_REQUIRED") {
          setServerApprovalRequired(true);
        }
        showError(e.message);
      } else {
        showError("操作失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const openOnBehalf = () => {
    setOnBehalfSession((session) => session + 1);
    setOnBehalfOpen(true);
  };

  const handleOnBehalfCreated = () => {
    setOnBehalfOpen(false);
    window.dispatchEvent(new Event("admin:nav-counts-refresh"));
    success(
      canReview
        ? "代客补录已提交，可在待审核列表中审核"
        : "代客补录已提交，等待有审核权限的同事处理"
    );
    if (!canReadSpent) return;
    if (tab !== "PENDING" || page !== 1 || searchParam) {
      // 清空搜索，避免新建记录被当前筛选条件隐藏
      update({ status: "PENDING", page: "1", search: null });
    } else {
      fetchData();
    }
  };

  const handleUndo = async () => {
    if (!undoTarget || undoing) return;
    setUndoing(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/spent-adjustments/${undoTarget.id}/undo`, {
          totpCode,
          reason: undoReason.trim() || undefined,
        });

      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }

      success("已撤销审核，申请回到待审核队列");
      setUndoTarget(null);
      setUndoReason("");
      setDetail(null);
      window.dispatchEvent(new Event("admin:nav-counts-refresh"));
      if (tab !== "ALL" && data?.applications.length === 1 && page > 1) {
        update({ page: String(page - 1) }, { resetPage: false });
      } else {
        fetchData();
      }
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "撤销失败");
    } finally {
      setUndoing(false);
    }
  };

  // 仅 Excel 导入权限：不加载/渲染审核列表，只展示导入入口
  if (!canReadSpent) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="消费记录审核"
          description="当前账号无补录查看权限"
          actions={
            <>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={openOnBehalf}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  代客补录
                </Button>
              )}
              {canImport && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                    <History className="mr-1.5 h-4 w-4" />
                    导入历史
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                    Excel 导入
                  </Button>
                </>
              )}
            </>
          }
        />
        <div className="rounded-card border border-line bg-white p-6 text-sm text-ink-muted">
          {canCreate && "你可以代客填写消费补录；"}
          {canImport && "你可以导入消费记录；"}
          查看和审核申请需要「消费补录查看」权限。
        </div>
        {canImport && (
          <>
            <SpentImportModal open={importOpen} onClose={() => setImportOpen(false)} />
            <ImportHistoryModal
              key={historyOpen ? "open" : "closed"}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
            />
          </>
        )}
        {canCreate && (
          <SpentOnBehalfModal
            key={onBehalfSession}
            open={onBehalfOpen}
            onClose={() => setOnBehalfOpen(false)}
            onCreated={handleOnBehalfCreated}
          />
        )}
        {totpModal}
      </div>
    );
  }

  const applicationColumns: Column<ApplicationItem>[] = [
    {
      key: "user",
      title: "用户",
      width: "220px",
      render: (_, a) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs text-ink-muted">
            {(a.user.nickname || a.user.phone || "U").charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-brand-charcoal/70">
              {a.user.nickname || "未设置昵称"}
            </p>
            <p className="truncate text-xs text-ink-muted">{a.user.phone}</p>
            {a.source === "ADMIN" && (
              <span className="mt-1 inline-flex rounded-full bg-status-warning-soft px-1.5 py-0.5 text-2xs text-status-warning-strong">
                客服代填{a.createdByAdmin ? ` · ${a.createdByAdmin.name}` : ""}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "channelLabel",
      title: "渠道",
      width: "100px",
      render: (_, a) => <span className="text-brand-charcoal/70">{a.channelLabel}</span>,
    },
    {
      key: "orderNo",
      title: "订单号",
      width: "160px",
      render: (_, a) => (
        <span className="block truncate font-mono text-brand-charcoal/70">{a.orderNo}</span>
      ),
    },
    {
      key: "amountClaimed",
      title: "申报金额",
      width: "110px",
      numeric: true,
      render: (_, a) =>
        a.amountClaimed != null ? `¥${a.amountClaimed.toLocaleString()}` : "-",
    },
    {
      key: "reviewAmount",
      title: "核实金额",
      width: "110px",
      numeric: true,
      render: (_, a) =>
        a.reviewAmount != null ? `¥${a.reviewAmount.toLocaleString()}` : "-",
    },
    {
      key: "purchasedAt",
      title: "消费日期",
      width: "110px",
      render: (_, a) => <span className="text-brand-charcoal/70">{formatDate(a.purchasedAt)}</span>,
    },
    {
      key: "images",
      title: "凭证",
      width: "70px",
      align: "center",
      render: (_, a) => (
        <span className="text-brand-charcoal/70">{a.images.length > 0 ? `${a.images.length} 张` : "-"}</span>
      ),
    },
    {
      key: "status",
      title: "状态",
      width: "64px",
      align: "center",
      render: (_, a) => <SpentStatusIcon status={a.status} />,
    },
    {
      key: "reviewedBy",
      title: "审核人",
      width: "110px",
      render: (_, a) => <span className="text-ink-muted">{a.reviewedBy?.name ?? "-"}</span>,
    },
    {
      key: "reviewedAt",
      title: "审核时间",
      width: "150px",
      render: (_, a) => (
        <span className="text-ink-muted">{a.reviewedAt ? formatDateTime(a.reviewedAt) : "-"}</span>
      ),
    },
    {
      key: "createdAt",
      title: "提交时间",
      width: "150px",
      render: (_, a) => <span className="text-ink-muted">{formatDateTime(a.createdAt)}</span>,
    },
    {
      key: "actions",
      title: "操作",
      width: "60px",
      align: "right",
      render: (_, a) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${a.status === "PENDING" ? "审核" : "查看"} ${a.user.nickname || a.user.phone || "申请"}`}
          onClick={() => openDetail(a)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const renderApplicationMobileCard = (a: ApplicationItem) => (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-charcoal">
            {a.user.nickname || "未设置昵称"}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {a.user.phone} · {a.channelLabel}
          </p>
        </div>
        <SpentStatusIcon status={a.status} showLabel />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
        {a.source === "ADMIN" && (
          <span className="col-span-2 inline-flex w-fit items-center rounded-full bg-status-warning-soft px-2 py-0.5 text-2xs text-status-warning-strong">
            客服代填{a.createdByAdmin ? ` · ${a.createdByAdmin.name}` : ""}
          </span>
        )}
        <span className="col-span-2 truncate">
          订单：<span className="font-mono">{a.orderNo}</span>
        </span>
        <span>
          申报：{a.amountClaimed != null ? `¥${a.amountClaimed.toLocaleString()}` : "-"}
        </span>
        <span>消费：{formatDate(a.purchasedAt)}</span>
        {a.status !== "PENDING" && (
          <>
            <span>
              核实：{a.reviewAmount != null ? `¥${a.reviewAmount.toLocaleString()}` : "-"}
            </span>
            <span>审核人：{a.reviewedBy?.name ?? "-"}</span>
            <span className="col-span-2">
              审核时间：{a.reviewedAt ? formatDateTime(a.reviewedAt) : "-"}
            </span>
          </>
        )}
        <span className="col-span-2">
          凭证：{a.images.length > 0 ? `${a.images.length} 张` : "无"}
        </span>
      </div>
      <div className="mt-3 flex justify-end border-t border-line pt-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${a.status === "PENDING" ? "审核" : "查看"} ${a.user.nickname || a.user.phone || "申请"}`}
          onClick={() => openDetail(a)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="消费记录审核"
        description="审核用户提交的全渠道消费凭证，通过后按核实金额累加历史消费并自动重算会员等级"
        actions={
          <>
            {canCreate && (
              <Button variant="outline" size="sm" onClick={openOnBehalf}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                代客补录
              </Button>
            )}
            {canImport && (
              <>
                <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                  <History className="mr-1.5 h-4 w-4" />
                  导入历史
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                  Excel 导入
                </Button>
              </>
            )}
          <Button
            variant="outline"
            size="sm"
            loading={exporting}
            onClick={() => void exportCsv()}
          >
            <Download className="mr-1.5 h-4 w-4" />
            导出 CSV
          </Button>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      {/* 状态筛选 + 搜索 */}
      <div className="rounded-card border border-line bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div
            role="group"
            aria-label="按审核状态筛选"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1"
          >
            {TABS.map((t) => {
              // “全部”为各状态计数之和；不能用当前筛选的 total（会随 tab 变化）
              const count =
                t.key === "ALL"
                  ? Object.values(data?.counts ?? {}).reduce((sum, n) => sum + n, 0)
                  : (data?.counts[t.key] ?? 0);
              const active = tab === t.key;

  return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ status: t.key })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                    active
                      ? "bg-white font-medium text-brand-charcoal shadow-sm"
                      : "text-ink-muted hover:bg-white/70 hover:text-brand-charcoal"
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums",
                      active
                        ? "bg-brand-primary/10 text-brand-primary"
                        : "bg-surface-hover text-ink-muted"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              aria-label="搜索手机号、订单号或昵称"
              placeholder="搜索手机号 / 订单号 / 昵称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={search ? "pl-10 pr-10" : "pl-10"}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  update({ search: null }, { replace: true });
                }}
                aria-label="清除搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-brand-charcoal"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={({ from, to }) =>
              update({ dateFrom: from || null, dateTo: to || null, page: null })
            }
          />
        </div>
      </div>

      <DataTable
        columns={applicationColumns}
        data={data?.applications ?? []}
        loading={loading}
        error={loadError ? "加载失败，请重试" : null}
        onRetry={fetchData}
        rowKey="id"
        minWidth="1120px"
        emptyText="暂无申请"
        ariaLabel="消费补录审核列表"
        onRowClick={(a) => openDetail(a)}
        pagination={
          pagination
            ? {
                page: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.total,
                onChange: (nextPage) =>
                  update({ page: String(nextPage) }, { resetPage: false }),
              }
            : undefined
        }
        mobileCard={renderApplicationMobileCard}
      />

{/* 详情 / 审核弹窗 */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.status === "PENDING" ? "审核申请" : "申请详情"}
        size="lg"
        mobileFullScreen
        closeOnBackdrop={false}
        closeGuard={() => !saving && confirmCloseReview()}
        footer={
          detail?.status === "PENDING" && canReview && !isSelfSubmitted ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirmCloseReview()) setDetail(null);
                }}
                disabled={saving}
              >
                取消
              </Button>
              {/* 非 owner 且达到审批阈值（按申报/核实较大值）时，不允许直接审核入账 */}
              {!(decision === "approve" && !isOwnerActor && requiresOwnerApproval) && (
                <Button
                  onClick={handleReview}
                  loading={saving}
                  variant={decision === "reject" ? "danger" : "primary"}
                >
                  {decision === "approve" ? "确认通过并入账" : "确认驳回"}
                </Button>
              )}
              {decision === "approve" &&
                !isOwnerActor &&
                canRequestApproval &&
                requiresOwnerApproval && (
                  <ApprovalRequestAction
                    policyKey="spent.review.approve"
                    initialValues={{
                      applicationId: detail.id,
                      reviewAmount: approvalReviewAmount,
                    }}
                    label="申请通过审批"
                  />
                )}
            </div>
          ) : detail?.status === "PENDING" && canReview && isSelfSubmitted ? (
            <p className="text-xs text-ink-muted">
              该申请由你代客提交，按四眼原则需由其他管理员审核。
            </p>
          ) : detail?.status === "APPROVED" && !isOwnerActor && canRequestApproval ? (
            <div className="flex justify-end">
              <ApprovalRequestAction
                policyKey="spent.review.undo"
                initialValues={{ applicationId: detail.id }}
                label="申请撤销审核"
              />
            </div>
          ) : detail?.status === "APPROVED" && canReview && isOwnerActor ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setUndoTarget(detail)} disabled={undoing}>
                <Undo2 className="mr-1.5 h-4 w-4" />
                撤销审核
              </Button>
            </div>
          ) : detail &&
            canRequestApproval &&
            detail.status === "PENDING" &&
            requiresOwnerApproval ? (
            <div className="flex justify-end">
              <ApprovalRequestAction
                policyKey="spent.review.approve"
                initialValues={{
                  applicationId: detail.id,
                  reviewAmount: approvalReviewAmount,
                }}
                label="申请通过审批"
              />
            </div>
          ) : detail && canRequestApproval && detail.status === "APPROVED" ? (
            <div className="flex justify-end">
              <ApprovalRequestAction
                policyKey="spent.review.undo"
                initialValues={{ applicationId: detail.id }}
                label="申请撤销审核"
              />
            </div>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            {/* 申请信息 */}
            <div className="space-y-3 rounded-lg bg-surface-muted p-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-ink-muted">用户</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detail.user.nickname || "-"}（{detail.user.phone}）
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">当前等级</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {levelDisplay(detail.user.membershipLevel)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">提交来源</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detail.sourceLabel}
                    {detail.createdByAdmin ? `（${detail.createdByAdmin.name}）` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">渠道</p>
                  <p className="mt-0.5 text-brand-charcoal/70">{detail.channelLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">订单号 / 小票号</p>
                  <p className="mt-0.5 font-mono text-brand-charcoal/70">{detail.orderNo}</p>
                </div>
                {detail.dealerName && (
                  <div>
                    <p className="text-xs text-ink-muted">经销商名称</p>
                    <p className="mt-0.5 text-brand-charcoal/70">{detail.dealerName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-ink-muted">申报金额</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detail.amountClaimed != null
                      ? `¥${detail.amountClaimed.toLocaleString()}`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">消费日期</p>
                  <p className="mt-0.5 text-brand-charcoal/70">{formatDate(detail.purchasedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">提交时间</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {formatDateTime(detail.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">状态</p>
                  <div className="mt-0.5">
                    <SpentStatusIcon status={detail.status} showLabel />
                  </div>
                </div>
              </div>
              {detail.note && (
                <div>
                  <p className="text-xs text-ink-muted">
                    {detail.channel === "OTHER" ? "用户说明" : "用户备注"}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-brand-charcoal/70">{detail.note}</p>
                </div>
              )}
              {detail.status !== "PENDING" && (
                <div className="grid grid-cols-1 gap-3 border-t border-line-strong pt-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-ink-muted">核实金额</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {detail.reviewAmount != null
                        ? `¥${detail.reviewAmount.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">审核时间</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {formatDateTime(detail.reviewedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">审核人</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {detail.reviewedBy
                        ? `${detail.reviewedBy.name}（${detail.reviewedBy.email}）`
                        : "-"}
                    </p>
                  </div>
                  {detail.reviewNote && (
                    <div className="col-span-2">
                      <p className="text-xs text-ink-muted">审核备注</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-brand-charcoal/70">
                        {detail.reviewNote}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {detail.undoneAt && (
                <div className="rounded-lg border border-status-warning-line bg-status-warning-soft p-3 text-xs text-status-warning-strong">
                  <p>
                    该申请曾于 {formatDateTime(detail.lastReviewedAt)} 审核，后于{" "}
                    {formatDateTime(detail.undoneAt)} 撤销。
                  </p>
                  {detail.lastReviewAmount !== null && (
                    <p className="mt-1">
                      上次核实金额：¥{detail.lastReviewAmount.toLocaleString()}
                    </p>
                  )}
                  {detail.lastReviewNote && (
                    <p className="mt-1">上次审核备注：{detail.lastReviewNote}</p>
                  )}
                  <p className="mt-1">撤销原因：{detail.undoReason ?? "-"}</p>
                  <p className="mt-1 break-all">撤销人 ID：{detail.undoneById ?? "-"}</p>
                </div>
              )}
            </div>

            {/* 凭证截图（登录已 TOTP，查看时不再重复 step-up） */}
            {detail.images.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm text-brand-charcoal/70">
                  <ImageIcon className="h-4 w-4" />
                  凭证截图
                </p>
                <div className="flex flex-wrap gap-3">
                  {detail.images.map((url, i) => (
                    <a
                      key={url}
                      href={receiptImageSrc(url, "admin")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-line-strong"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receiptImageSrc(url, "admin")}
                        alt={`凭证 ${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                        <ExternalLink className="h-4 w-4 text-white" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 审核操作（需要 spent:review 权限） */}
            {detail.status === "PENDING" && canReview && (
              <div className="mt-6 border-t border-line pt-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={decision === "approve"}
                    onClick={() => {
                      setDecision("approve");
                      setReviewNoteError("");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "approve"
                        ? "bg-status-success-fg text-white"
                        : "bg-surface-hover text-brand-charcoal/70 hover:bg-brand-charcoal/10"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    通过
                  </button>
                  <button
                    type="button"
                    aria-pressed={decision === "reject"}
                    onClick={() => {
                      setDecision("reject");
                      setReviewAmountError("");
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "reject"
                        ? "bg-status-danger-fg text-white"
                        : "bg-surface-hover text-brand-charcoal/70 hover:bg-brand-charcoal/10"
                    }`}
                  >
                    <XCircle className="h-4 w-4" />
                    驳回
                  </button>
                </div>

                {decision === "approve" ? (
                  <div className="mt-4 space-y-3">
                    <Input
                      ref={reviewAmountRef}
                      label="核实金额（元）"
                      type="number"
                      min={1}
                      max={1000000}
                      data-autofocus
                      value={reviewAmount}
                      error={reviewAmountError}
                      onChange={(e) => {
                        setReviewAmount(e.target.value);
                        if (reviewAmountError) setReviewAmountError("");
                      }}
                      placeholder="请输入核实后的消费金额"
                      hint="以人工核实为准，可与申报金额不同"
                    />
                    <Input
                      label="审核备注（选填）"
                      value={reviewNote}
                      maxLength={500}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="如：已在天猫商家后台核实订单"
                    />
                  </div>
                ) : (
                  <div className="mt-4">
                    <Textarea
                      ref={reviewNoteRef}
                      label="驳回原因"
                      required
                      rows={3}
                      maxLength={500}
                      value={reviewNote}
                      error={reviewNoteError}
                      onChange={(e) => {
                        setReviewNote(e.target.value);
                        if (reviewNoteError) setReviewNoteError("");
                      }}
                      placeholder="如：订单号无法在商家后台查询到，请核对后重新提交"
                      hint="必填，将展示给用户"
                    />
                  </div>
                )}
              </div>
            )}
            {!canReview && !canRequestApproval && (
              <div className="mt-6 border-t border-line pt-4 text-xs text-ink-muted">
                只读查看（无审核权限）
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 撤销审核确认 */}
      <ConfirmDialog
        open={!!undoTarget}
        onClose={() => setUndoTarget(null)}
        onConfirm={handleUndo}
        type="danger"
        loading={undoing}
        confirmText="确认撤销"
        title="撤销审核"
        description="撤销后将按原核实金额扣减该用户的历史消费（会员等级同步重算），申请回到待审核队列，可重新审核。确认撤销？"
        confirmDisabled={undoReason.trim().length < 2}
      >
        <Input
          label="撤销原因（至少 2 字）"
          value={undoReason}
          onChange={(e) => setUndoReason(e.target.value)}
          placeholder="如：商家后台查询不到该订单"
        />
      </ConfirmDialog>

      {/* Excel 批量导入（需要 spent:import 权限） */}
      {canImport && (
        <>
          <SpentImportModal open={importOpen} onClose={() => setImportOpen(false)} />
          <ImportHistoryModal
            key={historyOpen ? "open" : "closed"}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        </>
      )}

      {/* 代客补录（需要 spent:create 权限） */}
      {canCreate && (
        <SpentOnBehalfModal
          key={onBehalfSession}
          open={onBehalfOpen}
          onClose={() => setOnBehalfOpen(false)}
          onCreated={handleOnBehalfCreated}
        />
      )}

      {/* 资金类操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function AdminSpentAdjustmentsPage() {
  return (
    <RequirePermission permissions={["spent:read", "spent:import", "spent:create", "spent:review"]}>
      <AdminSpentAdjustmentsContent />
    </RequirePermission>
  );
}
