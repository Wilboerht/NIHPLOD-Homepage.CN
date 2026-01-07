"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Gift, Calendar, Users, Trophy, Eye, Trash2, Play, X, Loader2, ImageIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
/* eslint-disable @next/next/no-img-element */
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/admin/MediaPicker";

interface LotteryActivity {
  id: string;
  name: string;
  prizeName: string;
  prizeImage?: string;
  status: string;
  drawTime: string;
  winnerCount: number;
  entryCount: number;
  createdAt: string;
}

interface CreateFormData {
  name: string;
  prizeName: string;
  prizeImage: string;
  prizeQuantity: number;
  drawTime: string;
  description: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "default" | "danger" }> = {
  pending: { label: "待开始", variant: "default" },
  active: { label: "进行中", variant: "success" },
  drawing: { label: "开奖中", variant: "warning" },
  ended: { label: "已结束", variant: "default" },
};

const INITIAL_FORM: CreateFormData = {
  name: "",
  prizeName: "",
  prizeImage: "",
  prizeQuantity: 1,
  drawTime: "",
  description: "",
};

export default function AdminLotteryPage() {
  const { success, error: showError } = useToast();

  const [activities, setActivities] = useState<LotteryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LotteryActivity | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 创建弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [formData, setFormData] = useState<CreateFormData>(INITIAL_FORM);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // 获取活动列表
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/lottery?${params}`);
      const data = await res.json();

      if (data.success) {
        setActivities(data.data.items);
      }
    } catch (error) {
      console.error("获取活动列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // 删除活动
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/lottery/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除失败");

      success("活动已删除");
      setDeleteTarget(null);
      fetchActivities();
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 创建活动
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.prizeName || !formData.drawTime) {
      showError("请填写必填项");
      return;
    }

    setCreateLoading(true);
    try {
      const res = await fetch("/api/admin/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          drawTime: new Date(formData.drawTime).toISOString(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        success("活动创建成功");
        setShowCreateModal(false);
        setFormData(INITIAL_FORM);
        fetchActivities();
      } else {
        showError(data.error?.message || "创建失败");
      }
    } catch {
      showError("网络错误");
    } finally {
      setCreateLoading(false);
    }
  };

  // 关闭弹窗
  const handleCloseModal = () => {
    setShowCreateModal(false);
    setFormData(INITIAL_FORM);
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">🌸 抽奖活动管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理花园抽奖活动</p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
          创建活动
        </Button>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索活动..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
          />
        </div>
        <Select
          options={[
            { value: "all", label: "全部状态" },
            { value: "active", label: "进行中" },
            { value: "pending", label: "待开始" },
            { value: "ended", label: "已结束" },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-32"
        />
      </div>

      {/* 活动列表 */}
      <div className="rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Gift className="mb-2 h-12 w-12" />
            <p className="text-lg">暂无活动</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreateModal(true)}>
              创建第一个活动
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => {
              const statusInfo = STATUS_LABELS[activity.status] || STATUS_LABELS.pending;
              return (
                <div key={activity.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                  {/* 活动图标/图片 */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-100">
                    {activity.prizeImage ? (
                      <img src={activity.prizeImage} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <Gift className="h-6 w-6 text-pink-500" />
                    )}
                  </div>

                  {/* 活动信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/lottery/${activity.id}`}
                        className="font-medium text-gray-900 hover:text-brand-gold"
                      >
                        {activity.name}
                      </Link>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5" />
                        {activity.prizeName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {activity.entryCount} 人参与
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(activity.drawTime)}
                      </span>
                    </div>
                  </div>

                  {/* 中奖人数 */}
                  {activity.winnerCount > 0 && (
                    <div className="hidden text-sm md:block">
                      <span className="text-green-600 font-medium">{activity.winnerCount} 人中奖</span>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    <Link href={`/admin/lottery/${activity.id}`}>
                      <button className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="查看详情">
                        <Eye className="h-4 w-4" />
                      </button>
                    </Link>
                    {activity.status === "active" && (
                      <Link href={`/admin/lottery/${activity.id}?action=draw`}>
                        <button className="rounded p-2 text-green-500 hover:bg-green-50" title="立即开奖">
                          <Play className="h-4 w-4" />
                        </button>
                      </Link>
                    )}
                    {activity.status !== "ended" && (
                      <button
                        onClick={() => setDeleteTarget(activity)}
                        className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description={`确定要删除活动「${deleteTarget?.name}」吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />

      {/* 创建活动弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/50" onClick={handleCloseModal} />

          {/* 弹窗内容 */}
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">创建抽奖活动</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 表单 */}
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* 活动名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  活动名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：新年福利抽奖"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                />
              </div>

              {/* 奖品名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  奖品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.prizeName}
                  onChange={(e) => setFormData({ ...formData, prizeName: e.target.value })}
                  placeholder="如：高端护肤套装"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                />
              </div>

              {/* 奖品图片 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">奖品图片</label>
                <div className="flex items-center gap-4">
                  {formData.prizeImage ? (
                    <div className="relative h-20 w-20 rounded-lg overflow-hidden border border-gray-200">
                      <Image
                        src={formData.prizeImage}
                        alt="奖品图片"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, prizeImage: "" })}
                        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowMediaPicker(true)}
                      className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-gold hover:bg-gray-50 transition-colors"
                    >
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                      <span className="mt-1 text-xs text-gray-400">选择图片</span>
                    </button>
                  )}
                  {formData.prizeImage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMediaPicker(true)}
                    >
                      更换图片
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 中奖名额 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">中奖名额</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.prizeQuantity}
                    onChange={(e) => setFormData({ ...formData, prizeQuantity: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                {/* 开奖时间 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    开奖时间 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.drawTime}
                    onChange={(e) => setFormData({ ...formData, drawTime: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>
              </div>

              {/* 活动说明 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">活动说明</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="活动规则和说明..."
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold resize-none"
                />
              </div>

              {/* 按钮 */}
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={createLoading} className="flex-1">
                  {createLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  创建活动
                </Button>
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  取消
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 媒体选择器 */}
      <MediaPicker
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={(url) => {
          setFormData({ ...formData, prizeImage: url });
          setShowMediaPicker(false);
        }}
        title="选择奖品图片"
      />
    </div>
  );
}

