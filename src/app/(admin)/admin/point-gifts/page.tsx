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
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

interface RedeemableProductItem {
  id: string;
  name: string;
  priceYuan: number;
  published: boolean;
  pointRedeemable: boolean;
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

type StatusTab = "PENDING" | "FULFILLED" | "ALL";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export default function AdminPointGiftsPage() {
  const { success, error: showError } = useToast();
  const [products, setProducts] = useState<RedeemableProductItem[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [redeemableFilter, setRedeemableFilter] = useState<"all" | "true" | "false">("all");
  const [productsLoading, setProductsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [tab, setTab] = useState<StatusTab>("PENDING");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fulfillTarget, setFulfillTarget] = useState<{
    redemption: RedemptionItem;
    mode: "fulfill" | "waybill";
  } | null>(null);
  const [waybillInput, setWaybillInput] = useState("");
  const [submittingFulfill, setSubmittingFulfill] = useState(false);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const data = await apiGet<{
        products: RedeemableProductItem[];
        pagination: { page: number; totalPages: number };
      }>("/api/admin/point-gifts", {
        page: productPage,
        pageSize: 20,
        search: search || undefined,
        redeemable: redeemableFilter === "all" ? undefined : redeemableFilter,
      });
      setProducts(data.products);
      setProductTotalPages(data.pagination.totalPages);
    } catch {
      showError("加载产品失败");
    } finally {
      setProductsLoading(false);
    }
  }, [productPage, search, redeemableFilter, showError]);

  const fetchRedemptions = useCallback(async () => {
    setRedemptionLoading(true);
    try {
      const data = await apiGet<{
        redemptions: RedemptionItem[];
        counts: Record<string, number>;
        pagination: { page: number; totalPages: number };
      }>("/api/admin/point-redemptions", {
        page,
        pageSize: 10,
        status: tab === "ALL" ? undefined : tab,
      });
      setRedemptions(data.redemptions);
      setCounts(data.counts);
      setTotalPages(data.pagination.totalPages);
    } catch {
      showError("加载兑换记录失败");
    } finally {
      setRedemptionLoading(false);
    }
  }, [page, tab, showError]);

  useEffect(() => {
    deferInEffect(fetchProducts);
    deferInEffect(fetchRedemptions);
  }, [fetchProducts, fetchRedemptions]);

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

  /** 打开履约/运单号弹窗（履约可录入运单号；已履约可补录/修改） */
  const openFulfillModal = (r: RedemptionItem) => {
    setWaybillInput(r.waybillNo ?? "");
    setFulfillTarget({
      redemption: r,
      mode: r.status === "PENDING" ? "fulfill" : "waybill",
    });
  };

  const handleFulfillSubmit = async () => {
    if (!fulfillTarget) return;
    const { redemption, mode } = fulfillTarget;
    const waybillNo = waybillInput.trim();
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
      fetchRedemptions();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setSubmittingFulfill(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-gray-800">积分兑换</h1>
          <p className="mt-1 text-xs text-gray-500">
            标记产品库中的产品为「积分可兑」后，将出现在用户面板兑换板块；
            用户实际扣分 = 产品价格 ÷ 当前兑礼率（向下取整）
          </p>
        </div>
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
      </div>

      {/* 可兑换产品 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800">
            <Gift className="h-5 w-5 text-gray-500" />
            可兑换产品（产品库）
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="搜索产品名..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setProductPage(1);
                    setSearch(searchInput.trim());
                  }
                }}
                className="w-48 pl-9"
              />
            </div>
            <select
              value={redeemableFilter}
              onChange={(e) => {
                setProductPage(1);
                setRedeemableFilter(e.target.value as "all" | "true" | "false");
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600"
            >
              <option value="all">全部产品</option>
              <option value="true">仅可兑换</option>
              <option value="false">未设可兑</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">产品</th>
                <th className="px-6 py-3 font-medium">分类</th>
                <th className="px-6 py-3 font-medium">参考价格</th>
                <th className="px-6 py-3 font-medium">发布状态</th>
                <th className="px-6 py-3 font-medium">积分可兑</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {productsLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                    暂无匹配产品
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-700">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.categoryName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ¥{p.priceYuan.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={p.published ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}>
                        {p.published ? "已发布" : "草稿"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={
                          p.pointRedeemable ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                        }
                      >
                        {p.pointRedeemable ? "可兑换" : "未设置"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={togglingId === p.id || !p.published}
                        onClick={() => handleToggle(p)}
                      >
                        {togglingId === p.id
                          ? "处理中..."
                          : p.pointRedeemable
                            ? "取消可兑"
                            : "设为可兑"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {productTotalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-gray-500">
            <span>
              第 {productPage}/{productTotalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={productPage <= 1}
                onClick={() => setProductPage((p) => p - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={productPage >= productTotalPages}
                onClick={() => setProductPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 兑换记录 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800">
            <PackageCheck className="h-5 w-5 text-gray-500" />
            兑换记录
          </h2>
        </div>
        <div className="flex gap-2 border-b px-6 py-3">
          {(
            [
              { key: "PENDING", label: "待履约" },
              { key: "FULFILLED", label: "已履约" },
              { key: "ALL", label: "全部" },
            ] as { key: StatusTab; label: string }[]
          ).map((t) => (
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
                {t.key === "ALL"
                  ? Object.values(counts).reduce((s, c) => s + c, 0)
                  : (counts[t.key] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">用户</th>
                <th className="px-6 py-3 font-medium">产品</th>
                <th className="px-6 py-3 font-medium">价格 / 扣分</th>
                <th className="px-6 py-3 font-medium">收货信息</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {redemptionLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : redemptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    暂无兑换记录
                  </td>
                </tr>
              ) : (
                redemptions.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{r.user.nickname || "未设置昵称"}</p>
                      <p className="text-xs text-gray-400">{r.user.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.productName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ¥{r.priceYuan.toLocaleString()} / {r.points.toLocaleString()} 分
                    </td>
                    <td className="px-6 py-4">
                      {r.recipient && r.address ? (
                        <>
                          <p className="text-sm text-gray-700">
                            {r.recipient}
                            {r.phone && <span className="ml-2 text-xs text-gray-400">{r.phone}</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">{r.address}</p>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">未填写</span>
                      )}
                      {r.waybillNo && (
                        <p className="mt-0.5 text-xs text-blue-700">
                          运单号：{r.waybillNo}
                          {r.carrier === "SF" ? "（顺丰）" : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(r.createdAt)}</td>
                    <td className="px-6 py-4">
                      {r.status === "PENDING" ? (
                        <Button variant="outline" size="sm" onClick={() => openFulfillModal(r)}>
                          标记履约
                        </Button>
                      ) : r.status === "FULFILLED" ? (
                        <Button variant="outline" size="sm" onClick={() => openFulfillModal(r)}>
                          {r.waybillNo ? "修改运单号" : "补录运单号"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-gray-500">
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
      </div>

      {/* 履约 / 运单号维护弹窗 */}
      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        size="sm"
        showCloseButton={false}
      >
        <h3 className="text-lg font-semibold text-gray-800">
          {fulfillTarget?.mode === "fulfill" ? "标记履约" : "维护运单号"}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {fulfillTarget?.mode === "fulfill"
            ? "确认已发出该礼品？可选填顺丰运单号，填写后用户可查看物流轨迹。"
            : "填写或更新顺丰运单号（留空并保存可清除）。"}
        </p>
        {fulfillTarget && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <p className="truncate">{fulfillTarget.redemption.productName}</p>
            <p className="mt-0.5">
              {fulfillTarget.redemption.recipient ?? "未填写收货人"}
              {fulfillTarget.redemption.address
                ? ` · ${fulfillTarget.redemption.address}`
                : ""}
            </p>
          </div>
        )}
        <Input
          value={waybillInput}
          onChange={(e) => setWaybillInput(e.target.value)}
          placeholder="顺丰运单号（如 SF1234567890123，选填）"
          className="mt-4"
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setFulfillTarget(null)}
            disabled={submittingFulfill}
          >
            取消
          </Button>
          <Button onClick={handleFulfillSubmit} loading={submittingFulfill}>
            {fulfillTarget?.mode === "fulfill" ? "确认履约" : "保存"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
