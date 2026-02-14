"use client";

/**
 * 用户管理页面
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, RefreshCw, Eye } from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { Button } from "@/components/ui/Button";

interface UserItem {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  orderCount: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), search });
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.users);
        setPagination(data.data.pagination);
      }
    } catch {
      console.error("获取用户失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/users?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">用户管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理注册用户</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers}>
          <RefreshCw className="h-4 w-4 mr-1" /> 刷新
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索手机号/昵称..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
          />
        </div>
      </div>

      {/* 用户列表 */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">手机号</th>
              <th className="px-4 py-3">订单数</th>
              <th className="px-4 py-3">注册时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无用户</td></tr>
            ) : users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        user.nickname?.charAt(0) || "U"
                      )}
                    </div>
                    <span>{user.nickname || "未设置"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">{user.phone || "-"}</td>
                <td className="px-4 py-3">{user.orderCount}</td>
                <td className="px-4 py-3 text-gray-400">{new Date(user.createdAt).toLocaleDateString("zh-CN")}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${user.id}`}>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => (
            <button
              key={i + 1}
              onClick={() => updateParams({ page: String(i + 1) })}
              className={`px-3 py-1 rounded ${page === i + 1 ? "bg-pink-500 text-white" : "bg-gray-100"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

