"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Gift,
  Users,
  Calendar,
  Trophy,
  Phone,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface LotteryEntry {
  id: string;
  phone: string;
  drawingDataUrl?: string;
  weight: number;
  bonusWeight: number;
  isWinner: boolean;
  createdAt: string;
}

interface LotteryActivity {
  id: string;
  name: string;
  prizeName: string;
  prizeImage?: string;
  prizeQuantity: number;
  status: string;
  drawTime: string;
  entryCount: number;
  winnerCount: number;
  entries: LotteryEntry[];
  winners: LotteryEntry[];
}

const STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  pending: { label: "待开始", variant: "default" },
  active: { label: "进行中", variant: "success" },
  drawing: { label: "开奖中", variant: "warning" },
  ended: { label: "已结束", variant: "default" },
};

export default function LotteryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();

  const [activity, setActivity] = useState<LotteryActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<{ winners: LotteryEntry[] } | null>(null);

  // 检查是否有 action=draw 参数
  useEffect(() => {
    if (searchParams.get("action") === "draw" && activity?.status === "active") {
      setShowDrawConfirm(true);
    }
  }, [searchParams, activity?.status]);

  // 获取活动详情
  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/lottery/${params.id}`);
      const data = await res.json();

      if (data.success) {
        setActivity(data.data);
      } else {
        showError(data.error?.message || "获取活动详情失败");
        router.push("/admin/lottery");
      }
    } catch {
      showError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [params.id, router, showError]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // 执行开奖
  const handleDraw = async () => {
    if (!activity) return;

    setDrawing(true);
    try {
      const res = await fetch(`/api/admin/lottery/${activity.id}/draw`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setDrawResult(data.data);
        success(`开奖成功！共 ${data.data.winners.length} 人中奖`);
        fetchActivity(); // 刷新数据
      } else {
        showError(data.error?.message || "开奖失败");
      }
    } catch {
      showError("网络错误");
    } finally {
      setDrawing(false);
      setShowDrawConfirm(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  // 脱敏手机号
  const maskPhone = (phone: string) => {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-400">
        <AlertCircle className="mb-2 h-12 w-12" />
        <p>活动不存在</p>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[activity.status] || STATUS_LABELS.pending;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <Link href="/admin/lottery">
          <button className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{activity.name}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">创建于 {formatDate(activity.createdAt)}</p>
        </div>
        {activity.status === "active" && (
          <Button onClick={() => setShowDrawConfirm(true)} leftIcon={<Trophy className="h-4 w-4" />}>
            立即开奖
          </Button>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-pink-100 p-2">
              <Users className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">参与人数</p>
              <p className="text-2xl font-bold text-gray-900">{activity.entryCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Trophy className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">中奖人数</p>
              <p className="text-2xl font-bold text-gray-900">{activity.winnerCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Gift className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">奖品</p>
              <p className="text-lg font-bold text-gray-900 truncate">{activity.prizeName}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <Calendar className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">开奖时间</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(activity.drawTime)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 中奖者列表 */}
      {activity.winners && activity.winners.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Trophy className="h-5 w-5 text-yellow-500" />
            中奖名单
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activity.winners.map((winner) => (
              <div key={winner.id} className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                {winner.drawingDataUrl && (
                  <img src={winner.drawingDataUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-medium text-gray-900">{maskPhone(winner.phone)}</span>
                  </div>
                  <p className="text-xs text-gray-500">权重: {winner.weight + winner.bonusWeight}</p>
                </div>
                <CheckCircle className="ml-auto h-5 w-5 text-green-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 开奖结果弹窗 */}
      {drawResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-gray-900">开奖成功！</h3>
              <p className="mt-2 text-gray-600">共 {drawResult.winners.length} 人中奖</p>
            </div>
            <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
              {drawResult.winners.map((winner, idx) => (
                <div key={winner.id} className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
                  <span className="text-lg font-bold text-green-600">#{idx + 1}</span>
                  <span className="font-medium">{maskPhone(winner.phone)}</span>
                </div>
              ))}
            </div>
            <Button onClick={() => setDrawResult(null)} className="mt-6 w-full">
              确定
            </Button>
          </div>
        </div>
      )}

      {/* 参与者列表 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">参与者列表</h2>
        {activity.entries && activity.entries.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {activity.entries.slice(0, 50).map((entry) => (
              <div key={entry.id} className={`relative rounded-lg border p-2 ${entry.isWinner ? "border-green-300 bg-green-50" : "border-gray-100"}`}>
                {entry.drawingDataUrl && (
                  <img src={entry.drawingDataUrl} alt="" className="h-16 w-full rounded object-cover" />
                )}
                <div className="mt-2 text-center">
                  <p className="text-xs text-gray-600">{maskPhone(entry.phone)}</p>
                  <p className="text-xs text-gray-400">权重 {entry.weight + entry.bonusWeight}</p>
                </div>
                {entry.isWinner && (
                  <div className="absolute -top-2 -right-2">
                    <span className="text-lg">🏆</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">暂无参与者</p>
        )}
        {activity.entries && activity.entries.length > 50 && (
          <p className="mt-4 text-center text-sm text-gray-400">仅显示前 50 位参与者</p>
        )}
      </div>

      {/* 开奖确认对话框 */}
      <ConfirmDialog
        open={showDrawConfirm}
        onClose={() => setShowDrawConfirm(false)}
        onConfirm={handleDraw}
        title="确认开奖"
        description={`确定要对「${activity.name}」进行开奖吗？将从 ${activity.entryCount} 位参与者中抽取 ${activity.prizeQuantity} 位中奖者。`}
        confirmText={drawing ? "开奖中..." : "确认开奖"}
        loading={drawing}
      />
    </div>
  );
}

