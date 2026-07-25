"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";

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
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "admin" as "owner" | "admin",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ admins: AdminItem[]; pagination: typeof pagination }>(
        "/api/admin/admins",
        { page, search }
      );
      setAdmins(data.admins);
      setPagination(data.pagination);
    } catch {
      console.error("获取管理员失败");
      error("加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

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
    setForm({
      email: admin.email,
      name: admin.name,
      password: "",
      role: admin.role as "owner" | "admin",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editing || form.password) {
      const strength = validatePasswordStrength(form.password);
      if (!strength.valid) {
        error(strength.message || "密码格式不符合要求");
        return;
      }
    }

    setSubmitting(true);
    try {
      const body = editing ? { id: editing.id, ...form } : form;
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/admins/${deleteTarget.id}`);
      fetchAdmins();
      success("删除成功");
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">管理员管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理后台管理员账号</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={fetchAdmins}>
            刷新
          </Button>
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            新增管理员
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
          <Input
            placeholder="搜索邮箱/姓名..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="pl-10"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">姓名</th>
              <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">邮箱</th>
              <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">角色</th>
              <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">创建时间</th>
              <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-charcoal/[0.06]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-brand-charcoal/50">暂无管理员</span>
                    <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                      新增管理员
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} className="transition-colors hover:bg-brand-charcoal/[0.02]">
                  <td className="px-5 py-3.5 font-medium text-brand-charcoal">{admin.name}</td>
                  <td className="px-5 py-3.5 text-brand-charcoal/80">{admin.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={admin.role === "owner" ? "warning" : "default"}>
                      {admin.role === "owner" ? "最高权限" : "管理员"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-brand-charcoal/50">
                    {new Date(admin.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(admin)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(admin)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex justify-center">
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={(p) => updateParams({ page: String(p) })}
        />
      </div>

      {/* 弹窗 */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "编辑管理员" : "新增管理员"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="姓名"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="邮箱"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={`密码${editing ? "（留空则不修改）" : ""}`}
            type="password"
            required={!editing}
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label="角色"
            options={[
              { value: "admin", label: "管理员" },
              { value: "owner", label: "最高权限管理员" },
            ]}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "owner" | "admin" })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
              取消
            </Button>
            <Button type="submit" size="sm" loading={submitting} disabled={submitting}>
              保存
            </Button>
          </div>
        </form>
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除管理员"
        description={`确定要删除管理员「${deleteTarget?.name}」吗？此操作不可撤销。`}
        type="danger"
        confirmText="删除"
        loading={deleting}
      />
    </div>
  );
}
