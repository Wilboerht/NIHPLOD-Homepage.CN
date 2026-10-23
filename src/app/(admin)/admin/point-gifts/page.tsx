"use client";

/**
 * 积分兑换与履约后台页面
 * - 可兑换产品：产品库中的产品标记"积分可兑"后出现在用户面板兑换板块（仅超级管理员可设置）
 * - 兑换记录：查看与履约标记
 */
import { useCallback, useEffect, useState } from "react";
import { Gift, PackageCheck, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useListQuery } from "@/hooks/useListQuery";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { formatDateTimeNumeric as formatDateTime } from "@/lib/format";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";

interface RedeemableProductItem {
  id: string;
  name: string;
  priceYuan: number;
  published: boolean;
  pointRedeemable: boolean;
  redeemStock: number | null;
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
  fulfilledAt: string | null;
  user: { id: string; phone: string; nickname: string | null };
}

type StatusTab = "PENDING" | "FULFILLED" | "CANCELLED" | "ALL";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-brand-charcoal/[0.06] text-brand-charcoal/65",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
};

function AdminPointGiftsContent() {
  const { get, getNumber, update } = useListQuery();
  const { success, error: showError } = useToast();
  const { can: canAdmin } = useAdminPermissions();
  const canGiftWrite = canAdmin("gifts:write");
  const canGiftRead = canAdmin("gifts:read");
  const canRedeemRead = canAdmin("redemptions:read");
  const canFulfill = canAdmin("redemptions:fulfill");
  const canCancelRedemption = canAdmin("redemptions:cancel");
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
  const [savingStock, setSavingStock] = useState(false);

  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pointsTotal, setPointsTotal] = useState(0);
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [redemptionsError, setRedemptionsError] = useState(false);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
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
  const [submittingFulfill, setSubmittingFulfill] = useState(false);
  const isFulfillDirty =
    !!fulfillTarget && waybillInput !== (fulfillTarget.redemption.waybillNo ?? "");
  const { confirmClose: confirmCloseFulfill } = useUnsavedChanges(isFulfillDirty);
  const [cancelTarget, setCancelTarget] = useState<RedemptionItem | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const takeLatestProducts = useLatestRequest();
  const fetchProducts = useCallback(async () => {
    // 无 gifts:read 时产品面板不展示，也避免必然 403 的请求
    if (!canGiftRead) {
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
  }, [productPage, searchParam, redeemableFilter, showError, canGiftRead, takeLatestProducts]);

  const takeLatestRedemptions = useLatestRequest();
  const fetchRedemptions = useCallback(async () => {
    // 仅 gifts:read 的角色不渲染兑换记录，避免必然 403
    if (!canRedeemRead) {
      setRedemptionLoading(false);
      return;
    }
    const isLatest = takeLatestRedemptions();
    setRedemptionLoading(true);
    try {
      const data = await apiGet<{
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
      if (!isLatest()) return;
      setRedemptions(data.redemptions);
      setCounts(data.counts);
      setPointsTotal(data.pointsTotal);
      setRedemptionsTotal(data.pagination.total);
      setRedemptionsError(false);
    } catch {
      if (!isLatest()) return;
      setRedemptionsError(true);
      showError("加载兑换记录失败");
    } finally {
      if (isLatest()) setRedemptionLoading(false);
    }
  }, [page, tab, redemptionSearchParam, showError, canRedeemRead, takeLatestRedemptions]);

  // 两个数据集独立请求，避免任一筛选变化重复拉取全部数据
  useEffect(() => {
    deferInEffect(fetchProducts);
  }, [fetchProducts]);

  useEffect(() => {
    deferInEffect(fetchRedemptions);
  }, [fetchRedemptions]);

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
      await apiPatch("/api/admin/point-gifts", {
        productId: p.id,
        pointRedeemable: !p.pointRedeemable,
      });
      success(p.pointRedeemable ? "已取消积分可兑" : "已设为积分可兑");
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
      showError("库存须为非负整数，留空表示不限量");
      return;
    }
    setSavingStock(true);
    try {
      await apiPatch("/api/admin/point-gifts", {
        productId: p.id,
        pointRedeemable: p.pointRedeemable,
        redeemStock: stock,
      });
      success("兑换库存已更新");
      setStockEdit(null);
      fetchProducts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setSavingStock(false);
    }
  };

  /** 打开履约/运单号弹窗（履约可录入运单号；已履约可补录/修改） */
  const openFulfillModal = (r: RedemptionItem) => {
    setWaybillInput(r.waybillNo ?? "");
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
      showError("运单号须为 8-32 位字母、数字或短横线");
      return;
    }
    setSubmittingFulfill(true);
    try {
      if (mode === "fulfill") {
        await apiPost(`/api/admin/point-redemptions/${redemption.id}/fulfill`, {
          waybillNo: waybillNo || undefined,
        });
        success("已标记履约");
      } else {
        await apiPatch(`/api/admin/point-redemptions/${redemption.id}/waybill`, {
          waybillNo,
        });
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="积分兑换"
        description="标记产品库中的产品为「积分可兑」后，将出现在用户面板兑换板块；用户实际扣分 = 产品价格 ÷ 当前兑礼率（向下取整）"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchProducts();
              fetchRedemptions();
            }}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {/* 概览统计（需要兑换记录查看权限） */}
      {canRedeemRead && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-5">
            <p className="text-xs text-brand-charcoal/65">全站可用积分总额</p>
            <p className="mt-1 text-2xl font-semibold text-brand-charcoal">
              {pointsTotal.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-brand-charcoal/65">
              所有用户账户可用积分之和（可含退款冲正负值）
            </p>
          </div>
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-5">
            <p className="text-xs text-brand-charcoal/65">待履约兑换</p>
            <p className="mt-1 text-2xl font-semibold text-brand-charcoal">{counts.PENDING ?? 0}</p>
            <p className="mt-1 text-[11px] text-brand-charcoal/65">待发货处理</p>
          </div>
          <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-5">
            <p className="text-xs text-brand-charcoal/65">已履约兑换</p>
            <p className="mt-1 text-2xl font-semibold text-brand-charcoal">
              {counts.FULFILLED ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-brand-charcoal/65">已发货</p>
          </div>
        </div>
      )}

      {/* 可兑换产品（无 gifts:read 权限时不展示，避免必然 403） */}
      {canGiftRead && (
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-medium text-brand-charcoal">
              <Gift className="h-5 w-5 text-brand-charcoal/65" />
              可兑换产品（产品库）
            </h2>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
                <Input
                  placeholder="搜索产品名..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateProductQuery({ productSearch: searchInput.trim() || null });
                    }
                  }}
                  className="w-full pl-9 sm:w-48"
                />
              </div>
              <Select
                value={redeemableFilter}
                onChange={(e) => updateProductQuery({ redeemable: e.target.value })}
                options={[
                  { value: "all", label: "全部产品" },
                  { value: "true", label: "仅可兑换" },
                  { value: "false", label: "未设可兑" },
                ]}
                className="w-full sm:w-32"
              />
            </div>
          </div>
          <div className="md:hidden">
            {productsLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-28 animate-pulse rounded-xl bg-brand-charcoal/[0.04]"
                  />
                ))}
              </div>
            ) : productsError ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-red-500">加载产品失败</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchProducts}>
                  重试
                </Button>
              </div>
            ) : products.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-brand-charcoal/65">暂无匹配产品</p>
            ) : (
              <div className="divide-y divide-brand-charcoal/10">
                {products.map((p) => (
                  <div key={p.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-medium text-brand-charcoal">{p.name}</p>
                      <Badge
                        className={
                          p.published
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                        }
                      >
                        {p.published ? "已发布" : "草稿"}
                      </Badge>
                    </div>
                    <p className="text-xs text-brand-charcoal/65">
                      {p.categoryName} · ¥{p.priceYuan.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge
                        className={
                          p.pointRedeemable
                            ? "bg-amber-100 text-amber-700"
                            : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                        }
                      >
                        {p.pointRedeemable ? "可兑换" : "未设置"}
                      </Badge>
                      {p.pointRedeemable && p.redeemStock === 0 && (
                        <Badge className="bg-red-100 text-red-600">已兑完</Badge>
                      )}
                      {stockEdit?.id === p.id ? (
                        <div className="flex w-full items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={stockEdit.value}
                            onChange={(e) => setStockEdit({ id: p.id, value: e.target.value })}
                            placeholder="留空=不限量"
                            className="w-28"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            loading={savingStock}
                            onClick={() => handleStockSave(p)}
                          >
                            保存
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setStockEdit(null)}>
                            取消
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-brand-charcoal/70">
                            库存：{p.redeemStock === null ? "不限量" : p.redeemStock}
                          </span>
                          {canGiftWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setStockEdit({
                                  id: p.id,
                                  value: p.redeemStock === null ? "" : String(p.redeemStock),
                                })
                              }
                            >
                              编辑库存
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex justify-end border-t border-brand-charcoal/10 pt-2">
                      {canGiftWrite ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={togglingId === p.id || (!p.pointRedeemable && !p.published)}
                          onClick={() => handleToggle(p)}
                        >
                          {togglingId === p.id
                            ? "处理中..."
                            : p.pointRedeemable
                              ? "取消可兑"
                              : "设为可兑"}
                        </Button>
                      ) : (
                        <span className="text-xs text-brand-charcoal/65">仅超级管理员可设置</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b bg-brand-charcoal/[0.03] text-left text-xs uppercase text-brand-charcoal/65">
                  <th className="px-4 py-3 font-medium">产品</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">参考价格</th>
                  <th className="px-4 py-3 font-medium">发布状态</th>
                  <th className="px-4 py-3 font-medium">积分可兑</th>
                  <th className="px-4 py-3 font-medium">兑换库存</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {productsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-brand-charcoal/65" />
                    </td>
                  </tr>
                ) : productsError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <p className="text-sm text-red-500">加载产品失败</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={fetchProducts}>
                        重试
                      </Button>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-brand-charcoal/65"
                    >
                      暂无匹配产品
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="hover:bg-brand-charcoal/[0.03]">
                      <td className="px-4 py-3 text-sm text-brand-charcoal/70">{p.name}</td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/65">{p.categoryName}</td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/70">
                        ¥{p.priceYuan.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            p.published
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                          }
                        >
                          {p.published ? "已发布" : "草稿"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={
                              p.pointRedeemable
                                ? "bg-amber-100 text-amber-700"
                                : "bg-brand-charcoal/[0.06] text-brand-charcoal/65"
                            }
                          >
                            {p.pointRedeemable ? "可兑换" : "未设置"}
                          </Badge>
                          {p.pointRedeemable && p.redeemStock === 0 && (
                            <Badge className="bg-red-100 text-red-600">已兑完</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/70">
                        {stockEdit?.id === p.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              value={stockEdit.value}
                              onChange={(e) => setStockEdit({ id: p.id, value: e.target.value })}
                              placeholder="留空=不限量"
                              className="w-28"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              loading={savingStock}
                              onClick={() => handleStockSave(p)}
                            >
                              保存
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setStockEdit(null)}>
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{p.redeemStock === null ? "不限量" : p.redeemStock}</span>
                            {canGiftWrite && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setStockEdit({
                                    id: p.id,
                                    value: p.redeemStock === null ? "" : String(p.redeemStock),
                                  })
                                }
                              >
                                编辑
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canGiftWrite ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              togglingId === p.id ||
                              // 仅"设为可兑"要求已发布；未发布但已可兑的产品必须允许取消
                              (!p.pointRedeemable && !p.published)
                            }
                            onClick={() => handleToggle(p)}
                          >
                            {togglingId === p.id
                              ? "处理中..."
                              : p.pointRedeemable
                                ? "取消可兑"
                                : "设为可兑"}
                          </Button>
                        ) : (
                          <span className="text-xs text-brand-charcoal/65">
                            需要积分可兑设置权限
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3">
            <Pagination
              page={productPage}
              pageSize={20}
              total={productTotal}
              onChange={(nextPage) =>
                update({ productPage: String(nextPage) }, { resetPage: false })
              }
            />
          </div>
        </div>
      )}

      {/* 兑换记录（需要 redemptions:read） */}
      {canRedeemRead && (
        <div className="rounded-2xl border border-brand-charcoal/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-medium text-brand-charcoal">
              <PackageCheck className="h-5 w-5 text-brand-charcoal/65" />
              兑换记录
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
              <Input
                placeholder="搜索手机号 / 昵称 / 产品名"
                value={redemptionSearch}
                onChange={(e) => setRedemptionSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-b px-4 py-3">
            {(
              [
                { key: "PENDING", label: "待履约" },
                { key: "FULFILLED", label: "已履约" },
                { key: "CANCELLED", label: "已取消" },
                { key: "ALL", label: "全部" },
              ] as { key: StatusTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => update({ tab: t.key })}
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
                  {t.key === "ALL"
                    ? Object.values(counts).reduce((s, c) => s + c, 0)
                    : (counts[t.key] ?? 0)}
                </span>
              </button>
            ))}
          </div>
          <div className="md:hidden">
            {redemptionLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-xl bg-brand-charcoal/[0.04]"
                  />
                ))}
              </div>
            ) : redemptionsError ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-red-500">加载兑换记录失败</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchRedemptions}>
                  重试
                </Button>
              </div>
            ) : redemptions.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-brand-charcoal/65">暂无兑换记录</p>
            ) : (
              <div className="divide-y divide-brand-charcoal/10">
                {redemptions.map((r) => (
                  <div key={r.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-brand-charcoal">
                          {r.user.nickname || "未设置昵称"}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/65">{r.user.phone}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    <p className="truncate text-sm text-brand-charcoal/70">{r.productName}</p>
                    <p className="text-xs text-brand-charcoal/65">
                      ¥{r.priceYuan.toLocaleString()} / {r.points.toLocaleString()} 分
                    </p>
                    <div className="text-xs text-brand-charcoal/65">
                      {r.recipient && r.address ? (
                        <>
                          <p>
                            {r.recipient}
                            {r.phone && (
                              <span className="ml-2 text-brand-charcoal/65">{r.phone}</span>
                            )}
                          </p>
                          <p className="mt-0.5">{r.address}</p>
                        </>
                      ) : (
                        <span>未填写收货信息</span>
                      )}
                      {r.waybillNo && (
                        <p className="mt-0.5 text-brand-primary">
                          运单号：{r.waybillNo}
                          {r.carrier === "SF" ? "（顺丰）" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
                      <span className="text-xs text-brand-charcoal/65">
                        {r.status === "FULFILLED" && r.fulfilledAt
                          ? `履约：${formatDateTime(r.fulfilledAt)}`
                          : formatDateTime(r.createdAt)}
                      </span>
                      <div className="flex flex-wrap justify-end gap-2">
                        {r.status === "PENDING" ? (
                          <>
                            {canFulfill && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openFulfillModal(r)}
                              >
                                标记履约
                              </Button>
                            )}
                            {canCancelRedemption && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => setCancelTarget(r)}
                              >
                                取消退分
                              </Button>
                            )}
                            {!canFulfill && !canCancelRedemption && (
                              <span className="text-xs text-brand-charcoal/65">只读</span>
                            )}
                          </>
                        ) : r.status === "FULFILLED" ? (
                          canFulfill ? (
                            <Button variant="outline" size="sm" onClick={() => openFulfillModal(r)}>
                              {r.waybillNo ? "修改运单号" : "补录运单号"}
                            </Button>
                          ) : null
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b bg-brand-charcoal/[0.03] text-left text-xs uppercase text-brand-charcoal/65">
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">产品</th>
                  <th className="px-4 py-3 font-medium">价格 / 扣分</th>
                  <th className="px-4 py-3 font-medium">收货信息</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {redemptionLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-brand-charcoal/65" />
                    </td>
                  </tr>
                ) : redemptionsError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <p className="text-sm text-red-500">加载兑换记录失败</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={fetchRedemptions}
                      >
                        重试
                      </Button>
                    </td>
                  </tr>
                ) : redemptions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-brand-charcoal/65"
                    >
                      暂无兑换记录
                    </td>
                  </tr>
                ) : (
                  redemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-brand-charcoal/[0.03]">
                      <td className="px-4 py-3">
                        <p className="text-sm text-brand-charcoal/70">
                          {r.user.nickname || "未设置昵称"}
                        </p>
                        <p className="text-xs text-brand-charcoal/65">{r.user.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/70">{r.productName}</td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/70">
                        ¥{r.priceYuan.toLocaleString()} / {r.points.toLocaleString()} 分
                      </td>
                      <td className="px-4 py-3">
                        {r.recipient && r.address ? (
                          <>
                            <p className="text-sm text-brand-charcoal/70">
                              {r.recipient}
                              {r.phone && (
                                <span className="ml-2 text-xs text-brand-charcoal/65">
                                  {r.phone}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-brand-charcoal/65">{r.address}</p>
                          </>
                        ) : (
                          <span className="text-xs text-brand-charcoal/65">未填写</span>
                        )}
                        {r.waybillNo && (
                          <p className="mt-0.5 text-xs text-brand-primary">
                            运单号：{r.waybillNo}
                            {r.carrier === "SF" ? "（顺丰）" : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}
                        >
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-charcoal/65">
                        <p>{formatDateTime(r.createdAt)}</p>
                        {r.status === "FULFILLED" && r.fulfilledAt && (
                          <p className="mt-0.5 text-xs text-brand-charcoal/65">
                            履约：{formatDateTime(r.fulfilledAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {r.status === "PENDING" ? (
                            <>
                              {canFulfill && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openFulfillModal(r)}
                                >
                                  标记履约
                                </Button>
                              )}
                              {canCancelRedemption && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={() => setCancelTarget(r)}
                                >
                                  取消退分
                                </Button>
                              )}
                              {!canFulfill && !canCancelRedemption && (
                                <span className="text-xs text-brand-charcoal/65">只读</span>
                              )}
                            </>
                          ) : r.status === "FULFILLED" ? (
                            canFulfill ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openFulfillModal(r)}
                              >
                                {r.waybillNo ? "修改运单号" : "补录运单号"}
                              </Button>
                            ) : null
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3">
            <Pagination
              page={page}
              pageSize={10}
              total={redemptionsTotal}
              onChange={(nextPage) => update({ page: String(nextPage) }, { resetPage: false })}
            />
          </div>
        </div>
      )}

      {/* 履约 / 运单号维护弹窗 */}
      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        size="sm"
        title={fulfillTarget?.mode === "fulfill" ? "标记履约" : "维护运单号"}
        description={
          fulfillTarget?.mode === "fulfill"
            ? "确认已发出该礼品？可选填顺丰运单号，填写后用户可查看物流轨迹。"
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
          <div className="rounded-lg bg-brand-charcoal/[0.03] px-3 py-2 text-xs text-brand-charcoal/65">
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
          onChange={(e) => setWaybillInput(e.target.value)}
          data-autofocus
          placeholder="如 SF1234567890123（选填）"
          hint="8-32 位字母、数字或短横线"
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
            ? `确定取消「${cancelTarget.productName}」的兑换吗？将向用户退还 ${cancelTarget.points.toLocaleString()} 积分（6 个月有效期），此操作不可撤销。`
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

      {/* 资金类操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function AdminPointGiftsPage() {
  return (
    <RequirePermission permissions={["redemptions:read", "gifts:read"]}>
      <AdminPointGiftsContent />
    </RequirePermission>
  );
}
