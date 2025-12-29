"use client";

/**
 * 用户详情页面
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, ShoppingBag, User, TrendingUp, TrendingDown, Gift, MessageSquare, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface UserDetail {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  points: number;
  totalPoints: number;
  createdAt: string;
  orders: { id: string; orderNo: string; status: string; payAmount: number; createdAt: string }[];
  pointRecords: { id: string; type: string; amount: number; description: string; createdAt: string }[];
  _count: { orders: number };
}

const POINTS_TYPE_MAP: Record<string, { label: string; icon: typeof Coins; color: string; bg: string }> = {
  REGISTER_BONUS: { label: "注册奖励", icon: Gift, color: "text-emerald-600", bg: "bg-emerald-100" },
  QUESTIONNAIRE_BONUS: { label: "问卷奖励", icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-100" },
  PURCHASE_REWARD: { label: "购买奖励", icon: ShoppingBag, color: "text-purple-600", bg: "bg-purple-100" },
  SHARE_REWARD: { label: "分享奖励", icon: TrendingUp, color: "text-cyan-600", bg: "bg-cyan-100" },
  AI_CHAT_CONSUME: { label: "AI追问消耗", icon: MessageSquare, color: "text-orange-600", bg: "bg-orange-100" },
  ADMIN_ADJUST: { label: "管理员调整", icon: Settings, color: "text-gray-600", bg: "bg-gray-100" },
};

export default function UserDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: 0, description: "" });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUser = () => {
    fetch(`/api/admin/users/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setUser(data.data.user);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUser(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdjust = async () => {
    if (!adjustForm.amount || !adjustForm.description) {
      alert("请填写完整信息");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adjustForm),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.data.message);
        setShowAdjustModal(false);
        setAdjustForm({ amount: 0, description: "" });
        fetchUser();
      } else {
        alert(data.error?.message || "操作失败");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-400">
        <User className="mb-2 h-12 w-12" />
        <p>用户不存在</p>
      </div>
    );
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("zh-CN");
  };

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 返回</Button>
          </Link>
          <h1 className="text-xl font-semibold">{user.nickname || user.phone || "用户详情"}</h1>
          <Badge variant="success">已注册</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdjustModal(true)}>
          <Coins className="h-4 w-4 mr-1" /> 调整积分
        </Button>
      </div>

      {/* 基本信息 + 统计 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">基本信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">昵称</dt><dd>{user.nickname || "未设置"}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">手机号</dt><dd>{user.phone || "未绑定"}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">注册时间</dt><dd>{formatDate(user.createdAt)}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">数据统计</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">积分余额</dt><dd className="font-medium text-amber-600">{user.points}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">累计积分</dt><dd>{user.totalPoints}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">订单数量</dt><dd>{user._count?.orders ?? 0}</dd></div>
          </dl>
        </div>
      </div>

      {/* 积分记录 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium">积分记录</h2>
        {!user.pointRecords || user.pointRecords.length === 0 ? (
          <p className="text-center text-gray-400 py-4 text-sm">暂无积分记录</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-left text-gray-500">
              <tr>
                <th className="pb-2 font-normal">类型</th>
                <th className="pb-2 font-normal">描述</th>
                <th className="pb-2 font-normal">变动</th>
                <th className="pb-2 font-normal">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {user.pointRecords.map((record) => {
                const typeInfo = POINTS_TYPE_MAP[record.type] || { label: record.type };
                const isPositive = record.amount > 0;
                return (
                  <tr key={record.id}>
                    <td className="py-2">{typeInfo.label}</td>
                    <td className="py-2 text-gray-500">{record.description}</td>
                    <td className={`py-2 ${isPositive ? "text-green-600" : "text-red-500"}`}>
                      {isPositive ? "+" : ""}{record.amount}
                    </td>
                    <td className="py-2 text-gray-400">{formatDate(record.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 调整积分弹窗 */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="mb-4 text-lg font-medium">调整积分</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">调整数量</label>
                <div className="relative">
                  <input
                    type="number"
                    value={adjustForm.amount || ""}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, amount: parseInt(e.target.value) || 0 }))}
                    placeholder="正数增加，负数扣减"
                    className="w-full rounded-lg border p-2"
                  />
                  {adjustForm.amount !== 0 && (
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                      adjustForm.amount > 0 ? "text-green-500" : "text-red-500"
                    }`}>
                      {adjustForm.amount > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">调整原因</label>
                <input
                  type="text"
                  value={adjustForm.description}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="请输入调整原因"
                  className="w-full rounded-lg border p-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdjustModal(false)}>取消</Button>
              <Button onClick={handleAdjust} disabled={actionLoading || !adjustForm.amount || !adjustForm.description}>
                {actionLoading ? "处理中..." : "确认调整"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

