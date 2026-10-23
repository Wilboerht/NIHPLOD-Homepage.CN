"use client";

/**
 * 消费补录审核后台页面
 * 审核用户提交的全渠道消费凭证，通过后以核实金额累加历史消费（自动重算会员等级）。
 * 权限：查看需 spent:read，审核/撤销需 spent:review，Excel 导入需 spent:import；操作写入审计日志。
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import {
  formatDateNumeric as formatDate,
  formatDateTimeNumeric as formatDateTime,
} from "@/lib/format";
import { receiptImageSrc } from "@/lib/spent-adjustment-meta";
import { levelDisplay } from "@/lib/membership";
import { SpentImportModal, ImportHistoryModal } from "./SpentImport";

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
  reviewAmount: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: { name: string; email: string } | null;
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

const STATUS_BADGE: Record<AdjustmentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-600",
};

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
  const tabParam = get("status", "PENDING");
  const tab: StatusFilter = TABS.some((item) => item.key === tabParam)
    ? (tabParam as StatusFilter)
    : "PENDING";
  const page = getNumber("page", 1);
  const searchParam = get("search");
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
  const [saving, setSaving] = useState(false);
  const [undoTarget, setUndoTarget] = useState<ApplicationItem | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { success, error: showError } = useToast();

  // 权限：Excel 导入/撤销导入需要 spent:import（与 API 层一致）
  const { can: canAdmin } = useAdminPermissions();
  const canImport = canAdmin("spent:import");
  const canReadSpent = canAdmin("spent:read");
  const canReview = canAdmin("spent:review");
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
      });
      if (!isLatest()) return;
      setData(result);
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      setLoadError(true);
      showError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, tab, searchParam, showError, canReadSpent, takeLatestSpent]);

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

  const openDetail = (item: ApplicationItem) => {
    setDetail(item);
    setDecision("approve");
    setReviewAmount(item.amountClaimed != null ? String(item.amountClaimed) : "");
    setReviewNote("");
  };

  const handleReview = async () => {
    if (!detail) return;
    if (decision === "approve") {
      const amount = Number(reviewAmount);
      if (!reviewAmount || !Number.isInteger(amount) || amount <= 0) {
        showError("请填写正整数核实金额（元）");
        return;
      }
    }
    if (decision === "reject" && !reviewNote.trim()) {
      showError("请填写驳回原因");
      return;
    }
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
        showError(e.message);
      } else {
        showError("操作失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/spent-adjustments/${undoTarget.id}/undo`, { totpCode });

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
          description="当前账号仅有 Excel 导入权限"
          actions={
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
          }
        />
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-6 text-sm text-brand-charcoal/65">
          你可以导入消费记录；查看和审核申请需要「消费补录查看」权限。
        </div>
        <SpentImportModal open={importOpen} onClose={() => setImportOpen(false)} />
        <ImportHistoryModal
          key={historyOpen ? "open" : "closed"}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
        {totpModal}
      </div>
    );
  }

  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="消费记录审核"
        description="审核用户提交的全渠道消费凭证，通过后按核实金额累加历史消费并自动重算会员等级"
        actions={
          <>
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
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      {/* 状态筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          // “全部”为各状态计数之和；不能用当前筛选的 total（会随 tab 变化）
          const count =
            t.key === "ALL"
              ? Object.values(data?.counts ?? {}).reduce((sum, n) => sum + n, 0)
              : (data?.counts[t.key] ?? 0);
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => update({ status: t.key })}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors ${
                tab === t.key
                  ? "border-brand-charcoal bg-brand-charcoal text-white"
                  : "border-brand-charcoal/15 text-brand-charcoal/70 hover:border-brand-charcoal/30"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === t.key ? "bg-white/20" : "bg-brand-charcoal/[0.06]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
          <Input
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-charcoal/65 hover:text-brand-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 列表（移动端卡片） */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-brand-charcoal/[0.04]" />
          ))
        ) : loadError ? (
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-10 text-center">
            <p className="text-sm text-red-500">加载失败，请重试</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
              重试
            </Button>
          </div>
        ) : data && data.applications.length > 0 ? (
          data.applications.map((a) => (
            <div key={a.id} className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-charcoal">
                    {a.user.nickname || "未设置昵称"}
                  </p>
                  <p className="truncate text-xs text-brand-charcoal/65">
                    {a.user.phone} · {a.channelLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[a.status]}`}
                >
                  {a.statusLabel}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-charcoal/70">
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
              <div className="mt-3 flex justify-end border-t border-brand-charcoal/10 pt-2">
                <Button variant="outline" size="sm" onClick={() => openDetail(a)}>
                  {a.status === "PENDING" ? "审核" : "查看"}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-10 text-center text-sm text-brand-charcoal/65">
            暂无申请
          </div>
        )}
      </div>

      {/* 列表（桌面端表格） */}
      <div className="hidden rounded-2xl border border-brand-charcoal/10 bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b bg-brand-charcoal/[0.03] text-left text-xs uppercase text-brand-charcoal/65">
                <th className="px-3 py-2 font-medium">用户</th>
                <th className="px-3 py-2 font-medium">渠道</th>
                <th className="px-3 py-2 font-medium">订单号</th>
                <th className="px-3 py-2 font-medium">申报金额</th>
                <th className="px-3 py-2 font-medium">核实金额</th>
                <th className="px-3 py-2 font-medium">消费日期</th>
                <th className="px-3 py-2 font-medium">凭证</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">审核人</th>
                <th className="px-3 py-2 font-medium">审核时间</th>
                <th className="px-3 py-2 font-medium">提交时间</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-brand-charcoal/65" />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center">
                    <p className="text-sm text-red-500">加载失败，请重试</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={fetchData}
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                    >
                      重试
                    </Button>
                  </td>
                </tr>
              ) : data && data.applications.length > 0 ? (
                data.applications.map((a) => (
                  <tr key={a.id} className="hover:bg-brand-charcoal/[0.03]">
                    <td className="px-3 py-2">
                      <p className="text-sm text-brand-charcoal/70">
                        {a.user.nickname || "未设置昵称"}
                      </p>
                      <p className="text-xs text-brand-charcoal/65">{a.user.phone}</p>
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/70">{a.channelLabel}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-mono text-sm text-brand-charcoal/70">
                      {a.orderNo}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/70">
                      {a.amountClaimed != null ? `¥${a.amountClaimed.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/70">
                      {a.reviewAmount != null ? `¥${a.reviewAmount.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/70">
                      {formatDate(a.purchasedAt)}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/70">
                      {a.images.length > 0 ? `${a.images.length} 张` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[a.status]}`}
                      >
                        {a.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/65">
                      {a.reviewedBy?.name ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/65">
                      {a.reviewedAt ? formatDateTime(a.reviewedAt) : "-"}
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-charcoal/65">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => openDetail(a)}>
                        {a.status === "PENDING" ? "审核" : "查看"}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-10 text-center text-sm text-brand-charcoal/65"
                  >
                    暂无申请
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && pagination.total > 0 && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={(nextPage) => update({ page: String(nextPage) }, { resetPage: false })}
        />
      )}

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
          detail?.status === "PENDING" && canReview ? (
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
              <Button
                onClick={handleReview}
                loading={saving}
                className={decision === "reject" ? "bg-red-500 hover:bg-red-600" : undefined}
              >
                {decision === "approve" ? "确认通过并入账" : "确认驳回"}
              </Button>
            </div>
          ) : detail?.status === "APPROVED" && canReview ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setUndoTarget(detail)} disabled={undoing}>
                <Undo2 className="mr-1.5 h-4 w-4" />
                撤销审核
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            {/* 申请信息 */}
            <div className="space-y-3 rounded-lg bg-brand-charcoal/[0.03] p-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-brand-charcoal/65">用户</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detail.user.nickname || "-"}（{detail.user.phone}）
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">当前等级</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {levelDisplay(detail.user.membershipLevel)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">渠道</p>
                  <p className="mt-0.5 text-brand-charcoal/70">{detail.channelLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">订单号 / 小票号</p>
                  <p className="mt-0.5 font-mono text-brand-charcoal/70">{detail.orderNo}</p>
                </div>
                {detail.dealerName && (
                  <div>
                    <p className="text-xs text-brand-charcoal/65">经销商名称</p>
                    <p className="mt-0.5 text-brand-charcoal/70">{detail.dealerName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-brand-charcoal/65">申报金额</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {detail.amountClaimed != null
                      ? `¥${detail.amountClaimed.toLocaleString()}`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">消费日期</p>
                  <p className="mt-0.5 text-brand-charcoal/70">{formatDate(detail.purchasedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">提交时间</p>
                  <p className="mt-0.5 text-brand-charcoal/70">
                    {formatDateTime(detail.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-charcoal/65">状态</p>
                  <p className="mt-0.5 text-brand-charcoal/70">{detail.statusLabel}</p>
                </div>
              </div>
              {detail.note && (
                <div>
                  <p className="text-xs text-brand-charcoal/65">
                    {detail.channel === "OTHER" ? "用户说明" : "用户备注"}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-brand-charcoal/70">{detail.note}</p>
                </div>
              )}
              {detail.status !== "PENDING" && (
                <div className="grid grid-cols-1 gap-3 border-t border-brand-charcoal/15 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-brand-charcoal/65">核实金额</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {detail.reviewAmount != null
                        ? `¥${detail.reviewAmount.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-charcoal/65">审核时间</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {formatDateTime(detail.reviewedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-charcoal/65">审核人</p>
                    <p className="mt-0.5 text-brand-charcoal/70">
                      {detail.reviewedBy
                        ? `${detail.reviewedBy.name}（${detail.reviewedBy.email}）`
                        : "-"}
                    </p>
                  </div>
                  {detail.reviewNote && (
                    <div className="col-span-2">
                      <p className="text-xs text-brand-charcoal/65">审核备注</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-brand-charcoal/70">
                        {detail.reviewNote}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 凭证截图 */}
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
                      className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-brand-charcoal/15"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receiptImageSrc(url, "admin")}
                        alt={`凭证 ${i + 1}`}
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
              <div className="mt-6 border-t border-brand-charcoal/10 pt-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={decision === "approve"}
                    onClick={() => setDecision("approve")}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "approve"
                        ? "bg-emerald-600 text-white"
                        : "bg-brand-charcoal/[0.06] text-brand-charcoal/70 hover:bg-brand-charcoal/10"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    通过
                  </button>
                  <button
                    type="button"
                    aria-pressed={decision === "reject"}
                    onClick={() => setDecision("reject")}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "reject"
                        ? "bg-red-500 text-white"
                        : "bg-brand-charcoal/[0.06] text-brand-charcoal/70 hover:bg-brand-charcoal/10"
                    }`}
                  >
                    <XCircle className="h-4 w-4" />
                    驳回
                  </button>
                </div>

                {decision === "approve" ? (
                  <div className="mt-4 space-y-3">
                    <Input
                      label="核实金额（元）"
                      type="number"
                      min={1}
                      max={1000000}
                      data-autofocus
                      value={reviewAmount}
                      onChange={(e) => setReviewAmount(e.target.value)}
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
                      label="驳回原因"
                      required
                      rows={3}
                      maxLength={500}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="如：订单号无法在商家后台查询到，请核对后重新提交"
                      hint="必填，将展示给用户"
                    />
                  </div>
                )}
              </div>
            )}
            {!canReview && (
              <div className="mt-6 border-t border-brand-charcoal/10 pt-4 text-xs text-brand-charcoal/65">
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
        type="warning"
        title="撤销审核"
        description="撤销后将按原核实金额扣减该用户的历史消费（会员等级同步重算），申请回到待审核队列，可重新审核。确认撤销？"
      />

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

      {/* 资金类操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function AdminSpentAdjustmentsPage() {
  return (
    <RequirePermission permissions={["spent:read", "spent:import"]}>
      <AdminSpentAdjustmentsContent />
    </RequirePermission>
  );
}
