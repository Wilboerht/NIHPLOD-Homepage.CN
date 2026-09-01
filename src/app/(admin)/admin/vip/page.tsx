"use client";

/**
 * 会员管理后台页面
 * 等级体系（2026-09 简化）：普通会员(注册) / 高级会员(消费满 ¥1,000)
 */
import { useEffect, useState, useCallback } from "react";
import { Crown, Users, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPut } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

interface LevelStat {
  level: string;
  count: number;
}

interface VIPStats {
  totalUsers: number;
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

const LEVEL_LABELS: Record<string, string> = {
  REGULAR: "普通会员",
  ADVANCED: "高级会员",
};

const LEVEL_COLORS: Record<string, string> = {
  REGULAR: "bg-slate-100 text-slate-600",
  ADVANCED: "bg-teal-100 text-teal-700",
};

const LEVEL_ICON_COLORS: Record<string, string> = {
  REGULAR: "text-slate-400",
  ADVANCED: "text-teal-500",
};

export default function AdminVIPPage() {
  const [stats, setStats] = useState<VIPStats | null>(null);
  const [benefits, setBenefits] = useState<MembershipBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBenefit, setEditBenefit] = useState<MembershipBenefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const { success, error: showError } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const vipData = await apiGet<{ stats: VIPStats; benefits: MembershipBenefit[] }>(
        "/api/admin/vip"
      );
      setStats(vipData.stats);
      setBenefits(vipData.benefits);
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
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            等级按历史购买金额划定：普通会员(注册) / 高级会员(消费满 ¥1,000)
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
                  {`权益列表 (JSON格式: [{"icon":"","title":"...","desc":"..."}])`}
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
    </div>
  );
}
