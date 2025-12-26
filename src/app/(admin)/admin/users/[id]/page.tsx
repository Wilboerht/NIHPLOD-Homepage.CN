"use client";

/**
 * 用户详情页面
 */
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface UserDetail {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  points: number;
  createdAt: string;
  orders: { id: string; orderNo: string; status: string; payableAmount: number; createdAt: string }[];
  pointsHistory: { id: string; type: string; amount: number; description: string; createdAt: string }[];
  _count: { orders: number };
}

const POINTS_TYPE_MAP: Record<string, string> = {
  REGISTER_BONUS: "注册奖励",
  PURCHASE_REWARD: "购买奖励",
  AI_CHAT_CONSUME: "AI追问消耗",
  ADMIN_ADJUST: "管理员调整",
};

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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

  if (loading) return <div className="p-8 text-center text-gray-400">加载中...</div>;
  if (!user) return <div className="p-8 text-center text-gray-400">用户不存在</div>;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 返回</Button>
          </Link>
          <h1 className="text-xl font-semibold">{user.nickname || user.phone || "用户详情"}</h1>
        </div>
        <Button onClick={() => setShowAdjustModal(true)}>
          <Coins className="h-4 w-4 mr-1" /> 调整积分
        </Button>
      </div>

      {/* 用户信息 */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center text-3xl text-gray-400">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              user.nickname?.charAt(0) || "U"
            )}
          </div>
          <h2 className="font-medium">{user.nickname || "未设置昵称"}</h2>
          <p className="text-sm text-gray-500">{user.phone || "未绑定手机"}</p>
          <p className="mt-2 text-xs text-gray-400">注册于 {new Date(user.createdAt).toLocaleDateString("zh-CN")}</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-amber-500 mb-2">
            <Coins className="h-5 w-5" />
            <span className="text-sm text-gray-500">积分余额</span>
          </div>
          <p className="text-3xl font-bold text-amber-500">{user.points}</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-pink-500 mb-2">
            <ShoppingBag className="h-5 w-5" />
            <span className="text-sm text-gray-500">订单数量</span>
          </div>
          <p className="text-3xl font-bold text-pink-500">{user._count.orders}</p>
        </div>
      </div>

      {/* 积分记录 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium">积分记录</h2>
        {user.pointsHistory.length === 0 ? (
          <p className="text-center text-gray-400 py-4">暂无记录</p>
        ) : (
          <div className="space-y-3">
            {user.pointsHistory.map((record) => (
              <div key={record.id} className="flex items-center justify-between border-b pb-2">
                <div>
                  <span className="font-medium">{POINTS_TYPE_MAP[record.type] || record.type}</span>
                  <p className="text-sm text-gray-500">{record.description}</p>
                </div>
                <span className={`font-medium ${record.amount > 0 ? "text-green-500" : "text-red-500"}`}>
                  {record.amount > 0 ? "+" : ""}{record.amount}
                </span>
              </div>
            ))}
          </div>
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
                <input
                  type="number"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: parseInt(e.target.value) || 0 }))}
                  placeholder="正数增加，负数扣减"
                  className="w-full rounded-lg border p-2"
                />
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
              <Button onClick={handleAdjust} disabled={actionLoading}>
                {actionLoading ? "处理中..." : "确认调整"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

