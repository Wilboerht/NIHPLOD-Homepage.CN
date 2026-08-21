"use client";

/**
 * 会员管理后台页面
 * 等级体系（2026-08 重构）：普通 / 高级 / VIP / SVIP，按历史购买金额划定
 */
import { useEffect, useState, useCallback } from "react";
import { Crown, Users, Coins, Save, RefreshCw, Gift, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

interface LevelStat {
  level: string;
  count: number;
}

interface VIPStats {
  totalUsers: number;
  totalPoints: number;
  levels: LevelStat[];
}

interface BenefitItem {
  icon: string;
  title: string;
  desc: string;
}

interface MembershipBenefit {
  id: string | null; // null = 数据库尚未创建，保存时由后端 upsert 自动创建
  level: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  minSpent: number;
  maxSpent: number | null;
  benefits: BenefitItem[];
  colorClass: string | null;
}

interface PointCampaign {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  multiplier: number;
  active: boolean;
}

interface CampaignForm {
  id?: string;
  name: string;
  startAt: string;
  endAt: string;
  multiplier: number;
  active: boolean;
}

const LEVEL_LABELS: Record<string, string> = {
  REGULAR: "普通会员",
  ADVANCED: "高级会员",
  VIP: "VIP 会员",
  SVIP: "SVIP 会员",
};

const LEVEL_COLORS: Record<string, string> = {
  REGULAR: "bg-slate-100 text-slate-600",
  ADVANCED: "bg-teal-100 text-teal-700",
  VIP: "bg-amber-100 text-amber-700",
  SVIP: "bg-violet-100 text-violet-700",
};

const LEVEL_ICON_COLORS: Record<string, string> = {
  REGULAR: "text-slate-400",
  ADVANCED: "text-teal-500",
  VIP: "text-amber-500",
  SVIP: "text-violet-500",
};

/** 格式化时间为 datetime-local 输入框值 */
function toLocalInput(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminVIPPage() {
  const [stats, setStats] = useState<VIPStats | null>(null);
  const [benefits, setBenefits] = useState<MembershipBenefit[]>([]);
  const [campaigns, setCampaigns] = useState<PointCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBenefit, setEditBenefit] = useState<MembershipBenefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", points: 0, note: "" });
  const [adjusting, setAdjusting] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm | null>(null);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const { success, error: showError } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vipData, campaignData] = await Promise.all([
        apiGet<{ stats: VIPStats; benefits: MembershipBenefit[] }>("/api/admin/vip"),
        apiGet<{ campaigns: PointCampaign[] }>("/api/admin/vip/campaigns"),
      ]);
      setStats(vipData.stats);
      setBenefits(vipData.benefits);
      setCampaigns(campaignData.campaigns);
    } catch {
      showError("加载失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchData);
  }, [fetchData]);

  const handleSaveBenefit = async () => {
    if (!editBenefit) return;
    setSaving(true);
    try {
      await apiPut("/api/admin/vip", {
        level: editBenefit.level,
        name: editBenefit.name,
        nameEn: editBenefit.nameEn,
        icon: editBenefit.icon,
        minSpent: editBenefit.minSpent,
        maxSpent: editBenefit.maxSpent,
        benefits: editBenefit.benefits,
        colorClass: editBenefit.colorClass,
      });
      success("保存成功");
      setEditBenefit(null);
      fetchData();
    } catch {
      showError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustPoints = async () => {
    if (!adjustForm.userId || !adjustForm.points || !adjustForm.note) {
      showError("请填写完整信息");
      return;
    }
    setAdjusting(true);
    try {
      await apiPost("/api/admin/vip", adjustForm);
      success("积分调整成功");
      setShowAdjustModal(false);
      setAdjustForm({ userId: "", points: 0, note: "" });
      fetchData();
    } catch {
      showError("调整失败");
    } finally {
      setAdjusting(false);
    }
  };

  const openNewCampaign = () => {
    setCampaignForm({
      name: "",
      startAt: "",
      endAt: "",
      multiplier: 2,
      active: true,
    });
  };

  const openEditCampaign = (c: PointCampaign) => {
    setCampaignForm({
      id: c.id,
      name: c.name,
      startAt: toLocalInput(c.startAt),
      endAt: toLocalInput(c.endAt),
      multiplier: c.multiplier,
      active: c.active,
    });
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm) return;
    if (!campaignForm.name || !campaignForm.startAt || !campaignForm.endAt) {
      showError("请填写完整信息");
      return;
    }
    setCampaignSaving(true);
    try {
      const payload = {
        name: campaignForm.name,
        startAt: new Date(campaignForm.startAt).toISOString(),
        endAt: new Date(campaignForm.endAt).toISOString(),
        multiplier: campaignForm.multiplier,
        active: campaignForm.active,
      };
      if (campaignForm.id) {
        await apiPut("/api/admin/vip/campaigns", { id: campaignForm.id, ...payload });
      } else {
        await apiPost("/api/admin/vip/campaigns", payload);
      }
      success("保存成功");
      setCampaignForm(null);
      fetchData();
    } catch {
      showError("保存失败");
    } finally {
      setCampaignSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await apiDelete(`/api/admin/vip/campaigns?id=${id}`);
      success("已删除");
      fetchData();
    } catch {
      showError("删除失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide text-gray-800">会员管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAdjustModal(true)}>
            <Coins className="mr-1.5 h-4 w-4" />
            调整积分
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">会员总数</p>
                <p className="text-xl font-semibold text-gray-800">{stats.totalUsers}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2">
                <Coins className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">总积分</p>
                <p className="text-xl font-semibold text-gray-800">
                  {stats.totalPoints.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          {stats.levels.map((l) => (
            <div key={l.level} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gray-50 p-2">
                  <Crown className={`h-5 w-5 ${LEVEL_ICON_COLORS[l.level] ?? "text-slate-400"}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{LEVEL_LABELS[l.level] ?? l.level}</p>
                  <p className="text-xl font-semibold text-gray-800">{l.count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 等级权益配置 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-medium text-gray-800">等级权益配置</h2>
          <p className="mt-1 text-xs text-gray-500">
            等级按历史购买金额划定：普通(注册) / 高级(消费≥1) / VIP(≥¥5,000) / SVIP(≥¥20,000)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">等级</th>
                <th className="px-6 py-3 font-medium">名称</th>
                <th className="px-6 py-3 font-medium">消费门槛 (元)</th>
                <th className="px-6 py-3 font-medium">权益数量</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {benefits.length > 0 ? (
                benefits.map((b) => (
                  <tr key={b.level} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Badge className={LEVEL_COLORS[b.level] ?? "bg-gray-100"}>
                        {LEVEL_LABELS[b.level] ?? b.level}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{b.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {b.minSpent.toLocaleString()} ~ {b.maxSpent?.toLocaleString() ?? "∞"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(b.benefits as BenefitItem[])?.length ?? 0} 项
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditBenefit({ ...b, benefits: (b.benefits as BenefitItem[]) ?? [] })
                        }
                      >
                        编辑
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                    暂无配置，系统使用默认值
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 积分活动配置 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-gray-800">积分活动</h2>
            <p className="mt-1 text-xs text-gray-500">
              活动期间下单积分按倍数发放（与生日 3 倍取最大值，不叠加）
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openNewCampaign}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建活动
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">活动名称</th>
                <th className="px-6 py-3 font-medium">时间区间</th>
                <th className="px-6 py-3 font-medium">积分倍数</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.length > 0 ? (
                campaigns.map((c) => {
                  const now = new Date();
                  const started = new Date(c.startAt) <= now;
                  const ended = new Date(c.endAt) < now;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-700">{c.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {toLocalInput(c.startAt).replace("T", " ")} ~{" "}
                        {toLocalInput(c.endAt).replace("T", " ")}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">x{c.multiplier}</td>
                      <td className="px-6 py-4">
                        {!c.active ? (
                          <Badge className="bg-gray-100 text-gray-500">已停用</Badge>
                        ) : ended ? (
                          <Badge className="bg-gray-100 text-gray-500">已结束</Badge>
                        ) : started ? (
                          <Badge className="bg-green-100 text-green-700">进行中</Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700">未开始</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditCampaign(c)}>
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCampaign(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                    <Gift className="mx-auto mb-2 h-5 w-5" />
                    暂无积分活动
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 编辑权益弹窗 */}
      {editBenefit && (
        <Modal open={!!editBenefit} onClose={() => setEditBenefit(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-medium">
              编辑 {LEVEL_LABELS[editBenefit.level] ?? editBenefit.level}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">等级名称</label>
                <Input
                  value={editBenefit.name}
                  onChange={(e) => setEditBenefit({ ...editBenefit, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">最低消费 (元)</label>
                  <Input
                    type="number"
                    value={editBenefit.minSpent}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setEditBenefit({ ...editBenefit, minSpent: Number.isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">最高消费 (空=无限)</label>
                  <Input
                    type="number"
                    value={editBenefit.maxSpent ?? ""}
                    onChange={(e) =>
                      setEditBenefit({
                        ...editBenefit,
                        maxSpent: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {`权益列表 (JSON格式: [{"icon":"🎁","title":"...","desc":"..."}])`}
                </label>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={6}
                  value={JSON.stringify(editBenefit.benefits, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setEditBenefit({ ...editBenefit, benefits: parsed });
                      setJsonError("");
                    } catch {
                      setJsonError("JSON 格式错误，请检查语法");
                    }
                  }}
                />
                {jsonError && <p className="mt-1 text-xs text-red-500">{jsonError}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditBenefit(null)}>
                取消
              </Button>
              <Button onClick={handleSaveBenefit} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 新建/编辑积分活动弹窗 */}
      {campaignForm && (
        <Modal open={!!campaignForm} onClose={() => setCampaignForm(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-medium">
              {campaignForm.id ? "编辑积分活动" : "新建积分活动"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">活动名称</label>
                <Input
                  placeholder="如：618 大促 2 倍积分"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">开始时间</label>
                  <Input
                    type="datetime-local"
                    value={campaignForm.startAt}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, startAt: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">结束时间</label>
                  <Input
                    type="datetime-local"
                    value={campaignForm.endAt}
                    onChange={(e) => setCampaignForm({ ...campaignForm, endAt: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">积分倍数 (2-10)</label>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={campaignForm.multiplier}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setCampaignForm({ ...campaignForm, multiplier: Number.isNaN(val) ? 2 : val });
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={campaignForm.active}
                  onChange={(e) =>
                    setCampaignForm({ ...campaignForm, active: e.target.checked })
                  }
                />
                启用该活动
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCampaignForm(null)}>
                取消
              </Button>
              <Button onClick={handleSaveCampaign} disabled={campaignSaving}>
                <Save className="mr-1.5 h-4 w-4" />
                {campaignSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 调整积分弹窗 */}
      {showAdjustModal && (
        <Modal open={showAdjustModal} onClose={() => setShowAdjustModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-medium">手动调整积分</h2>
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              手动调分仅调整积分，不会影响会员等级（等级只随累计消费金额变动）
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">用户 ID</label>
                <Input
                  placeholder="输入用户 CUID"
                  value={adjustForm.userId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, userId: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  积分变动 (正数增加，负数扣减)
                </label>
                <Input
                  type="number"
                  placeholder="如: 100 或 -50"
                  value={adjustForm.points}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setAdjustForm({ ...adjustForm, points: Number.isNaN(val) ? 0 : val });
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">调整原因</label>
                <Input
                  placeholder="如：活动奖励 / 售后补偿"
                  value={adjustForm.note}
                  onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAdjustModal(false)}>
                取消
              </Button>
              <Button onClick={handleAdjustPoints} disabled={adjusting}>
                {adjusting ? "处理中..." : "确认调整"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
