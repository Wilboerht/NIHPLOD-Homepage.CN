"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Users, Pencil, Trash2, Power, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
};

interface Coupon {
  id: string;
  name: string;
  code: string | null;
  type: string;
  value: number;
  minAmount: number;
  startDate: string | null;
  endDate: string | null;
  daysValid: number | null;
  totalLimit: number | null;
  userLimit: number;
  scopeType: string;
  scopeIds: string[];
  isActive: boolean;
  _count: {
    userCoupons: number;
  };
  userCoupons: { id: string }[];
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [modalCoupon, setModalCoupon] = useState<Coupon | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const { success, error } = useToast();

  const defaultCoupon: Coupon = {
    id: "",
    name: "",
    code: null,
    type: "DISCOUNT_AMOUNT",
    value: 0,
    minAmount: 0,
    startDate: null,
    endDate: null,
    daysValid: null,
    totalLimit: null,
    userLimit: 1,
    scopeType: "ALL",
    scopeIds: [],
    isActive: true,
    _count: { userCoupons: 0 },
    userCoupons: [],
  };

  const openCreateModal = () => {
    setModalCoupon(defaultCoupon);
    setModalMode("create");
  };

  const openEditModal = (coupon: Coupon) => {
    setModalCoupon(coupon);
    setModalMode("edit");
  };

  const closeModal = () => setModalCoupon(null);

  const fetchCoupons = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await apiGet<{ coupons: Coupon[]; pagination: typeof pagination }>(
        "/api/admin/coupons",
        { page, pageSize: 20 }
      );
      setCoupons(data.coupons);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons(1);
    // 加载品类列表（用于编辑弹窗的适用范围选择）
    apiGet<{ id: string; name: string }[]>("/api/admin/categories")
      .then((data) => setCategories(data))
      .catch((err) => {
            apiConsole.error("加载品类列表失败:", err);
          });
  }, [fetchCoupons]);

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await apiPatch(`/api/admin/coupons/${id}`, { isActive: !current });
      success(current ? "已下架" : "已上架");
      fetchCoupons(pagination.page);
    } catch (err) {
      error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCoupon) return;

    try {
      const payload: Record<string, unknown> = {
        name: modalCoupon.name,
        type: modalCoupon.type,
        value: Number(modalCoupon.value),
        minAmount: Number(modalCoupon.minAmount),
        userLimit: Number(modalCoupon.userLimit),
        code: modalCoupon.code || null,
        totalLimit: modalCoupon.totalLimit !== null ? Number(modalCoupon.totalLimit) : null,
        scopeType: modalCoupon.scopeType,
        scopeIds: modalCoupon.scopeType === "ALL" ? [] : modalCoupon.scopeIds,
        isActive: modalCoupon.isActive,
      };

      if (modalCoupon.daysValid) {
        payload.daysValid = Number(modalCoupon.daysValid);
        payload.startDate = null;
        payload.endDate = null;
      } else {
        payload.daysValid = null;
        if (modalCoupon.startDate)
          payload.startDate = new Date(modalCoupon.startDate).toISOString();
        if (modalCoupon.endDate) payload.endDate = new Date(modalCoupon.endDate).toISOString();
      }

      if (modalMode === "create") {
        await apiPost("/api/admin/coupons", payload);
      } else {
        await apiPatch(`/api/admin/coupons/${modalCoupon.id}`, payload);
      }
      success(modalMode === "create" ? "创建成功" : "编辑成功");
      closeModal();
      fetchCoupons(pagination.page);
    } catch (err) {
      error(err instanceof Error ? err.message : modalMode === "create" ? "创建失败" : "编辑失败");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除优惠券「${name}」吗？此操作不可恢复。`)) return;
    try {
      await apiDelete(`/api/admin/coupons/${id}`);
      success("删除成功");
      fetchCoupons(pagination.page);
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">优惠券管理</h1>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          <Plus className="h-4 w-4" />
          创建优惠券
        </button>
      </div>

      <div className="rounded-md border bg-white">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-left text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">
                  名称/代码
                </th>
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">
                  类型/面值
                </th>
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">门槛</th>
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">有效期</th>
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">
                  发放/总限
                </th>
                <th className="text-muted-foreground h-12 px-4 align-middle font-medium">状态</th>
                <th className="text-muted-foreground h-12 px-4 text-right align-middle font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center">
                    加载中...
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground p-4 text-center">
                    暂无优惠券
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-muted/50 border-b transition-colors">
                    <td className="p-4 align-middle">
                      <div className="font-medium">{coupon.name}</div>
                      {coupon.code && (
                        <div className="focus:ring-ring bg-secondary text-secondary-foreground hover:bg-secondary/80 mt-1 inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2">
                          {coupon.code}
                        </div>
                      )}
                    </td>
                    <td className="p-4 align-middle">
                      <div>{coupon.type === "DISCOUNT_AMOUNT" ? "满减" : "折扣"}</div>
                      <div className="text-lg font-bold">
                        {coupon.type === "DISCOUNT_AMOUNT"
                          ? `¥${coupon.value}`
                          : `${Number(coupon.value) * 10}折`}
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      {Number(coupon.minAmount) > 0 ? `满 ¥${coupon.minAmount}` : "无门槛"}
                    </td>
                    <td className="p-4 align-middle">
                      {coupon.daysValid ? (
                        <span>领取后 {coupon.daysValid} 天有效</span>
                      ) : (
                        <span>
                          {coupon.startDate ? formatDate(coupon.startDate) : "即日起"}至
                          {coupon.endDate ? formatDate(coupon.endDate) : "永久"}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-brand-charcoal/50" />
                        {coupon._count.userCoupons} /{" "}
                        {coupon.totalLimit === null ? "∞" : coupon.totalLimit}
                      </div>
                      <div className="mt-0.5 text-xs text-brand-charcoal/50">
                        已使用 {coupon.userCoupons.length} 张
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${coupon.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                      >
                        {coupon.isActive ? "进行中" : "下架"}
                      </span>
                    </td>
                    <td className="p-4 text-right align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(coupon)}
                          className="rounded-md p-1.5 text-blue-600 transition-colors hover:bg-blue-50"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(coupon.id, coupon.isActive)}
                          className={`rounded-md p-1.5 transition-colors ${coupon.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                          title={coupon.isActive ? "下架" : "上架"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(coupon.id, coupon.name)}
                          className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => fetchCoupons(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded-md border p-2 hover:bg-brand-charcoal/[0.03] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-brand-charcoal/60">
            第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
          </span>
          <button
            onClick={() => fetchCoupons(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="rounded-md border p-2 hover:bg-brand-charcoal/[0.03] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      {modalCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-semibold">
                {modalMode === "create" ? "创建优惠券" : "编辑优惠券"}
              </h2>
              <button onClick={closeModal} className="rounded p-1 hover:bg-brand-charcoal/[0.06]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">名称</label>
                  <input
                    required
                    className="w-full rounded-md border p-2 text-sm"
                    value={modalCoupon.name}
                    onChange={(e) => setModalCoupon({ ...modalCoupon, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">兑换码 (选填)</label>
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    value={modalCoupon.code || ""}
                    onChange={(e) => setModalCoupon({ ...modalCoupon, code: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">类型</label>
                  <select
                    className="w-full rounded-md border p-2 text-sm"
                    value={modalCoupon.type}
                    onChange={(e) => setModalCoupon({ ...modalCoupon, type: e.target.value })}
                  >
                    <option value="DISCOUNT_AMOUNT">金额立减</option>
                    <option value="DISCOUNT_PERCENT">百分比折扣</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {modalCoupon.type === "DISCOUNT_AMOUNT" ? "面值 (元)" : "折扣率 (0.9=9折)"}
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    className="w-full rounded-md border p-2 text-sm"
                    value={modalCoupon.value}
                    onChange={(e) =>
                      setModalCoupon({ ...modalCoupon, value: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">最低消费 (元)</label>
                <input
                  required
                  type="number"
                  className="w-full rounded-md border p-2 text-sm"
                  value={modalCoupon.minAmount}
                  onChange={(e) =>
                    setModalCoupon({ ...modalCoupon, minAmount: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-3 border-t pt-4">
                <label className="text-sm font-medium">有效期设置</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!modalCoupon.daysValid}
                      onChange={() => setModalCoupon({ ...modalCoupon, daysValid: null })}
                    />
                    固定日期范围
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!!modalCoupon.daysValid}
                      onChange={() =>
                        setModalCoupon({ ...modalCoupon, daysValid: modalCoupon.daysValid || 30 })
                      }
                    />
                    动态有效期 (领取后N天)
                  </label>
                </div>
                {!modalCoupon.daysValid ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-brand-charcoal/50">开始时间</label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-md border p-2 text-sm"
                        value={
                          modalCoupon.startDate
                            ? new Date(modalCoupon.startDate).toISOString().slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setModalCoupon({ ...modalCoupon, startDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-brand-charcoal/50">结束时间</label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-md border p-2 text-sm"
                        value={
                          modalCoupon.endDate
                            ? new Date(modalCoupon.endDate).toISOString().slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setModalCoupon({ ...modalCoupon, endDate: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs text-brand-charcoal/50">有效天数</label>
                    <input
                      type="number"
                      className="w-full rounded-md border p-2 text-sm"
                      value={modalCoupon.daysValid || ""}
                      onChange={(e) =>
                        setModalCoupon({ ...modalCoupon, daysValid: Number(e.target.value) })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="space-y-3 border-t pt-4">
                <label className="text-sm font-medium">适用范围</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modalCoupon.scopeType === "ALL"}
                      onChange={() =>
                        setModalCoupon({ ...modalCoupon, scopeType: "ALL", scopeIds: [] })
                      }
                    />
                    全场通用
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modalCoupon.scopeType === "CATEGORY"}
                      onChange={() =>
                        setModalCoupon({ ...modalCoupon, scopeType: "CATEGORY", scopeIds: [] })
                      }
                    />
                    指定品类
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modalCoupon.scopeType === "PRODUCT"}
                      onChange={() =>
                        setModalCoupon({ ...modalCoupon, scopeType: "PRODUCT", scopeIds: [] })
                      }
                    />
                    指定商品
                  </label>
                </div>
                {modalCoupon.scopeType === "CATEGORY" && (
                  <div className="space-y-2">
                    <label className="text-xs text-brand-charcoal/50">选择适用品类（可多选）</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <label
                          key={cat.id}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${modalCoupon.scopeIds.includes(cat.id) ? "border-black bg-black text-white" : "border-brand-charcoal/15 bg-white hover:bg-brand-charcoal/[0.03]"}`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={modalCoupon.scopeIds.includes(cat.id)}
                            onChange={(e) => {
                              const ids = new Set(modalCoupon.scopeIds);
                              if (e.target.checked) ids.add(cat.id);
                              else ids.delete(cat.id);
                              setModalCoupon({ ...modalCoupon, scopeIds: Array.from(ids) });
                            }}
                          />
                          {cat.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {modalCoupon.scopeType === "PRODUCT" && (
                  <div className="space-y-2">
                    <label className="text-xs text-brand-charcoal/50">适用商品ID（逗号分隔）</label>
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="例如：abc123,def456"
                      value={modalCoupon.scopeIds.join(",")}
                      onChange={(e) =>
                        setModalCoupon({
                          ...modalCoupon,
                          scopeIds: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">总发行量</label>
                  <input
                    type="number"
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="留空为无限"
                    value={modalCoupon.totalLimit !== null ? modalCoupon.totalLimit : ""}
                    onChange={(e) =>
                      setModalCoupon({
                        ...modalCoupon,
                        totalLimit: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">每人限领</label>
                  <input
                    required
                    type="number"
                    className="w-full rounded-md border p-2 text-sm"
                    value={modalCoupon.userLimit}
                    onChange={(e) =>
                      setModalCoupon({ ...modalCoupon, userLimit: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={modalCoupon.isActive}
                    onChange={(e) => setModalCoupon({ ...modalCoupon, isActive: e.target.checked })}
                    className="rounded border-brand-charcoal/20"
                  />
                  <span>上架中</span>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setModalCoupon(null)}
                    className="rounded-md border px-4 py-2 text-sm hover:bg-brand-charcoal/[0.03]"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
                  >
                    保存
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
