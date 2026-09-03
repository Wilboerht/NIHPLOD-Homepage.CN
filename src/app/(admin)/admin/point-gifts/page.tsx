"use client";

/**
 * 积分礼品与兑换履约后台页面
 * - 礼品管理：新增/编辑/上下架（仅超级管理员）
 * - 兑换记录：查看与履约标记
 */
import { useCallback, useEffect, useState } from "react";
import { Gift, PackageCheck, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

interface PointGiftItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  valueYuan: number;
  sort: number;
  active: boolean;
}

interface RedemptionItem {
  id: string;
  giftName: string;
  valueYuan: number;
  points: number;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
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

interface GiftForm {
  id: string | null;
  name: string;
  description: string;
  image: string;
  valueYuan: string;
  sort: string;
}

const EMPTY_FORM: GiftForm = { id: null, name: "", description: "", image: "", valueYuan: "", sort: "0" };

export default function AdminPointGiftsPage() {
  const { success, error: showError } = useToast();
  const [gifts, setGifts] = useState<PointGiftItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [redemptionLoading, setRedemptionLoading] = useState(false);
  const [tab, setTab] = useState<StatusTab>("PENDING");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [form, setForm] = useState<GiftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const fetchGifts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ gifts: PointGiftItem[] }>("/api/admin/point-gifts");
      setGifts(data.gifts);
    } catch {
      showError("加载礼品失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

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
    deferInEffect(fetchGifts);
    deferInEffect(fetchRedemptions);
  }, [fetchGifts, fetchRedemptions]);

  const openCreate = () => setForm(EMPTY_FORM);

  const openEdit = (g: PointGiftItem) =>
    setForm({
      id: g.id,
      name: g.name,
      description: g.description ?? "",
      image: g.image ?? "",
      valueYuan: String(g.valueYuan),
      sort: String(g.sort),
    });

  const handleSave = async () => {
    if (!form) return;
    const valueYuan = Number(form.valueYuan);
    if (!form.name.trim()) {
      showError("请填写礼品名称");
      return;
    }
    if (!Number.isInteger(valueYuan) || valueYuan <= 0) {
      showError("市场价值必须为正整数（元）");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        image: form.image.trim() || undefined,
        valueYuan,
        sort: Number(form.sort) || 0,
      };
      if (form.id) {
        await apiPatch("/api/admin/point-gifts", { id: form.id, ...payload });
      } else {
        await apiPost("/api/admin/point-gifts", payload);
      }
      success("保存成功");
      setForm(null);
      fetchGifts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (g: PointGiftItem) => {
    try {
      await apiPatch("/api/admin/point-gifts", { id: g.id, active: !g.active });
      success(g.active ? "已下架" : "已上架");
      fetchGifts();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "操作失败");
    }
  };

  const handleFulfill = async (r: RedemptionItem) => {
    setFulfillingId(r.id);
    try {
      await apiPost(`/api/admin/point-redemptions/${r.id}/fulfill`);
      success("已标记履约");
      fetchRedemptions();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "履约失败");
    } finally {
      setFulfillingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-gray-800">积分礼品</h1>
          <p className="mt-1 text-xs text-gray-500">
            管理用户面板的积分兑换礼品目录，用户实际扣分 = 市场价值 ÷ 当前兑礼率（向下取整）
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchGifts(); fetchRedemptions(); }}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增礼品
          </Button>
        </div>
      </div>

      {/* 礼品管理 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-medium text-gray-800">
            <Gift className="h-5 w-5 text-gray-500" />
            礼品目录
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">名称</th>
                <th className="px-6 py-3 font-medium">市场价值</th>
                <th className="px-6 py-3 font-medium">排序</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : gifts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                    暂无礼品，点击右上角新增
                  </td>
                </tr>
              ) : (
                gifts.map((g) => (
                  <tr key={g.id} className={g.active ? "hover:bg-gray-50" : "opacity-50 hover:bg-gray-50"}>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{g.name}</p>
                      {g.description && (
                        <p className="mt-0.5 max-w-[320px] truncate text-xs text-gray-400">
                          {g.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ¥{g.valueYuan.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{g.sort}</td>
                    <td className="px-6 py-4">
                      <Badge className={g.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}>
                        {g.active ? "上架中" : "已下架"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleActive(g)}>
                          {g.active ? "下架" : "上架"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                <th className="px-6 py-3 font-medium">礼品</th>
                <th className="px-6 py-3 font-medium">价值 / 扣分</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {redemptionLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-300" />
                  </td>
                </tr>
              ) : redemptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
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
                    <td className="px-6 py-4 text-sm text-gray-700">{r.giftName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      ¥{r.valueYuan.toLocaleString()} / {r.points.toLocaleString()} 分
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(r.createdAt)}</td>
                    <td className="px-6 py-4">
                      {r.status === "PENDING" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={fulfillingId === r.id}
                          onClick={() => handleFulfill(r)}
                        >
                          {fulfillingId === r.id ? "处理中..." : "标记履约"}
                        </Button>
                      )}
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

      {/* 礼品编辑弹窗 */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "编辑礼品" : "新增礼品"}
      >
        {form && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">礼品名称</label>
              <Input
                value={form.name}
                maxLength={50}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：品牌帆布袋"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">描述（选填）</label>
              <Input
                value={form.description}
                maxLength={500}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="礼品说明"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">图片 URL（选填）</label>
              <Input
                value={form.image}
                maxLength={500}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">市场价值（元）</label>
                <Input
                  type="number"
                  min={1}
                  value={form.valueYuan}
                  onChange={(e) => setForm({ ...form, valueYuan: e.target.value })}
                  placeholder="如：300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">排序（越小越靠前）</label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort}
                  onChange={(e) => setForm({ ...form, sort: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              用户实际扣分 = 市场价值 ÷ 当前兑礼率（银 1:1 / 金 1:1.3 / 钻 1:1.5），向下取整。
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
