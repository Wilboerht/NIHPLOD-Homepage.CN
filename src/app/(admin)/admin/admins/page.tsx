"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, Pencil, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminAdminsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error } = useToast();

  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "admin" as "owner" | "admin" });
  const [submitting, setSubmitting] = useState(false);

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ admins: AdminItem[]; pagination: typeof pagination }>("/api/admin/admins", { page, search });
      setAdmins(data.admins);
      setPagination(data.pagination);
    } catch {
      console.error("获取管理员失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/admins?${params.toString()}`);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ email: "", name: "", password: "", role: "admin" });
    setShowModal(true);
  };

  const openEdit = (admin: AdminItem) => {
    setEditing(admin);
    setForm({ email: admin.email, name: admin.name, password: "", role: admin.role as "owner" | "admin" });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = editing
        ? { id: editing.id, ...form }
        : form;
      if (editing && !form.password) delete (body as Record<string, unknown>).password;

      if (editing) {
        await apiPut("/api/admin/admins", body);
      } else {
        await apiPost("/api/admin/admins", body);
      }
      setShowModal(false);
      fetchAdmins();
      success(editing ? "更新成功" : "创建成功");
    } catch (err) {
      error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该管理员吗？此操作不可撤销。")) return;
    try {
      await apiDelete(`/api/admin/admins/${id}`);
      fetchAdmins();
      success("删除成功");
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">管理员管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理后台管理员账号</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAdmins}>
            <RefreshCw className="h-4 w-4 mr-1" /> 刷新
          </Button>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 新增管理员
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索邮箱/姓名..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无管理员</td></tr>
            ) : admins.map((admin) => (
              <tr key={admin.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{admin.name}</td>
                <td className="px-4 py-3">{admin.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${admin.role === "owner" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-600"}`}>
                    {admin.role === "owner" ? "最高权限管理员" : "管理员"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(admin.createdAt).toLocaleDateString("zh-CN")}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(admin)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(admin.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
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

      {/* 弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? "编辑管理员" : "新增管理员"}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">姓名</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">邮箱</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  密码 {editing && "（留空则不修改）"}
                </label>
                <input
                  type="password"
                  required={!editing}
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">角色</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "owner" | "admin" })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="admin">管理员</option>
                  <option value="owner">最高权限管理员</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  取消
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={submitting}>
                  {submitting ? "保存中..." : "保存"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
