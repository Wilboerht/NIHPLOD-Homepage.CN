"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, Pencil, Trash2, Plus, X, KeyRound, Copy } from "lucide-react";
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
import { MobileList, MobileListCard } from "@/components/admin/MobileList";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";
import { PasswordRulesChecklist } from "@/components/ui/PasswordRulesChecklist";
import { RequirePermission } from "@/components/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { BreakGlassButton } from "@/components/admin/BreakGlassButton";
import { ApprovalRequestAction } from "@/components/admin/ApprovalRequestAction";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useRowSelection } from "@/hooks/useRowSelection";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
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

function permissionKey(permissions: Iterable<string>) {
  return Array.from(permissions).sort().join("|");
}

function getAdvisorAccess(admin: AdminItem): {
  label: string;
  variant: "warning" | "success" | "secondary";
} {
  const permissions = resolveAdminPermissions(admin.role, admin.permissions);
  if (admin.role === "owner" || permissions.includes("advisor:admin")) {
    return { label: "超级管理员", variant: "warning" };
  }
  if (permissions.includes("advisor:access")) {
    return { label: "管理员", variant: "success" };
  }
  return { label: "无", variant: "secondary" };
}

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
  totpResetRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminAdminsPage() {
  return (
    <RequirePermission permission="admins:read">
      <AdminAdminsContent />
    </RequirePermission>
  );
}

function AdminAdminsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();

  /** 管理员账号/权限写操作：服务端要求 step-up，首次调用失败时拉起二次验证并重试 */
  const withStepUp = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
      if (!verified) return null;
      return await action();
    }
  };

  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const urlSearch = searchParams.get("search") || "";
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearchInput(urlSearch);
  }
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const {
    id: currentAdminId,
    role: myRole,
    permissions: myPermissions,
    can: canAdmin,
  } = useAdminPermissions();
  const canManage = canAdmin("admins:write");
  const canRequestApproval = canAdmin("approvals:request");
  const isOwnerActor = myRole === "owner";
  // 委派边界（与服务端一致）：非 owner 只能分配模板不超出自身权限的角色
  const assignableRoles = ADMIN_ROLES.filter(
    (role) =>
      role !== "owner" &&
      (ROLE_TEMPLATES[role as Exclude<AdminRoleValue, "owner">] ?? []).every((p) =>
        myPermissions.has(p)
      )
  );
  const canGrantPermission = (permission: string) => isOwnerActor || myPermissions.has(permission);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "admin" as AdminRoleValue,
  });
  // 权限编辑器勾选状态（含个人覆盖后的有效权限）
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [modalBaseline, setModalBaseline] = useState<{
    form: { email: string; name: string; password: string; role: AdminRoleValue };
    permissions: string;
  } | null>(null);
  const isModalDirty =
    showModal &&
    !!modalBaseline &&
    (JSON.stringify(form) !== JSON.stringify(modalBaseline.form) ||
      permissionKey(selectedPermissions) !== modalBaseline.permissions);
  const { confirmClose } = useUnsavedChanges(isModalDirty);
  const isEditingSelf = !!editing && editing.id === currentAdminId;
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recoveryTarget, setRecoveryTarget] = useState<AdminItem | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{
    code: string;
    expiresAt: string;
    targetEmail: string;
  } | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);

  const pageParam = Number(searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const search = searchParams.get("search") || "";
  // 勾选状态：翻页/搜索变化时自动清空
  const selection = useRowSelection<AdminItem>((admin) => admin.id, `${page}|${search}`);
  const { selectedIds } = selection;
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const takeLatestAdmins = useLatestRequest();
  const fetchAdmins = useCallback(async () => {
    const isLatest = takeLatestAdmins();
    setLoading(true);
    try {
      const data = await apiGet<{ admins: AdminItem[]; pagination: typeof pagination }>(
        "/api/admin/admins",
        { page, search }
      );
      if (!isLatest()) return;
      setAdmins(data.admins);
      setPagination(data.pagination);
      setLoadError(false);
    } catch (err) {
      if (!isLatest()) return;
      if (err instanceof ApiError && err.status === 401) {
        router.push("/admin-login?reauth=1");
        return;
      }
      setLoadError(true);
      error(err instanceof Error ? err.message : "加载失败，请刷新重试");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, search, error, router, takeLatestAdmins]);

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

  useEffect(() => {
    if (pagination.totalPages > 0 && page > pagination.totalPages) {
      updateParams({ page: String(pagination.totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pagination.totalPages]);

  const openCreate = () => {
    // 默认选中第一个「可委派」角色并按自身权限取交集，避免预填必然被服务端拒绝的权限组合
    const role = (assignableRoles[0] ?? "admin") as AdminRoleValue;
    const nextForm = { email: "", name: "", password: "", role };
    const nextPermissions = new Set(
      resolveAdminPermissions(role).filter((p) => canGrantPermission(p))
    );
    setEditing(null);
    setForm(nextForm);
    setSelectedPermissions(nextPermissions);
    setModalBaseline({ form: nextForm, permissions: permissionKey(nextPermissions) });
    setShowModal(true);
  };

  const openEdit = (admin: AdminItem) => {
    const nextForm = {
      email: admin.email,
      name: admin.name,
      password: "",
      role: admin.role as AdminRoleValue,
    };
    const nextPermissions = new Set(resolveAdminPermissions(admin.role, admin.permissions));
    setEditing(admin);
    setForm(nextForm);
    setSelectedPermissions(nextPermissions);
    setModalBaseline({ form: nextForm, permissions: permissionKey(nextPermissions) });
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
      const permissions = buildPermissionOverrides(form.role, Array.from(selectedPermissions));
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
          // 非 owner 自助编辑：服务端禁止任何 email 字段，未修改的 email 也要省略
          if (!isOwnerActor) delete body.email;
        } else if (!isOwnerActor) {
          // 非 owner 不能修改他人邮箱/密码（服务端强制），提交时省略避免误报 403
          delete body.email;
          delete body.password;
        }
      } else {
        body = { ...base, password: form.password };
      }

      const saved = await withStepUp(() =>
        editing ? apiPut("/api/admin/admins", body) : apiPost("/api/admin/admins", body)
      );
      if (saved === null) return;
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
      const result = await withStepUp(() => apiDelete(`/api/admin/admins/${deleteTarget.id}`));
      if (result === null) return;
      success("删除成功");
      setDeleteTarget(null);
      // 删除本页最后一条时回退一页
      if (admins.length === 1 && page > 1) {
        updateParams({ page: String(page - 1) });
      } else {
        await fetchAdmins();
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const openRecovery = (target: AdminItem) => {
    setRecoveryTarget(target);
    setRecoveryReason("");
    setRecoveryCode("");
    setRecoveryResult(null);
    setRecoverySaved(false);
  };

  const closeRecovery = () => {
    if (recoverySubmitting) return;
    setRecoveryTarget(null);
    setRecoveryResult(null);
    setRecoveryCode("");
    setRecoveryReason("");
    setRecoverySaved(false);
  };

  const handleIssueRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryTarget) return;
    if (recoveryReason.trim().length < 5) {
      error("请填写至少 5 个字符的恢复原因");
      return;
    }
    if (recoveryCode.trim().length < 6) {
      error("请输入你的 TOTP 验证码");
      return;
    }

    setRecoverySubmitting(true);
    try {
      const data = await apiPost<{
        code: string;
        expiresAt: string;
        targetEmail: string;
      }>(`/api/admin/admins/${recoveryTarget.id}/totp-recovery`, {
        reason: recoveryReason.trim(),
        totpCode: recoveryCode.trim(),
      });
      setRecoveryResult(data);
      setRecoverySaved(false);
      success("恢复码已生成");
    } catch (err) {
      error(err instanceof Error ? err.message : "签发恢复码失败");
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const copyRecoveryCode = async () => {
    if (!recoveryResult) return;
    try {
      await navigator.clipboard.writeText(recoveryResult.code);
      success("恢复码已复制");
    } catch {
      error("复制失败，请手动选择复制");
    }
  };

  const handleBatchDelete = async () => {
    if (selection.selectedCount === 0) return;
    const ids = Array.from(selection.selectedIds);
    setBatchDeleting(true);
    try {
      const res = await withStepUp(() =>
        apiPost<{ message: string }>("/api/admin/admins", {
          ids,
          action: "delete",
        })
      );
      if (res === null) return;
      success(res.message || `已删除 ${ids.length} 名管理员`);
      const deletesWholePage = admins.length > 0 && admins.every((a) => ids.includes(a.id));
      selection.clear();
      setShowBatchDelete(false);
      if (deletesWholePage && page > 1) {
        updateParams({ page: String(page - 1) });
      } else {
        await fetchAdmins();
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setBatchDeleting(false);
    }
  };

  const isAllSelected = selection.isAllSelected(admins);
  const isSelectionIndeterminate = selection.isIndeterminate(admins);

  return (
    <RequirePermission permission="admins:read">
      <div className="space-y-6">
        <PageHeader
          title="管理员管理"
          description="管理后台管理员账号"
          accessory={isOwnerActor ? <BreakGlassButton /> : undefined}
          actions={
            <>
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
            </>
          }
        />

        {/* 搜索栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-charcoal/10 bg-white p-4">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
            <Input
              placeholder="搜索邮箱/姓名..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
              className="pl-10"
            />
          </div>
          {canManage && selection.selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-charcoal/65">
                已选 {selection.selectedCount} 项
              </span>
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
                onClick={selection.clear}
                aria-label="取消选择"
                className="inline-flex rounded p-1.5 text-brand-charcoal/65 hover:text-brand-charcoal/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* 列表（移动端卡片） */}
        <MobileList
          loading={loading}
          skeletonCount={4}
          error={
            loadError ? (
              <>
                <p className="text-red-500">加载失败</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchAdmins}>
                  重试
                </Button>
              </>
            ) : undefined
          }
          empty={<Empty title="暂无管理员" description="当前还没有管理员账号" />}
          isEmpty={!loading && !loadError && admins.length === 0}
        >
          {admins.map((admin) => {
            const advisor = getAdvisorAccess(admin);
            return (
              <MobileListCard key={admin.id}>
                <div className="flex items-start gap-3">
                  {canManage && (
                    <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(admin)}
                        onChange={() => selection.toggle(admin)}
                        className="h-4 w-4 rounded border-brand-charcoal/20"
                        aria-label={`选择 ${admin.name}`}
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-medium text-brand-charcoal">{admin.name}</p>
                      <Badge variant={admin.role === "owner" ? "warning" : "default"}>
                        {ROLE_LABELS[admin.role as AdminRoleValue] ?? admin.role}
                      </Badge>
                      {admin.role !== "owner" && admin.permissions?.length > 0 && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          已自定义
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-brand-charcoal/65">{admin.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant={advisor.variant}>{advisor.label}</Badge>
                      <span className="text-xs text-brand-charcoal/65">
                        创建于 {new Date(admin.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-end border-t border-brand-charcoal/10 pt-2">
                  {canManage && (admin.role !== "owner" || isOwnerActor) ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`编辑 ${admin.name}`}
                        onClick={() => openEdit(admin)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isOwnerActor &&
                        admin.id !== currentAdminId &&
                        (admin.totpEnabled || admin.totpResetRequired) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`重置二次验证 ${admin.name}`}
                            onClick={() => openRecovery(admin)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                      {!isOwnerActor &&
                        admin.id !== currentAdminId &&
                        (admin.totpEnabled || admin.totpResetRequired) &&
                        canRequestApproval && (
                          <ApprovalRequestAction
                            policyKey="totp.recovery.issue"
                            initialValues={{ adminId: admin.id }}
                            label="申请恢复码"
                            variant="ghost"
                            size="sm"
                          />
                        )}
                      {admin.id !== currentAdminId && isOwnerActor && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`删除 ${admin.name}`}
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeleteTarget(admin)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {admin.id !== currentAdminId && !isOwnerActor && canRequestApproval && (
                        <ApprovalRequestAction
                          policyKey="admin.delete"
                          initialValues={{ adminId: admin.id }}
                          label="申请删除管理员"
                          variant="ghost"
                          size="sm"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-brand-charcoal/65">只读</span>
                  )}
                </div>
              </MobileListCard>
            );
          })}
        </MobileList>

        {/* 列表（桌面端表格） */}
        <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                {canManage && (
                  <th scope="col" className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSelectionIndeterminate;
                      }}
                      onChange={(e) => selection.toggleAll(admins, e.target.checked)}
                      className="h-4 w-4 rounded border-brand-charcoal/20"
                      aria-label="全选"
                    />
                  </th>
                )}
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  姓名
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  邮箱
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  角色
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  测肤子站
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  创建时间
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium text-brand-charcoal/70">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-charcoal/[0.06]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={canManage ? 7 : 6} />
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-5 py-8">
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
                          checked={selection.isSelected(admin)}
                          onChange={() => selection.toggle(admin)}
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
                    <td className="px-5 py-3.5">
                      {(() => {
                        const advisor = getAdvisorAccess(admin);
                        return <Badge variant={advisor.variant}>{advisor.label}</Badge>;
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-brand-charcoal/65">
                      {new Date(admin.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-5 py-3.5">
                      {canManage && (admin.role !== "owner" || isOwnerActor) ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`编辑 ${admin.name}`}
                            onClick={() => openEdit(admin)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isOwnerActor &&
                            admin.id !== currentAdminId &&
                            (admin.totpEnabled || admin.totpResetRequired) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`重置二次验证 ${admin.name}`}
                                onClick={() => openRecovery(admin)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            )}
                          {/* 不能删除自己（服务端禁止，前端不展示避免必然失败） */}
                          {admin.id !== currentAdminId && isOwnerActor && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`删除 ${admin.name}`}
                              onClick={() => setDeleteTarget(admin)}
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          )}
                          {admin.id !== currentAdminId &&
                            !isOwnerActor &&
                            (admin.totpEnabled || admin.totpResetRequired) &&
                            canRequestApproval && (
                              <ApprovalRequestAction
                                policyKey="totp.recovery.issue"
                                initialValues={{ adminId: admin.id }}
                                label="申请恢复码"
                                variant="ghost"
                                size="sm"
                              />
                            )}
                          {admin.id !== currentAdminId && !isOwnerActor && canRequestApproval && (
                            <ApprovalRequestAction
                              policyKey="admin.delete"
                              initialValues={{ adminId: admin.id }}
                              label="申请删除管理员"
                              variant="ghost"
                              size="sm"
                            />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-brand-charcoal/65">只读</span>
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
          mobileFullScreen
          closeOnBackdrop={false}
          closeGuard={() => !submitting && confirmClose()}
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirmClose()) setShowModal(false);
                }}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" form="admin-form" loading={submitting} disabled={submitting}>
                保存
              </Button>
            </div>
          }
        >
          <form id="admin-form" noValidate onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="姓名"
                required
                data-autofocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="邮箱"
                type="email"
                required={isOwnerActor || !editing}
                value={form.email}
                disabled={!!editing && !isEditingSelf && !isOwnerActor}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div>
                <Input
                  label={`密码${editing ? "（留空则不修改）" : ""}`}
                  type="password"
                  required={!editing}
                  minLength={8}
                  disabled={isEditingSelf || (!!editing && !isOwnerActor)}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                {(form.password.length > 0 || !editing) && (
                  <PasswordRulesChecklist password={form.password} className="mt-1.5" />
                )}
              </div>
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
            {!isEditingSelf && !!editing && !isOwnerActor && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                仅超级管理员可修改其他管理员的邮箱或密码。
              </p>
            )}

            {/* 权限覆盖编辑器：勾选相对角色模板调整，保存为个人权限覆盖 */}
            {form.role !== "owner" && (
              <div className="rounded-lg border border-brand-charcoal/15 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-brand-charcoal">权限（个人覆盖）</p>
                    <p className="mt-0.5 text-xs text-brand-charcoal/65">
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
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-brand-charcoal/65">
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
          </form>
        </Modal>

        {/* TOTP 恢复码 */}
        <Modal
          open={!!recoveryTarget}
          onClose={closeRecovery}
          title="签发 TOTP 恢复码"
          size="md"
          closeOnBackdrop={!recoverySubmitting && !recoveryResult}
          closeOnEscape={!recoveryResult}
          showCloseButton={!recoveryResult}
          closeGuard={() => !recoveryResult && !recoverySubmitting}
          footer={
            recoveryResult ? (
              <Button type="button" onClick={closeRecovery} disabled={!recoverySaved}>
                完成
              </Button>
            ) : (
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeRecovery}
                  disabled={recoverySubmitting}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  form="totp-recovery-form"
                  loading={recoverySubmitting}
                  disabled={recoverySubmitting}
                >
                  生成恢复码
                </Button>
              </div>
            )
          }
        >
          {recoveryResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                恢复码只显示一次。请通过安全渠道发送给 {recoveryResult.targetEmail}。 对方使用“密码
                + 恢复码”登录后，必须重新绑定 TOTP。
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-brand-charcoal/[0.05] px-3 py-2.5 font-mono text-sm">
                  {recoveryResult.code}
                </code>
                <Button type="button" variant="outline" onClick={copyRecoveryCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-brand-charcoal/65">
                有效期至：{new Date(recoveryResult.expiresAt).toLocaleString("zh-CN")}
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={recoverySaved}
                  onChange={(e) => setRecoverySaved(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-amber-800">
                  我已通过安全渠道保存/发送恢复码；关闭后无法再次查看。
                </span>
              </label>
            </div>
          ) : (
            <form id="totp-recovery-form" onSubmit={handleIssueRecovery} className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                仅用于目标管理员丢失验证器且备用码不可用的情况。恢复码有效 10 分钟，使用一次后失效。
              </div>
              <p className="text-sm text-brand-charcoal/70">
                目标管理员：
                <span className="font-medium text-brand-charcoal">{recoveryTarget?.email}</span>
              </p>
              <Input
                label="恢复原因"
                required
                value={recoveryReason}
                onChange={(e) => setRecoveryReason(e.target.value)}
                placeholder="例如：手机丢失，备用码不可用"
                maxLength={500}
              />
              <Input
                label="你的 TOTP 验证码"
                required
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                placeholder="6 位动态验证码或备用码"
                maxLength={20}
                inputMode="text"
              />
            </form>
          )}
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

        {/* 高风险操作二次验证 */}
        {totpModal}
      </div>
    </RequirePermission>
  );
}
