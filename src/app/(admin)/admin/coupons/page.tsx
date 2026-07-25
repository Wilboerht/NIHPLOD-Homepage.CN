"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Users, Pencil, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";

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
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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
    apiGet<{ id: string; name: string }[]>("/api/admin/categories")
      .then((data) => setCategories(data))
      .catch(() => error("加载分类列表失败"));
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

    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/coupons/${deleteTarget.id}`);
      success("删除成功");
      setDeleteTarget(null);
      fetchCoupons(pagination.page);
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-charcoal">优惠券管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            管理所有优惠券{!loading && pagination.total > 0 ? `，共 ${pagination.total} 张` : ""}
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
          创建优惠券
        </Button>
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-brand-charcoal/50">
            <p className="text-lg font-medium text-brand-charcoal/60">暂无优惠券</p>
            <p className="mt-1 text-sm">点击上方按钮创建第一张优惠券</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">名称/代码</th>
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">类型/面值</th>
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">门槛</th>
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">有效期</th>
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">发放/总限</th>
                  <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">状态</th>
                  <th className="px-5 py-3.5 text-right font-medium text-brand-charcoal/60">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-charcoal/[0.06]">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="transition-colors hover:bg-brand-charcoal/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-brand-charcoal">{coupon.name}</div>
                      {coupon.code && (
                        <span className="mt-1 inline-flex items-center rounded bg-brand-charcoal/8 px-2 py-0.5 text-xs font-medium text-brand-charcoal/60">
                          {coupon.code}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-brand-charcoal/60">
                        {coupon.type === "DISCOUNT_AMOUNT" ? "满减" : "折扣"}
                      </div>
                      <div className="text-lg font-bold text-brand-primary">
                        {coupon.type === "DISCOUNT_AMOUNT"
                          ? `¥${coupon.value}`
                          : `${Number(coupon.value) * 10}折`}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-brand-charcoal/80">
                      {Number(coupon.minAmount) > 0 ? `满 ¥${coupon.minAmount}` : "无门槛"}
                    </td>
                    <td className="px-5 py-3.5 text-brand-charcoal/80">
                      {coupon.daysValid ? (
                        <span>领取后 {coupon.daysValid} 天有效</span>
                      ) : (
                        <span>
                          {coupon.startDate ? formatDate(coupon.startDate) : "即日起"}至
                          {coupon.endDate ? formatDate(coupon.endDate) : "永久"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 text-brand-charcoal/80">
                        <Users className="h-4 w-4 text-brand-charcoal/50" />
                        {coupon._count.userCoupons} /{" "}
                        {coupon.totalLimit === null ? "∞" : coupon.totalLimit}
                      </div>
                      <div className="mt-0.5 text-xs text-brand-charcoal/50">
                        已使用 {coupon.userCoupons.length} 张
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={coupon.isActive ? "success" : "default"}>
                        {coupon.isActive ? "进行中" : "下架"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(coupon)}
                          className="rounded p-1.5 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-primary"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(coupon.id, coupon.isActive)}
                          className="rounded p-1.5 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                          title={coupon.isActive ? "下架" : "上架"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            setDeleteTarget({ id: coupon.id, name: coupon.name })
                          }
                          className="rounded p-1.5 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      <div className="flex justify-center">
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={(p) => fetchCoupons(p)}
        />
      </div>

      {/* 创建/编辑弹窗 */}
      <Modal
        open={!!modalCoupon}
        onClose={closeModal}
        title={modalMode === "create" ? "创建优惠券" : "编辑优惠券"}
        size="lg"
      >
        {modalCoupon && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="名称"
                required
                value={modalCoupon.name}
                onChange={(e) => setModalCoupon({ ...modalCoupon, name: e.target.value })}
              />
              <Input
                label="兑换码（选填）"
                value={modalCoupon.code || ""}
                onChange={(e) => setModalCoupon({ ...modalCoupon, code: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="类型"
                options={[
                  { value: "DISCOUNT_AMOUNT", label: "金额立减" },
                  { value: "DISCOUNT_PERCENT", label: "百分比折扣" },
                ]}
                value={modalCoupon.type}
                onChange={(e) => setModalCoupon({ ...modalCoupon, type: e.target.value })}
              />
              <Input
                label={modalCoupon.type === "DISCOUNT_AMOUNT" ? "面值（元）" : "折扣率（0.9=9折）"}
                type="number"
                step="0.01"
                required
                value={modalCoupon.value}
                onChange={(e) => setModalCoupon({ ...modalCoupon, value: Number(e.target.value) })}
              />
            </div>
            <Input
              label="最低消费（元）"
              type="number"
              required
              value={modalCoupon.minAmount}
              onChange={(e) => setModalCoupon({ ...modalCoupon, minAmount: Number(e.target.value) })}
            />

            {/* 有效期设置 */}
            <div className="space-y-3 border-t pt-4">
              <label className="text-sm font-medium text-brand-charcoal">有效期设置</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!modalCoupon.daysValid}
                    onChange={() => setModalCoupon({ ...modalCoupon, daysValid: null })}
                    className="h-4 w-4 text-brand-primary"
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
                    className="h-4 w-4 text-brand-primary"
                  />
                  动态有效期（领取后N天）
                </label>
              </div>
              {!modalCoupon.daysValid ? (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="开始时间"
                    type="datetime-local"
                    value={
                      modalCoupon.startDate
                        ? new Date(modalCoupon.startDate).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setModalCoupon({ ...modalCoupon, startDate: e.target.value })
                    }
                  />
                  <Input
                    label="结束时间"
                    type="datetime-local"
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
              ) : (
                <Input
                  label="有效天数"
                  type="number"
                  value={modalCoupon.daysValid || ""}
                  onChange={(e) =>
                    setModalCoupon({ ...modalCoupon, daysValid: Number(e.target.value) })
                  }
                />
              )}
            </div>

            {/* 适用范围 */}
            <div className="space-y-3 border-t pt-4">
              <label className="text-sm font-medium text-brand-charcoal">适用范围</label>
              <div className="flex gap-4 text-sm">
                {[
                  { value: "ALL", label: "全场通用" },
                  { value: "CATEGORY", label: "指定品类" },
                  { value: "PRODUCT", label: "指定商品" },
                ].map((s) => (
                  <label key={s.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modalCoupon.scopeType === s.value}
                      onChange={() =>
                        setModalCoupon({ ...modalCoupon, scopeType: s.value, scopeIds: [] })
                      }
                      className="h-4 w-4 text-brand-primary"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              {modalCoupon.scopeType === "CATEGORY" && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <label
                      key={cat.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        modalCoupon.scopeIds.includes(cat.id)
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                          : "border-brand-charcoal/15 bg-white hover:bg-brand-charcoal/[0.03]"
                      }`}
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
              )}
              {modalCoupon.scopeType === "PRODUCT" && (
                <Input
                  placeholder="适用商品ID（逗号分隔），例如：abc123,def456"
                  value={modalCoupon.scopeIds.join(",")}
                  onChange={(e) =>
                    setModalCoupon({
                      ...modalCoupon,
                      scopeIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <Input
                label="总发行量"
                type="number"
                placeholder="留空为无限"
                value={modalCoupon.totalLimit !== null ? modalCoupon.totalLimit : ""}
                onChange={(e) =>
                  setModalCoupon({
                    ...modalCoupon,
                    totalLimit: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <Input
                label="每人限领"
                type="number"
                required
                value={modalCoupon.userLimit}
                onChange={(e) =>
                  setModalCoupon({ ...modalCoupon, userLimit: Number(e.target.value) })
                }
              />
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modalCoupon.isActive}
                  onChange={(e) => setModalCoupon({ ...modalCoupon, isActive: e.target.checked })}
                  className="h-4 w-4 rounded text-brand-primary"
                />
                <span className="text-brand-charcoal/80">上架中</span>
              </label>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal}>
                  取消
                </Button>
                <Button type="submit" loading={submitting} disabled={submitting}>
                  保存
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description={`确定要删除优惠券「${deleteTarget?.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />
    </div>
  );
}
