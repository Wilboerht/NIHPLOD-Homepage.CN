"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, Pencil, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";
import { RequirePermission } from "@/components/admin";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  ADMIN_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_TEMPLATES,
  buildPermissionOverrides,
  resolveAdminPermissions,
  type AdminPermission,
  type AdminRoleValue,
} from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
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
  const {
    id: currentAdminId,
    role: myRole,
    permissions: myPermissions,
    can: canAdmin,
  } = useAdminPermissions();
  const canManage = canAdmin("admins:write");
  const isOwnerActor = myRole === "owner";
  // 委派边界（与服务端一致）：非 owner 只能分配模板不超出自身权限的角色
  const assignableRoles = ADMIN_ROLES.filter(
    (role) =>
      role !== "owner" &&
      (ROLE_TEMPLATES[role as Exclude<AdminRoleValue, "owner">] ?? []).every((p) =>
        myPermissions.has(p)
      )
  );
  const canGrantPermission = (permission: string) =>
    isOwnerActor || myPermissions.has(permission);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "admin" as AdminRoleValue,
  });
  // 权限编辑器勾选状态（含个人覆盖后的有效权限）
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const isEditingSelf = !!editing && editing.id === currentAdminId;
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

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
    deferInEffect(fetchAdmins);
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
    setSelectedPermissions(new Set(resolveAdminPermissions("admin")));
    setShowModal(true);
  };

  const openEdit = (admin: AdminItem) => {
    setEditing(admin);
    setForm({
      email: admin.email,
      name: admin.name,
      password: "",
      role: admin.role as AdminRoleValue,
    });
    setSelectedPermissions(new Set(resolveAdminPermissions(admin.role, admin.permissions)));
    setShowModal(true);
  };

  /** 角色变化时重置为模板默认权限（owner 恒为全部） */
  const handleRoleChange = (role: AdminRoleValue) => {
    setForm((prev) => ({ ...prev, role }));
    setSelectedPermissions(new Set(resolveAdminPermissions(role)));
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
      // 权限覆盖：相对角色模板的差异（追加授权 / "!权限点" 撤销）
      const permissions = buildPermissionOverrides(
        form.role,
        Array.from(selectedPermissions)
      );
      const base = {
        email: form.email,
        name: form.name,
        role: form.role,
        permissions,
      };

      let body: Record<string, unknown>;
      if (editing) {
        body = {
          id: editing.id,
          ...base,
          ...(form.password ? { password: form.password } : {}),
        };
        // 自锁保护：后端禁止自改角色/权限/密码，本页同步不提交这些字段
        if (editing.id === currentAdminId) {
          delete body.role;
          delete body.permissions;
          delete body.password;
        }
      } else {
        body = { ...base, password: form.password };
      }

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

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const res = await apiPost<{ message: string }>("/api/admin/admins", {
        ids: Array.from(selectedIds),
        action: "delete",
      });
      success(res.message || `已删除 ${selectedIds.size} 名管理员`);
      setSelectedIds(new Set());
      setShowBatchDelete(false);
      fetchAdmins();
    } catch (err) {
      error(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setBatchDeleting(false);
    }
  };

  const isAllSelected = admins.length > 0 && selectedIds.size === admins.length;

  return (
    <RequirePermission permission="admins:read">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-brand-charcoal">管理员管理</h1>
            <p className="mt-1 text-sm text-brand-charcoal/50">管理后台管理员账号</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchAdmins}
            >
              刷新
            </Button>
            {canManage && (
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                新增管理员
              </Button>
            )}
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
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
          {canManage && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-charcoal/50">已选 {selectedIds.size} 项</span>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setShowBatchDelete(true)}
              >
                批量删除
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex rounded p-1.5 text-brand-charcoal/50 hover:text-brand-charcoal/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* 列表 */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                {canManage && (
                  <th scope="col" className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(admins.map((a) => a.id)));
                        else setSelectedIds(new Set());
                      }}
                      className="h-4 w-4 rounded border-brand-charcoal/20"
                      aria-label="全选"
                    />
                  </th>
                )}
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">
                  姓名
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">
                  邮箱
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">
                  角色
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">
                  创建时间
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/60">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-charcoal/[0.06]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={canManage ? 6 : 5} />
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-5 py-8">
                    <Empty
                      title="暂无管理员"
                      className="py-6"
                      action={
                        canManage ? (
                          <Button
                            size="sm"
                            leftIcon={<Plus className="h-4 w-4" />}
                            onClick={openCreate}
                          >
                            新增管理员
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="transition-colors hover:bg-brand-charcoal/[0.02]">
                    {canManage && (
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(admin.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(admin.id)) next.delete(admin.id);
                            else next.add(admin.id);
                            setSelectedIds(next);
                          }}
                          className="h-4 w-4 rounded border-brand-charcoal/20"
                          aria-label={`选择 ${admin.name}`}
                        />
                      </td>
                    )}
                    <td className="px-5 py-3.5 font-medium text-brand-charcoal">{admin.name}</td>
                    <td className="px-5 py-3.5 text-brand-charcoal/80">{admin.email}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={admin.role === "owner" ? "warning" : "default"}>
                          {ROLE_LABELS[admin.role as AdminRoleValue] ?? admin.role}
                        </Badge>
                        {admin.role !== "owner" && admin.permissions?.length > 0 && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                            已自定义
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-brand-charcoal/50">
                      {new Date(admin.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-5 py-3.5">
                      {canManage && (admin.role !== "owner" || isOwnerActor) ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(admin)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(admin)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-charcoal/40">只读</span>
                      )}
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
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                disabled={isEditingSelf}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <Select
                label="角色"
                options={(() => {
                  const roles: AdminRoleValue[] = isOwnerActor
                    ? [...ADMIN_ROLES]
                    : [...assignableRoles];
                  // 被编辑账号的既有角色若超出可委派范围，仍显示当前值（只能保留，不能新选）
                  if (!roles.includes(form.role)) roles.push(form.role);
                  return roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
                })()}
                value={form.role}
                disabled={isEditingSelf}
                onChange={(e) => handleRoleChange(e.target.value as AdminRoleValue)}
              />
            </div>

            {isEditingSelf && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                不能修改自己的角色、权限或密码（防自锁），请由其他超级管理员操作。
              </p>
            )}

            {/* 权限覆盖编辑器：勾选相对角色模板调整，保存为个人权限覆盖 */}
            {form.role !== "owner" && (
              <div className="rounded-lg border border-brand-charcoal/15 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-brand-charcoal">权限（个人覆盖）</p>
                    <p className="mt-0.5 text-xs text-brand-charcoal/50">
                      默认继承「{ROLE_LABELS[form.role]}」模板，可单独增减；保存时自动生成覆盖差异
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isEditingSelf}
                    onClick={() =>
                      setSelectedPermissions(new Set(resolveAdminPermissions(form.role)))
                    }
                  >
                    恢复模板默认
                  </Button>
                </div>
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.group}>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-brand-charcoal/40">
                        {group.group}
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {group.permissions.map((permission: AdminPermission) => {
                          const checked = selectedPermissions.has(permission);
                          return (
                            <label
                              key={permission}
                              className={cn(
                                "flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs",
                                isEditingSelf
                                  ? "cursor-not-allowed opacity-60"
                                  : "hover:bg-brand-charcoal/[0.04]"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={
                                  isEditingSelf || (!checked && !canGrantPermission(permission))
                                }
                                onChange={(e) => {
                                  const next = new Set(selectedPermissions);
                                  if (e.target.checked) next.add(permission);
                                  else next.delete(permission);
                                  setSelectedPermissions(next);
                                }}
                                className="mt-0.5"
                              />
                              <span className="text-brand-charcoal/70">
                                {PERMISSION_LABELS[permission]}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        {/* 批量删除确认 */}
        <ConfirmDialog
          open={showBatchDelete}
          onClose={() => setShowBatchDelete(false)}
          onConfirm={handleBatchDelete}
          title="批量删除管理员"
          description={`确定要删除选中的 ${selectedIds.size} 名管理员吗？此操作不可撤销。`}
          type="danger"
          confirmText="确认删除"
          loading={batchDeleting}
        />
      </div>
    </RequirePermission>
  );
}
