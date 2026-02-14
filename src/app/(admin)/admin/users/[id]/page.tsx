"use client";

/**
 * 用户详情页面
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface UserDetail {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
  orders: { id: string; orderNo: string; status: string; payAmount: number; createdAt: string }[];
  _count: { orders: number };
}

export default function UserDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = () => {
    fetch(`/api/admin/users/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setUser(data.data.user);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUser(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="flex justify-between"><dt className="text-gray-500">订单数量</dt><dd>{user._count?.orders ?? 0}</dd></div>
          </dl>
        </div>
      </div>

      {/* 最近订单 */}
      {user.orders && user.orders.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">最近订单</h2>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-gray-500">
              <tr>
                <th className="pb-2 font-normal">订单号</th>
                <th className="pb-2 font-normal">状态</th>
                <th className="pb-2 font-normal">金额</th>
                <th className="pb-2 font-normal">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {user.orders.map((order) => (
                <tr key={order.id}>
                  <td className="py-2">{order.orderNo}</td>
                  <td className="py-2">{order.status}</td>
                  <td className="py-2">¥{order.payAmount}</td>
                  <td className="py-2 text-gray-400">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

