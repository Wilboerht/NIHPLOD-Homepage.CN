"use client";

/**
 * 会员管理后台页面
 */
import { useEffect, useState, useCallback } from "react";
import { Crown, Users, Coins, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
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
  id: string;
  level: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  minPoints: number;
  maxPoints: number | null;
  pointRate: number;
  benefits: BenefitItem[];
  colorClass: string | null;
}

const LEVEL_LABELS: Record<string, string> = {
  SILVER: "银卡会员",
  GOLD: "金卡会员",
  DIAMOND: "钻石会员",
};

const LEVEL_COLORS: Record<string, string> = {
  SILVER: "bg-slate-100 text-slate-600",
  GOLD: "bg-amber-100 text-amber-700",
  DIAMOND: "bg-violet-100 text-violet-700",
};

export default function AdminVIPPage() {
  const [stats, setStats] = useState<VIPStats | null>(null);
  const [benefits, setBenefits] = useState<MembershipBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBenefit, setEditBenefit] = useState<MembershipBenefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", points: 0, note: "" });
  const [adjusting, setAdjusting] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const { success, error: showError } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ stats: VIPStats; benefits: MembershipBenefit[] }>(
        "/api/admin/vip"
      );
      setStats(data.stats);
      setBenefits(data.benefits);
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
        minPoints: editBenefit.minPoints,
        maxPoints: editBenefit.maxPoints,
        pointRate: editBenefit.pointRate,
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
                  <Crown
                    className={`h-5 w-5 ${l.level === "GOLD" ? "text-amber-500" : l.level === "DIAMOND" ? "text-violet-500" : "text-slate-400"}`}
                  />
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-6 py-3 font-medium">等级</th>
                <th className="px-6 py-3 font-medium">名称</th>
                <th className="px-6 py-3 font-medium">积分区间</th>
                <th className="px-6 py-3 font-medium">积分倍率</th>
                <th className="px-6 py-3 font-medium">权益数量</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {benefits.length > 0 ? (
                benefits.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Badge className={LEVEL_COLORS[b.level] ?? "bg-gray-100"}>
                        {LEVEL_LABELS[b.level] ?? b.level}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{b.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {b.minPoints.toLocaleString()} ~ {b.maxPoints?.toLocaleString() ?? "∞"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">x{b.pointRate}</td>
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
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">
                    暂无配置，系统使用默认值
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
                  <label className="mb-1 block text-xs text-gray-500">最低积分</label>
                  <Input
                    type="number"
                    value={editBenefit.minPoints}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setEditBenefit({ ...editBenefit, minPoints: Number.isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">最高积分 (空=无限)</label>
                  <Input
                    type="number"
                    value={editBenefit.maxPoints ?? ""}
                    onChange={(e) =>
                      setEditBenefit({
                        ...editBenefit,
                        maxPoints: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">积分倍率</label>
                <Input
                  type="number"
                  value={editBenefit.pointRate}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setEditBenefit({ ...editBenefit, pointRate: Number.isNaN(val) ? 1 : val });
                  }}
                />
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

      {/* 调整积分弹窗 */}
      {showAdjustModal && (
        <Modal open={showAdjustModal} onClose={() => setShowAdjustModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-medium">手动调整积分</h2>
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
