"use client";

/**
 * 积分兑换与履约后台页面
 * - 可兑换产品：产品库中的产品标记"积分可兑"后出现在用户面板兑换板块（仅超级管理员可设置）
 * - 兑换记录：查看与履约标记
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { formatDateTimeNumeric as formatDateTime } from "@/lib/format";
import Link from "next/link";
import { RequirePermission, DataTable, type Column } from "@/components/admin";
import { ApprovalRequestAction } from "@/components/admin/ApprovalRequestAction";
import { RedemptionTimelineModal } from "@/components/admin/RedemptionTimelineModal";
import { APPROVAL_THRESHOLDS } from "@/lib/admin-approval-policy";
import { PageHeader } from "@/components/admin/PageHeader";
import { DateRangeFilter } from "@/components/admin/DateRangeFilter";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { useLatestRequest } from "@/hooks/useLatestRequest";

interface RedeemableProductItem {
  id: string;
  name: string;
  priceYuan: number;
  published: boolean;
  pointRedeemable: boolean;
  redeemStock: number | null;
  redeemLimitPerUser: number | null;
  redeemLimitWindowDays: number | null;
  categoryName: string;
}

interface RedemptionItem {
  id: string;
  productName: string;
  priceYuan: number;
  points: number;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
  recipient: string | null;
  phone: string | null;
  address: string | null;
  carrier: string | null;
  waybillNo: string | null;
  createdAt: string;
  fulfillableAt: string;
  protectionActive: boolean;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  cancelNote: string | null;
  user: { id: string; phone: string; nickname: string | null; status: string };
}

type StatusTab = "PENDING" | "FULFILLED" | "CANCELLED" | "ALL";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-status-warning-soft text-status-warning-strong",
  FULFILLED: "bg-status-success-soft text-status-success-strong",
  COMPLETED: "bg-status-success-soft text-status-success-strong",
  AFTER_SALES_REQUESTED: "bg-status-warning-soft text-status-warning-strong",
  AFTER_SALES_APPROVED: "bg-status-warning-soft text-status-warning-strong",
  AFTER_SALES_REJECTED: "bg-status-danger-soft text-status-danger-strong",
  RETURNING: "bg-status-info-soft text-status-info-strong",
  RETURNED: "bg-status-info-soft text-status-info-strong",
  REFUNDED: "bg-status-success-soft text-status-success-strong",
  AFTER_SALES_CLOSED: "bg-surface-hover text-ink-muted",
  CANCELLED: "bg-surface-hover text-ink-muted",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待履约",
  FULFILLED: "已发货",
  COMPLETED: "已完成",
  AFTER_SALES_REQUESTED: "售后待审核",
  AFTER_SALES_APPROVED: "售后待寄回",
  AFTER_SALES_REJECTED: "售后已驳回",
  RETURNING: "退货中",
  RETURNED: "待退款",
  REFUNDED: "已退款",
  AFTER_SALES_CLOSED: "售后已关闭",
  CANCELLED: "已取消",
};

function redeemLimitLabel(
  item: Pick<RedeemableProductItem, "redeemLimitPerUser" | "redeemLimitWindowDays">
): string {
  if (item.redeemLimitPerUser === null) return "不限购";
  if (item.redeemLimitWindowDays === null) return `终身 ${item.redeemLimitPerUser} 件`;
  return `${item.redeemLimitWindowDays} 天 ${item.redeemLimitPerUser} 件`;
}

function AdminPointGiftsContent() {
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { can: canAdmin, role } = useAdminPermissions();
  const isOwnerActor = role === "owner";
  const canGiftWrite = canAdmin("gifts:write");
  const canGiftRead = canAdmin("gifts:read");
  const canRedeemRead = canAdmin("redemptions:read");
  const canFulfill = canAdmin("redemptions:fulfill");
  const canCancelRedemption = canAdmin("redemptions:cancel");
  const canRequestApproval = canAdmin("approvals:request");
  const { requireTotp, totpModal } = useTotpConfirm();

  const productPage = getNumber("productPage", 1);
  const searchParam = get("productSearch");
  const redeemableParam = get("redeemable", "all");
  const redeemableFilter: "all" | "true" | "false" = ["true", "false"].includes(redeemableParam)
    ? (redeemableParam as "true" | "false")
    : "all";
  const page = getNumber("page", 1);
  const tabParam = get("tab", "PENDING");
  const tab: StatusTab = ["PENDING", "FULFILLED", "CANCELLED", "ALL"].includes(tabParam)
    ? (tabParam as StatusTab)
    : "PENDING";
    const redemptionSearchParam = get("search");
  const redemptionDateFrom = get("dateFrom");
  const redemptionDateTo = get("dateTo");

  // 页面按任务拆成两个工作区：默认优先处理兑换履约，礼品配置按需切换
  const viewParam = get("view");
  const view: "redemptions" | "gifts" = !canRedeemRead
    ? "gifts"
    : !canGiftRead
      ? "redemptions"
      : viewParam === "gifts"
        ? "gifts"
        : "redemptions";
  const showViewTabs = canGiftRead && canRedeemRead;

  const [products, setProducts] = useState<RedeemableProductItem[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(searchParam);
  const [prevProductSearch, setPrevProductSearch] = useState(searchParam);
  if (prevProductSearch !== searchParam) {
    setPrevProductSearch(searchParam);
    setSearchInput(searchParam);
  }
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [stockEdit, setStockEdit] = useState<{ id: string; value: string } | null>(null);
  const [stockError, setStockError] = useState("");
  const [savingStock, setSavingStock] = useState(false);
  const [limitTarget, setLimitTarget] = useState<RedeemableProductItem | null>(null);
  const [limitUnlimited, setLimitUnlimited] = useState(true);
  const [limitCount, setLimitCount] = useState("");
  const [limitWindowMode, setLimitWindowMode] = useState<"lifetime" | "rolling">("rolling");
  const [limitWindowDays, setLimitWindowDays] = useState("30");
  const [limitError, setLimitError] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pointsTotal, setPointsTotal] = useState(0);
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [redemptionsError, setRedemptionsError] = useState(false);
  const [piiRevealed, setPiiRevealed] = useState(false);
  const piiRevealedRef = useRef(false);
  const updatePiiRevealed = useCallback((value: boolean) => {
    piiRevealedRef.current = value;
    setPiiRevealed(value);
  }, []);
  const [revealingPii, setRevealingPii] = useState(false);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [redemptionSearch, setRedemptionSearch] = useState(redemptionSearchParam);
  const [prevRedemptionSearch, setPrevRedemptionSearch] = useState(redemptionSearchParam);
  if (prevRedemptionSearch !== redemptionSearchParam) {
    setPrevRedemptionSearch(redemptionSearchParam);
    setRedemptionSearch(redemptionSearchParam);
  }
  const [fulfillTarget, setFulfillTarget] = useState<{
    redemption: RedemptionItem;
    mode: "fulfill" | "waybill";
  } | null>(null);
  const [waybillInput, setWaybillInput] = useState("");
  const [waybillError, setWaybillError] = useState("");
  const [submittingFulfill, setSubmittingFulfill] = useState(false);
  const isFulfillDirty =
    !!fulfillTarget && waybillInput !== (fulfillTarget.redemption.waybillNo ?? "");
  const { confirmClose: confirmCloseFulfill } = useUnsavedChanges(isFulfillDirty);
  const [cancelTarget, setCancelTarget] = useState<RedemptionItem | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  const takeLatestProducts = useLatestRequest();
  const fetchProducts = useCallback(async () => {
    // 无 gifts:read 或当前不在礼品设置工作区时，不请求产品数据
    if (!canGiftRead || view !== "gifts") {
      setProductsLoading(false);
      return;
    }
    const isLatest = takeLatestProducts();
    setProductsLoading(true);
    try {
      const data = await apiGet<{
        products: RedeemableProductItem[];
        pagination: { page: number; total: number };
      }>("/api/admin/point-gifts", {
        page: productPage,
        pageSize: 20,
        search: searchParam || undefined,
        redeemable: redeemableFilter === "all" ? undefined : redeemableFilter,
      });
      if (!isLatest()) return;
      setProducts(data.products);
      setProductTotal(data.pagination.total);
      setProductsError(false);
    } catch {
      if (!isLatest()) return;
      setProductsError(true);
      showError("加载产品失败");
    } finally {
      if (isLatest()) setProductsLoading(false);
    }
  }, [
    productPage,
    searchParam,
    redeemableFilter,
    showError,
    canGiftRead,
    view,
    takeLatestProducts,
  ]);

  const takeLatestRedemptions = useLatestRequest();
  const fetchRedemptions = useCallback(async () => {
    // 仅 gifts:read 的角色或当前不在兑换履约工作区时，不请求兑换记录
    if (!canRedeemRead || view !== "redemptions") {
      setRedemptionLoading(false);
      return;
    }
    const isLatest = takeLatestRedemptions();
    setRedemptionLoading(true);
    try {
      const query = () =>
        apiGet<{
          piiRevealed?: boolean;
          redemptions: RedemptionItem[];
          counts: Record<string, number>;
          pointsTotal: number;
          pagination: { page: number; total: number };
        }>("/api/admin/point-redemptions", {
          page,
          pageSize: 10,
          status: tab === "ALL" ? undefined : tab,
          search: redemptionSearchParam || undefined,
          dateFrom: redemptionDateFrom || undefined,
          dateTo: redemptionDateTo || undefined,
          reveal: piiRevealedRef.current ? "1" : undefined,
        });

      let data: Awaited<ReturnType<typeof query>>;
      try {
        data = await query();
      } catch (error) {
        // step-up 过期时自动回退到脱敏列表，避免整页报错
        if (!(piiRevealedRef.current && isTotpRequired(error))) throw error;
        updatePiiRevealed(false);
        data = await apiGet<{
          piiRevealed?: boolean;
          redemptions: RedemptionItem[];
          counts: Record<string, number>;
          pointsTotal: number;
          pagination: { page: number; total: number };
        }>("/api/admin/point-redemptions", {
          page,
          pageSize: 10,
          status: tab === "ALL" ? undefined : tab,
          search: redemptionSearchParam || undefined,
        });
      }
      if (!isLatest()) return;
      setRedemptions(data.redemptions);
      setCounts(data.counts);
      setPointsTotal(data.pointsTotal);
      setRedemptionsTotal(data.pagination.total);
      updatePiiRevealed(Boolean(data.piiRevealed));
      setRedemptionsError(false);
    } catch {
      if (!isLatest()) return;
      setRedemptionsError(true);
      showError("加载兑换记录失败");
    } finally {
      if (isLatest()) setRedemptionLoading(false);
    }
  }, [
    page,
    tab,
    redemptionSearchParam,
    redemptionDateFrom,
    redemptionDateTo,
    showError,
    canRedeemRead,
    view,
    takeLatestRedemptions,
    updatePiiRevealed,
  ]);

  const handleRevealPii = async () => {
    if (!canFulfill || revealingPii) return;
    setRevealingPii(true);
    try {
      const submit = () =>
        apiGet<{
          piiRevealed?: boolean;
          redemptions: RedemptionItem[];
          counts: Record<string, number>;
          pointsTotal: number;
          pagination: { page: number; total: number };
        }>("/api/admin/point-redemptions", {
          page,
          pageSize: 10,
          status: tab === "ALL" ? undefined : tab,
          search: redemptionSearchParam || undefined,
          reveal: "1",
        });

      let data: Awaited<ReturnType<typeof submit>>;
      try {
        data = await submit();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        data = await submit();
      }
      setRedemptions(data.redemptions);
      setCounts(data.counts);
      setPointsTotal(data.pointsTotal);
      setRedemptionsTotal(data.pagination.total);
      updatePiiRevealed(Boolean(data.piiRevealed));
      setRedemptionsError(false);
    } catch (error) {
      showError(error instanceof ApiError ? error.message : "查看完整收件信息失败");
    } finally {
      setRevealingPii(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "ALL") params.set("status", tab);
      if (redemptionSearchParam) params.set("search", redemptionSearchParam);
      if (redemptionDateFrom) params.set("dateFrom", redemptionDateFrom);
      if (redemptionDateTo) params.set("dateTo", redemptionDateTo);
      await downloadFromUrl(
        `/api/admin/point-redemptions/export?${params.toString()}`,
        "point-redemptions.csv"
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  // 两个数据集独立请求，避免任一筛选变化重复拉取全部数据
  useEffect(() => {
    deferInEffect(fetchProducts);
  }, [fetchProducts]);

  useEffect(() => {
    deferInEffect(fetchRedemptions);
  }, [fetchRedemptions]);

  // 完整收件信息限时展示：5 分钟后自动回到脱敏列表
  useEffect(() => {
    if (!piiRevealed) return;
    const timer = window.setTimeout(() => {
      updatePiiRevealed(false);
      void fetchRedemptions();
    }, 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [fetchRedemptions, piiRevealed, updatePiiRevealed]);

  // 兑换记录搜索防抖写入 URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = redemptionSearch.trim();
      if (next !== redemptionSearchParam) {
        update({ search: next || null }, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [redemptionSearch, redemptionSearchParam, update]);

  useEffect(() => {
    const totalPages = Math.ceil(redemptionsTotal / 10);
    if (totalPages > 0 && page > totalPages) {
      update({ page: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [page, redemptionsTotal, update]);

  useEffect(() => {
    const totalPages = Math.ceil(productTotal / 20);
    if (totalPages > 0 && productPage > totalPages) {
      update({ productPage: String(totalPages) }, { replace: true, resetPage: false });
    }
  }, [productPage, productTotal, update]);

  const handleToggle = async (p: RedeemableProductItem) => {
    setTogglingId(p.id);
    try {
      const submit = () =>
        apiPatch("/api/admin/point-gifts", {
          productId: p.id,
          pointRedeemable: !p.pointRedeemable,
        });
      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }
      success(p.pointRedeemable ? "已取消该产品积分可兑" : "已设为积分可兑");
      fetchProducts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setTogglingId(null);
    }
  };

  /** 内联编辑兑换库存（留空 = 不限量；与可兑开关共用同一 PATCH） */
  const handleStockSave = async (p: RedeemableProductItem) => {
    if (!stockEdit) return;
    const trimmed = stockEdit.value.trim();
    const stock = trimmed === "" ? null : Number(trimmed);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      setStockError("库存须为非负整数，留空表示不限量");
      return;
    }
    setStockError("");
    setSavingStock(true);
    try {
      // 只提交库存字段，避免把列表快照中的 pointRedeemable 旧值覆盖回去
      const submit = () =>
        apiPatch("/api/admin/point-gifts", {
          productId: p.id,
          redeemStock: stock,
        });
      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }
      success("兑换库存已更新");
      setStockEdit(null);
      fetchProducts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSavingStock(false);
    }
  };

  const openLimitEdit = (p: RedeemableProductItem) => {
    const unlimited = p.redeemLimitPerUser === null;
    setLimitTarget(p);
    setLimitUnlimited(unlimited);
    setLimitCount(unlimited ? "" : String(p.redeemLimitPerUser));
    setLimitWindowMode(p.redeemLimitWindowDays === null ? "lifetime" : "rolling");
    setLimitWindowDays(p.redeemLimitWindowDays === null ? "30" : String(p.redeemLimitWindowDays));
    setLimitError("");
  };

  const handleLimitSave = async () => {
    if (!limitTarget) return;
    let limit: number | null = null;
    let windowDays: number | null = null;
    if (!limitUnlimited) {
      const parsedCount = Number(limitCount);
      if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 9999) {
        setLimitError("限购数量须为 1-9999 的整数");
        return;
      }
      limit = parsedCount;
      if (limitWindowMode === "rolling") {
        const parsedDays = Number(limitWindowDays);
        if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
          setLimitError("统计周期须为 1-3650 天");
          return;
        }
        windowDays = parsedDays;
      }
    }

    setSavingLimit(true);
    try {
      const submit = () =>
        apiPatch("/api/admin/point-gifts", {
          productId: limitTarget.id,
          redeemLimitPerUser: limit,
          redeemLimitWindowDays: windowDays,
        });
      try {
        await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        await submit();
      }
      success("限购设置已更新");
      setLimitTarget(null);
      fetchProducts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSavingLimit(false);
    }
  };

  /** 打开履约/运单号弹窗（履约可录入运单号；已履约可补录/修改） */
  const openFulfillModal = (r: RedemptionItem) => {
    setWaybillInput(r.waybillNo ?? "");
    setWaybillError("");
    setFulfillTarget({
      redemption: r,
      mode: r.status === "PENDING" ? "fulfill" : "waybill",
    });
  };

  /** 产品筛选使用独立页码 productPage；修改时保留兑换记录的 page */
  const updateProductQuery = (updates: Record<string, string | null>) => {
    update(
      {
        ...updates,
        productPage: null,
        ...(page > 1 ? { page: String(page) } : {}),
      },
      { resetPage: false }
    );
  };

  /** 状态变更可能把当前页最后一条移出当前 tab：回退一页，避免停在空页 */
  const refreshRedemptionsAfterMutation = (removedFromCurrentTab: boolean) => {
    window.dispatchEvent(new Event("admin:nav-counts-refresh"));
    if (removedFromCurrentTab && tab !== "ALL" && redemptions.length === 1 && page > 1) {
      update({ page: String(page - 1) }, { resetPage: false });
    } else {
      fetchRedemptions();
    }
  };

  const handleFulfillSubmit = async () => {
    if (!fulfillTarget) return;
    const { redemption, mode } = fulfillTarget;
    const waybillNo = waybillInput.trim();
    if (waybillNo && !/^[A-Za-z0-9-]{8,32}$/.test(waybillNo)) {
      setWaybillError("运单号须为 8-32 位字母、数字或短横线");
      return;
    }
    setWaybillError("");
    setSubmittingFulfill(true);
    try {
      if (mode === "fulfill") {
        const submit = (totpCode?: string) =>
          apiPost(`/api/admin/point-redemptions/${redemption.id}/fulfill`, {
            waybillNo: waybillNo || undefined,
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
        success("已标记履约");
      } else {
        const submitWaybill = () =>
          apiPatch(`/api/admin/point-redemptions/${redemption.id}/waybill`, {
            waybillNo,
          });
        try {
          await submitWaybill();
        } catch (e) {
          if (!isTotpRequired(e)) throw e;
          const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
          if (!verified) return;
          await submitWaybill();
        }
        success("运单号已更新");
      }
      setFulfillTarget(null);
      refreshRedemptionsAfterMutation(mode === "fulfill");
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setSubmittingFulfill(false);
    }
  };

  /** 取消兑换并退还积分（需要 redemptions:cancel 权限 + TOTP 二次验证） */
  const handleCancelRedemption = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost<{ message: string }>(`/api/admin/point-redemptions/${cancelTarget.id}/cancel`, {
          note: cancelNote.trim() || undefined,
          totpCode,
        });

      let data: { message: string };
      try {
        data = await submit();
      } catch (e) {
        if (!isTotpRequired(e)) throw e;
        const verified = await requireTotp(e instanceof ApiError ? e.code : undefined);
        if (!verified) return;
        data = await submit();
      }

      success(data.message);
      setCancelTarget(null);
      setCancelNote("");
      refreshRedemptionsAfterMutation(true);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "取消失败");
    } finally {
      setCancelling(false);
    }
  };

  if (!canGiftRead && !canRedeemRead) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="积分兑换" description="当前账号没有兑换履约或礼品设置权限。" />
        <AdminHubTabs section="points" />
        <div className="rounded-card border border-line bg-white p-6 text-sm text-brand-charcoal/70">
          <p>请通过上方页签进入有权限的积分功能；若无可用页签，请联系超级管理员授权。</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {canAdmin("redemptions:after-sales") && (
              <Link className="text-brand-primary hover:underline" href="/admin/redemption-after-sales">
                前往兑换售后
              </Link>
            )}
            {canAdmin("points:read") && (
              <Link className="text-brand-primary hover:underline" href="/admin/points-ledger">
                前往积分流水
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderProductBadges = (product: RedeemableProductItem) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        className={
          product.pointRedeemable
            ? "bg-status-warning-soft text-status-warning-strong"
            : "bg-surface-hover text-ink-muted"
        }
      >
        {product.pointRedeemable ? "可兑换" : "未设置"}
      </Badge>
      {product.pointRedeemable && product.redeemStock === 0 && (
        <Badge className="bg-status-danger-soft text-status-danger-fg">已兑完</Badge>
      )}
    </div>
  );

  const renderProductStock = (product: RedeemableProductItem) =>
    stockEdit?.id === product.id ? (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          value={stockEdit.value}
          onChange={(event) => {
            setStockEdit({ id: product.id, value: event.target.value });
            if (stockError) setStockError("");
          }}
          placeholder="留空=不限量"
          error={stockError || undefined}
          className="w-28"
        />
        <Button
          variant="outline"
          size="sm"
          loading={savingStock}
          onClick={() => handleStockSave(product)}
        >
          保存
        </Button>
        <Button variant="outline" size="sm" onClick={() => setStockEdit(null)}>
          取消
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <span className="text-brand-charcoal/70">
          库存：{product.redeemStock === null ? "不限量" : product.redeemStock}
        </span>
        {canGiftWrite && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStockError("");
              setStockEdit({
                id: product.id,
                value: product.redeemStock === null ? "" : String(product.redeemStock),
              });
            }}
          >
            编辑库存
          </Button>
        )}
      </div>
    );

  const renderProductLimit = (product: RedeemableProductItem) => (
    <div className="flex items-center gap-2">
      <span className="text-brand-charcoal/70">{redeemLimitLabel(product)}</span>
      {canGiftWrite && (
        <Button variant="outline" size="sm" onClick={() => openLimitEdit(product)}>
          编辑限购
        </Button>
      )}
    </div>
  );

  const renderProductToggle = (product: RedeemableProductItem) =>
    canGiftWrite ? (
      <Button
        variant="outline"
        size="sm"
        disabled={
          togglingId === product.id ||
          (!product.pointRedeemable && !product.published)
        }
        onClick={() => handleToggle(product)}
      >
        {togglingId === product.id
          ? "处理中..."
          : product.pointRedeemable
            ? "取消可兑"
            : "设为可兑"}
      </Button>
    ) : (
      <span className="text-xs text-ink-muted">需要积分可兑设置权限</span>
    );

  const productColumns: Column<RedeemableProductItem>[] = [
    {
      key: "name",
      title: "产品",
      width: "180px",
      render: (_value, product) => (
        <span className="text-sm text-brand-charcoal/70">{product.name}</span>
      ),
    },
    {
      key: "categoryName",
      title: "分类",
      width: "100px",
      render: (_value, product) => (
        <span className="text-sm text-ink-muted">{product.categoryName}</span>
      ),
    },
    {
      key: "priceYuan",
      title: "参考价格",
      width: "100px",
      numeric: true,
      render: (_value, product) => (
        <span className="text-sm text-brand-charcoal/70">
          ¥{product.priceYuan.toLocaleString()}
        </span>
      ),
    },
    {
      key: "published",
      title: "发布状态",
      width: "90px",
      render: (_value, product) => (
        <Badge
          className={
            product.published
              ? "bg-status-success-soft text-status-success-strong"
              : "bg-surface-hover text-ink-muted"
          }
        >
          {product.published ? "已发布" : "草稿"}
        </Badge>
      ),
    },
    {
      key: "pointRedeemable",
      title: "积分可兑",
      width: "120px",
      render: (_value, product) => renderProductBadges(product),
    },
    {
      key: "redeemStock",
      title: "兑换库存",
      width: "260px",
      render: (_value, product) => renderProductStock(product),
    },
    {
      key: "redeemLimitPerUser",
      title: "每用户限购",
      width: "170px",
      render: (_value, product) => renderProductLimit(product),
    },
    {
      key: "actions",
      title: "操作",
      width: "150px",
      render: (_value, product) => renderProductToggle(product),
    },
  ];

  const renderRedemptionShipping = (redemption: RedemptionItem) => (
    <>
      {redemption.recipient && redemption.address ? (
        <>
          <p className="text-sm text-brand-charcoal/70">
            {redemption.recipient}
            {redemption.phone && (
              <span className="ml-2 text-xs text-ink-muted">{redemption.phone}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{redemption.address}</p>
        </>
      ) : (
        <span className="text-xs text-ink-muted">未填写</span>
      )}
      {redemption.waybillNo && (
        <p className="mt-0.5 text-xs text-brand-primary">
          运单号：{redemption.waybillNo}
          {redemption.carrier === "SF" ? "（顺丰）" : ""}
        </p>
      )}
    </>
  );

  const renderRedemptionActions = (redemption: RedemptionItem) => (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" onClick={() => setTimelineId(redemption.id)}>
        详情
      </Button>
      {redemption.status === "PENDING" ? (
        <>
          {canFulfill && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openFulfillModal(redemption)}
              disabled={redemption.protectionActive}
              title={
                redemption.protectionActive
                  ? `履约保护期至 ${formatDateTime(redemption.fulfillableAt)}`
                  : undefined
              }
            >
              {redemption.protectionActive ? "保护期内" : "标记履约"}
            </Button>
          )}
          {!isOwnerActor &&
            canRequestApproval &&
            redemption.points >= APPROVAL_THRESHOLDS.redemptionCancel && (
              <ApprovalRequestAction
                policyKey="redemption.cancel"
                initialValues={{ redemptionId: redemption.id }}
                label="申请取消退分"
              />
            )}
          {canCancelRedemption &&
            (isOwnerActor || redemption.points < APPROVAL_THRESHOLDS.redemptionCancel) && (
              <Button
                variant="outline"
                size="sm"
                className="text-status-danger-fg hover:bg-status-danger-soft"
                onClick={() => setCancelTarget(redemption)}
              >
                取消退分
              </Button>
            )}
          {!canFulfill && !canCancelRedemption && !canRequestApproval && (
            <span className="text-xs text-ink-muted">只读</span>
          )}
        </>
      ) : redemption.status === "FULFILLED" ? (
        canFulfill ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openFulfillModal(redemption)}
          >
            {redemption.waybillNo ? "修改运单号" : "补录运单号"}
          </Button>
        ) : null
      ) : null}
    </div>
  );

  const renderRedemptionTime = (redemption: RedemptionItem) => (
    <div>
      <p>{formatDateTime(redemption.createdAt)}</p>
      {redemption.status === "FULFILLED" && redemption.fulfilledAt && (
        <p className="mt-0.5 text-xs text-ink-muted">
          履约：{formatDateTime(redemption.fulfilledAt)}
        </p>
      )}
      {redemption.status === "CANCELLED" && redemption.cancelledAt && (
        <p className="mt-0.5 text-xs text-ink-muted">
          取消：{formatDateTime(redemption.cancelledAt)}
        </p>
      )}
      {redemption.status === "CANCELLED" && redemption.cancelNote && (
        <p
          className="mt-0.5 max-w-[14rem] truncate text-xs text-ink-muted"
          title={redemption.cancelNote}
        >
          原因：{redemption.cancelNote}
        </p>
      )}
    </div>
  );

  const redemptionColumns: Column<RedemptionItem>[] = [
    {
      key: "user",
      title: "用户",
      width: "150px",
      render: (_value, redemption) => (
        <div>
          <p className="text-sm text-brand-charcoal/70">
            {redemption.user.nickname || "未设置昵称"}
          </p>
          <p className="text-xs text-ink-muted">{redemption.user.phone}</p>
        </div>
      ),
    },
    {
      key: "productName",
      title: "产品",
      width: "160px",
      render: (_value, redemption) => (
        <span className="text-sm text-brand-charcoal/70">{redemption.productName}</span>
      ),
    },
    {
      key: "points",
      title: "价格 / 扣分",
      width: "130px",
      numeric: true,
      render: (_value, redemption) => (
        <span className="text-sm text-brand-charcoal/70">
          ¥{redemption.priceYuan.toLocaleString()} / {redemption.points.toLocaleString()} 分
        </span>
      ),
    },
    {
      key: "shipping",
      title: "收货信息",
      width: "260px",
      render: (_value, redemption) => renderRedemptionShipping(redemption),
    },
    {
      key: "status",
      title: "状态",
      width: "90px",
      render: (_value, redemption) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[redemption.status]}`}
        >
          {STATUS_LABELS[redemption.status]}
        </span>
      ),
    },
    {
      key: "createdAt",
      title: "时间",
      width: "200px",
      render: (_value, redemption) => (
        <div className="text-sm text-ink-muted">{renderRedemptionTime(redemption)}</div>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: "320px",
      render: (_value, redemption) => renderRedemptionActions(redemption),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="积分兑换"
        description={
          view === "redemptions"
            ? `处理兑换履约与物流单号。全站可用积分 ${pointsTotal.toLocaleString()}，待履约 ${counts.PENDING ?? 0} 条。`
            : "从产品库启用积分兑换，并维护礼品库存。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
        {view === "redemptions" && canFulfill && !piiRevealed && (
          <Button variant="outline" size="sm" loading={revealingPii} onClick={handleRevealPii}>
            验证并显示完整收件信息
          </Button>
        )}
        {view === "redemptions" && canFulfill && piiRevealed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              updatePiiRevealed(false);
              void fetchRedemptions();
            }}
          >
            隐藏完整收件信息
          </Button>
        )}
        {view === "redemptions" && canRedeemRead && (
          <Button
            variant="outline"
            size="sm"
            loading={exporting}
            onClick={() => void handleExport()}
          >
            <Download className="mr-1.5 h-4 w-4" />
            导出 CSV
          </Button>
        )}
            <Button
              variant="outline"
              size="sm"
              onClick={view === "redemptions" ? fetchRedemptions : fetchProducts}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      <AdminHubTabs section="points" />

      {/* 与消费记录审核一致的筛选栏：工作区切换 + 当前工作区筛选 */}
      <div className="rounded-card border border-line bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {showViewTabs ? (
            <div
              role="group"
              aria-label="积分兑换工作区"
              className="flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1"
            >
              <button
                type="button"
                aria-pressed={view === "redemptions"}
                onClick={() =>
                  update({ view: "redemptions", page: null }, { replace: true, resetPage: false })
                }
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                  view === "redemptions"
                    ? "bg-white font-medium text-brand-charcoal shadow-sm"
                    : "text-ink-muted hover:bg-white/70 hover:text-brand-charcoal"
                }`}
              >
                兑换履约
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${
                    view === "redemptions"
                      ? "bg-brand-primary/10 text-brand-primary"
                      : "bg-surface-hover text-ink-muted"
                  }`}
                >
                  {counts.PENDING ?? 0}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={view === "gifts"}
                onClick={() => update({ view: "gifts" }, { replace: true, resetPage: false })}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                  view === "gifts"
                    ? "bg-white font-medium text-brand-charcoal shadow-sm"
                    : "text-ink-muted hover:bg-white/70 hover:text-brand-charcoal"
                }`}
              >
                礼品设置
              </button>
            </div>
          ) : (
            <h2 className="px-1 text-sm font-medium text-brand-charcoal">
              {view === "redemptions" ? "兑换履约" : "礼品设置"}
            </h2>
          )}

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:items-center">
            {view === "redemptions" ? (
              <>
                <div className="relative w-full md:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    aria-label="搜索手机号、昵称或产品名"
                    placeholder="搜索手机号 / 昵称 / 产品名"
                    value={redemptionSearch}
                    onChange={(e) => setRedemptionSearch(e.target.value)}
                    className={redemptionSearch ? "pl-10 pr-10" : "pl-10"}
                  />
                  {redemptionSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setRedemptionSearch("");
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
                  from={redemptionDateFrom}
                  to={redemptionDateTo}
                  onChange={({ from, to }) =>
                    update({ dateFrom: from || null, dateTo: to || null, page: null })
                  }
                />
                <div className="w-full sm:w-40">
                  <Select
                    aria-label="按履约状态筛选"
                    value={tab}
                    onChange={(e) => update({ tab: e.target.value })}
                    options={[
                      { value: "PENDING", label: `待履约 (${counts.PENDING ?? 0})` },
                      { value: "FULFILLED", label: `已履约 (${counts.FULFILLED ?? 0})` },
                      { value: "CANCELLED", label: `已取消 (${counts.CANCELLED ?? 0})` },
                      {
                        value: "ALL",
                        label: `全部 (${Object.values(counts).reduce((sum, count) => sum + count, 0)})`,
                      },
                    ]}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="relative w-full md:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    aria-label="搜索产品名"
                    placeholder="搜索产品名..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateProductQuery({ productSearch: searchInput.trim() || null });
                      }
                    }}
                    className="w-full pl-9"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <Select
                    aria-label="按兑换状态筛选"
                    value={redeemableFilter}
                    onChange={(e) => updateProductQuery({ redeemable: e.target.value })}
                    options={[
                      { value: "all", label: "全部产品" },
                      { value: "true", label: "仅可兑换" },
                      { value: "false", label: "未设可兑" },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 礼品设置（无 gifts:read 权限时不展示，避免必然 403） */}
      {view === "gifts" && canGiftRead && (
        <DataTable
          columns={productColumns}
          data={products}
          loading={productsLoading}
          error={productsError ? "加载产品失败" : null}
          onRetry={fetchProducts}
          rowKey="id"
          minWidth="1000px"
          emptyText="暂无匹配产品"
          isFiltered={Boolean(searchParam) || redeemableFilter !== "all"}
          onClearFilters={() =>
            updateProductQuery({ productSearch: null, redeemable: "all" })
          }
          ariaLabel="积分可兑产品列表"
          pagination={
            productTotal > 0
              ? {
                  page: productPage,
                  pageSize: 20,
                  total: productTotal,
                  onChange: (nextPage) =>
                    update({ productPage: String(nextPage) }, { resetPage: false }),
                }
              : undefined
          }
          mobileCard={(product) => (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-medium text-brand-charcoal">
                  {product.name}
                </p>
                <Badge
                  className={
                    product.published
                      ? "bg-status-success-soft text-status-success-strong"
                      : "bg-surface-hover text-ink-muted"
                  }
                >
                  {product.published ? "已发布" : "草稿"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {product.categoryName} · ¥{product.priceYuan.toLocaleString()}
              </p>
              <div className="mt-1.5">{renderProductBadges(product)}</div>
              <div className="mt-2 space-y-2 text-xs">
                {renderProductStock(product)}
                {renderProductLimit(product)}
              </div>
              <div className="mt-2 flex justify-end border-t border-line pt-2">
                {renderProductToggle(product)}
              </div>
            </div>
          )}
        />
      )}

      {view === "redemptions" && canRedeemRead && (
        <DataTable
          columns={redemptionColumns}
          data={redemptions}
          loading={redemptionLoading}
          error={redemptionsError ? "加载兑换记录失败" : null}
          onRetry={fetchRedemptions}
          rowKey="id"
          minWidth="1100px"
          emptyText="暂无兑换记录"
          isFiltered={
            tab !== "ALL" ||
            Boolean(redemptionSearchParam) ||
            Boolean(redemptionDateFrom) ||
            Boolean(redemptionDateTo)
          }
          onClearFilters={() =>
            update({
              tab: "ALL",
              search: null,
              dateFrom: null,
              dateTo: null,
              page: null,
            })
          }
          ariaLabel="积分兑换记录"
          pagination={
            redemptionsTotal > 0
              ? {
                  page,
                  pageSize: 10,
                  total: redemptionsTotal,
                  onChange: (nextPage) =>
                    update({ page: String(nextPage) }, { resetPage: false }),
                }
              : undefined
          }
          mobileCard={(redemption) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-charcoal">
                    {redemption.user.nickname || "未设置昵称"}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {redemption.user.phone}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[redemption.status]}`}
                >
                  {STATUS_LABELS[redemption.status]}
                </span>
              </div>
              <p className="truncate text-sm text-brand-charcoal/70">
                {redemption.productName}
              </p>
              <p className="text-xs text-ink-muted">
                ¥{redemption.priceYuan.toLocaleString()} /{" "}
                {redemption.points.toLocaleString()} 分
              </p>
              <div className="text-xs text-ink-muted">
                {renderRedemptionShipping(redemption)}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                <span className="text-xs text-ink-muted">
                  {redemption.status === "FULFILLED" && redemption.fulfilledAt
                    ? `履约：${formatDateTime(redemption.fulfilledAt)}`
                    : redemption.status === "CANCELLED" && redemption.cancelledAt
                      ? `取消：${formatDateTime(redemption.cancelledAt)}`
                      : formatDateTime(redemption.createdAt)}
                  {redemption.status === "CANCELLED" && redemption.cancelNote && (
                    <span className="mt-0.5 block text-ink-muted">
                      原因：{redemption.cancelNote}
                    </span>
                  )}
                </span>
                {renderRedemptionActions(redemption)}
              </div>
            </div>
          )}
        />
      )}

      <Modal
        open={!!limitTarget}
        onClose={() => setLimitTarget(null)}
        size="sm"
        title="设置每用户限购"
        description="按商品配置；滚动周期按兑换创建时间统计，已取消的兑换不计入。"
        closeOnBackdrop={false}
        closeGuard={() => !savingLimit}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLimitTarget(null)} disabled={savingLimit}>
              取消
            </Button>
            <Button onClick={handleLimitSave} loading={savingLimit}>
              保存
            </Button>
          </div>
        }
      >
        {limitTarget && (
          <div className="space-y-4">
            {limitTarget.priceYuan === 0 && (
              <div className="rounded-lg border border-status-warning-line bg-status-warning-soft px-4 py-3 text-xs text-status-warning-strong">
                该商品价格为 0 元。若同时不限库存、不限购，用户可用最低 1 积分无限兑换，请确认配置。
              </div>
            )}
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-brand-charcoal/70">
              {limitTarget.name}
            </div>
            <Select
              label="限购模式"
              value={limitUnlimited ? "unlimited" : limitWindowMode}
              onChange={(e) => {
                const value = e.target.value as "unlimited" | "lifetime" | "rolling";
                if (value === "unlimited") {
                  setLimitUnlimited(true);
                } else {
                  setLimitUnlimited(false);
                  setLimitWindowMode(value);
                }
              }}
              options={[
                { value: "unlimited", label: "不限购" },
                { value: "lifetime", label: "终身限购" },
                { value: "rolling", label: "滚动周期限购" },
              ]}
            />
            {!limitUnlimited && (
              <>
                <Input
                  label="每用户限购数量"
                  type="number"
                  min={1}
                  max={9999}
                  value={limitCount}
                  onChange={(e) => {
                    setLimitCount(e.target.value);
                    if (limitError) setLimitError("");
                  }}
                  placeholder="如 1"
                  error={limitError || undefined}
                />
                {limitWindowMode === "rolling" && (
                  <Input
                    label="统计周期（天）"
                    type="number"
                    min={1}
                    max={3650}
                    value={limitWindowDays}
                    onChange={(e) => {
                      setLimitWindowDays(e.target.value);
                      if (limitError) setLimitError("");
                    }}
                    placeholder="如 30"
                    hint="从当前时间向前滚动统计"
                    error={limitError || undefined}
                  />
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 履约 / 运单号维护弹窗 */}
      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        size="sm"
        title={fulfillTarget?.mode === "fulfill" ? "标记履约" : "维护运单号"}
        description={
          fulfillTarget?.mode === "fulfill"
            ? fulfillTarget.redemption.protectionActive
              ? `订单处于 7 天履约保护期，预计 ${formatDateTime(fulfillTarget.redemption.fulfillableAt)} 后可发货。`
              : "确认已发出该礼品？可选填顺丰运单号，填写后用户可查看物流轨迹。"
            : "填写或更新顺丰运单号（留空并保存可清除）。"
        }
        closeOnBackdrop={false}
        closeGuard={() => !submittingFulfill && confirmCloseFulfill()}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (confirmCloseFulfill()) setFulfillTarget(null);
              }}
              disabled={submittingFulfill}
            >
              取消
            </Button>
            <Button onClick={handleFulfillSubmit} loading={submittingFulfill}>
              {fulfillTarget?.mode === "fulfill" ? "确认履约" : "保存"}
            </Button>
          </div>
        }
      >
        {fulfillTarget && (
          <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            <p className="truncate">{fulfillTarget.redemption.productName}</p>
            <p className="mt-0.5">
              {fulfillTarget.redemption.recipient ?? "未填写收货人"}
              {fulfillTarget.redemption.address ? ` · ${fulfillTarget.redemption.address}` : ""}
            </p>
          </div>
        )}
        <Input
          label="顺丰运单号"
          value={waybillInput}
          onChange={(e) => {
            setWaybillInput(e.target.value);
            if (waybillError) setWaybillError("");
          }}
          data-autofocus
          placeholder="如 SF1234567890123（选填）"
          hint="8-32 位字母、数字或短横线"
          error={waybillError || undefined}
          className="mt-4 font-mono"
        />
      </Modal>

      {/* 取消兑换确认（退还积分） */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => {
          setCancelTarget(null);
          setCancelNote("");
        }}
        onConfirm={handleCancelRedemption}
        title="取消兑换并退还积分"
        description={
          cancelTarget
            ? cancelTarget.user.status === "DELETED"
              ? `确认取消「${cancelTarget.productName}」的兑换吗？该用户已注销，取消后不会退还积分，仅归还库存。`
              : `确认取消「${cancelTarget.productName}」的兑换吗？将退还用户 ${cancelTarget.points.toLocaleString()} 积分（6 个月有效期），该操作不可撤销。`
            : ""
        }
        confirmText="确认取消并退分"
        type="danger"
        loading={cancelling}
      >
        <Input
          label="取消原因（选填）"
          value={cancelNote}
          maxLength={200}
          onChange={(e) => setCancelNote(e.target.value)}
          placeholder="如：用户申请取消 / 礼品缺货"
          hint="将写入退还流水备注与审计日志"
        />
      </ConfirmDialog>

      <RedemptionTimelineModal redemptionId={timelineId} onClose={() => setTimelineId(null)} />

      {/* 资金类操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function AdminPointGiftsPage() {
  return (
    <RequirePermission
      permissions={[
        "redemptions:read",
        "redemptions:fulfill",
        "redemptions:cancel",
        "redemptions:after-sales",
        "gifts:read",
        "gifts:write",
        "points:read",
      ]}
    >
      <AdminPointGiftsContent />
    </RequirePermission>
  );
}
