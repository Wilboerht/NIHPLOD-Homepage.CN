"use client";

/**
 * 消费补录审核后台页面
 * 审核用户提交的全渠道消费凭证，通过后以核实金额累加历史消费（自动重算会员等级）。
 * 权限：查看需 spent:read，审核/撤销需 spent:review，Excel 导入需 spent:import；操作写入审计日志。
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  RefreshCw,
  Undo2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { RequirePermission } from "@/components/admin/RequirePermission";
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
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);
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
  const canReview = canAdmin("spent:review");
  const { requireTotp, totpModal } = useTotpConfirm();

  const takeLatestSpent = useLatestRequest();
  const fetchData = useCallback(async () => {
    const isLatest = takeLatestSpent();
    setLoading(true);
    try {
      const result = await apiGet<ListData>("/api/admin/spent-adjustments", {
        page,
        pageSize: 20,
        status: tab === "ALL" ? undefined : tab,
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
  }, [page, tab, showError, takeLatestSpent]);

  useEffect(() => {
    deferInEffect(fetchData);
  }, [fetchData]);

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
        const code = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!code) return;
        await submit(code);
      }

      success(decision === "approve" ? "已通过并完成入账" : "已驳回");
      setDetail(null);
      fetchData();
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
        const code = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!code) return;
        await submit(code);
      }

      success("已撤销审核，申请回到待审核队列");
      setUndoTarget(null);
      setDetail(null);
      fetchData();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "撤销失败");
    } finally {
      setUndoing(false);
    }
  };

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-gray-800">消费记录审核</h1>
          <p className="mt-1 text-xs text-gray-500">
            审核用户提交的全渠道消费凭证，通过后按核实金额累加历史消费并自动重算会员等级
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-2">
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
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors ${
                tab === t.key
                  ? "border-gray-800 bg-gray-800 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === t.key ? "bg-white/20" : "bg-gray-100"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 列表 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">用户</th>
                <th className="px-6 py-3 font-medium">渠道</th>
                <th className="px-6 py-3 font-medium">订单号</th>
                <th className="px-6 py-3 font-medium">申报金额</th>
                <th className="px-6 py-3 font-medium">消费日期</th>
                <th className="px-6 py-3 font-medium">凭证</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">提交时间</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
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
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{a.user.nickname || "未设置昵称"}</p>
                      <p className="text-xs text-gray-400">{a.user.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{a.channelLabel}</td>
                    <td className="max-w-[180px] truncate px-6 py-4 font-mono text-sm text-gray-700">
                      {a.orderNo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {a.amountClaimed != null ? `¥${a.amountClaimed.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(a.purchasedAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {a.images.length > 0 ? `${a.images.length} 张` : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[a.status]}`}
                      >
                        {a.statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Button variant="outline" size="sm" onClick={() => openDetail(a)}>
                        {a.status === "PENDING" ? "审核" : "查看"}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-400">
                    暂无申请
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-gray-500">
            <span>
              共 {pagination.total} 条 · 第 {pagination.page}/{pagination.totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 详情 / 审核弹窗 */}
      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-medium">
                {detail.status === "PENDING" ? "审核申请" : "申请详情"}
              </h2>
            </div>

            {/* 申请信息 */}
            <div className="mt-4 space-y-3 rounded-lg bg-gray-50 p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">用户</p>
                  <p className="mt-0.5 text-gray-700">
                    {detail.user.nickname || "-"}（{detail.user.phone}）
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">当前等级</p>
                  <p className="mt-0.5 text-gray-700">{levelDisplay(detail.user.membershipLevel)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">渠道</p>
                  <p className="mt-0.5 text-gray-700">{detail.channelLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">订单号 / 小票号</p>
                  <p className="mt-0.5 font-mono text-gray-700">{detail.orderNo}</p>
                </div>
                {detail.dealerName && (
                  <div>
                    <p className="text-xs text-gray-400">经销商名称</p>
                    <p className="mt-0.5 text-gray-700">{detail.dealerName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">申报金额</p>
                  <p className="mt-0.5 text-gray-700">
                    {detail.amountClaimed != null
                      ? `¥${detail.amountClaimed.toLocaleString()}`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">消费日期</p>
                  <p className="mt-0.5 text-gray-700">{formatDate(detail.purchasedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">提交时间</p>
                  <p className="mt-0.5 text-gray-700">{formatDateTime(detail.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">状态</p>
                  <p className="mt-0.5 text-gray-700">{detail.statusLabel}</p>
                </div>
              </div>
              {detail.note && (
                <div>
                  <p className="text-xs text-gray-400">
                    {detail.channel === "OTHER" ? "用户说明" : "用户备注"}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{detail.note}</p>
                </div>
              )}
              {detail.status !== "PENDING" && (
                <div className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-3">
                  <div>
                    <p className="text-xs text-gray-400">核实金额</p>
                    <p className="mt-0.5 text-gray-700">
                      {detail.reviewAmount != null
                        ? `¥${detail.reviewAmount.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">审核时间</p>
                    <p className="mt-0.5 text-gray-700">{formatDateTime(detail.reviewedAt)}</p>
                  </div>
                  {detail.reviewNote && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">审核备注</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-gray-700">
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
                <p className="mb-2 flex items-center gap-1.5 text-sm text-gray-600">
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
                      className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-gray-200"
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

            {/* 撤销审核（仅已通过；需要 spent:review 权限） */}
            {detail.status === "APPROVED" && (
              <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
                {canReview ? (
                  <Button variant="outline" onClick={() => setUndoTarget(detail)} disabled={undoing}>
                    <Undo2 className="mr-1.5 h-4 w-4" />
                    {undoing ? "撤销中..." : "撤销审核"}
                  </Button>
                ) : (
                  <span className="text-xs text-gray-400">只读查看（无审核权限）</span>
                )}
              </div>
            )}

            {/* 审核操作（需要 spent:review 权限） */}
            {detail.status === "PENDING" && canReview && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision("approve")}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "approve"
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    通过
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision("reject")}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                      decision === "reject"
                        ? "bg-red-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <XCircle className="h-4 w-4" />
                    驳回
                  </button>
                </div>

                {decision === "approve" ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        核实金额（元，以人工核实为准，可与申报金额不同）
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={1000000}
                        value={reviewAmount}
                        onChange={(e) => setReviewAmount(e.target.value)}
                        placeholder="请输入核实后的消费金额"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">审核备注（选填）</label>
                      <Input
                        value={reviewNote}
                        maxLength={500}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="如：已在天猫商家后台核实订单"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs text-gray-500">
                      驳回原因（必填，展示给用户）
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="如：订单号无法在商家后台查询到，请核对后重新提交"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setDetail(null)}>
                    取消
                  </Button>
                  <Button
                    onClick={handleReview}
                    disabled={saving}
                    className={decision === "reject" ? "bg-red-500 hover:bg-red-600" : undefined}
                  >
                    {saving ? "提交中..." : decision === "approve" ? "确认通过并入账" : "确认驳回"}
                  </Button>
                </div>
              </div>
            )}
            {detail.status === "PENDING" && !canReview && (
              <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
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
    <RequirePermission permission="spent:read">
      <AdminSpentAdjustmentsContent />
    </RequirePermission>
  );
}
