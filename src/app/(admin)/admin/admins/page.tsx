"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
  X,
  KeyRound,
  Copy,
  Power,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";
import { formatDateTime } from "@/lib/format";
import { PasswordRulesChecklist } from "@/components/ui/PasswordRulesChecklist";
import {
  AdminRoleBadge,
  AdminSearchInput,
  AdminStatusIcon,
  DataTable,
  IconButton,
  RequirePermission,
  TotpStatusIcon,
  type Column,
} from "@/components/admin";
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
import { getPermissionDiff, isCustomizedAdmin } from "@/lib/admin-display";
import { cn } from "@/lib/utils";

function permissionKey(permissions: Iterable<string>) {
  return Array.from(permissions).sort().join("|");
}

const ADMIN_PAGE_SIZES = [10, 20, 50, 100] as const;

const EMAIL_HISTORY_REASON_LABELS: Record<string, string> = {
  email_changed: "修改邮箱",
  soft_delete: "软删除归档",
  anonymized: "匿名化归档",
};

function getAdvisorAccess(admin: AdminItem): {
  label: string;
  variant: "primary" | "success" | "secondary";
} {
  const permissions = resolveAdminPermissions(admin.role, admin.permissions);
  if (admin.role === "owner" || permissions.includes("advisor:admin")) {
    return { label: "全部权限", variant: "primary" };
  }
  if (permissions.includes("advisor:access")) {
    return { label: "管理员", variant: "success" };
  }
  return { label: "无", variant: "secondary" };
}

function getBaAccess(admin: AdminItem): {
  label: string;
  variant: "primary" | "success" | "secondary";
} {
  const permissions = resolveAdminPermissions(admin.role, admin.permissions);
  if (admin.role === "owner" || permissions.includes("ba:admin")) {
    return { label: "全部权限", variant: "primary" };
  }
  if (permissions.includes("ba:access")) {
    return { label: "管理员", variant: "success" };
  }
  if (permissions.some((permission) => permission.startsWith("ba:"))) {
    return { label: "部分权限", variant: "secondary" };
  }
  return { label: "无", variant: "secondary" };
}

interface AdminItem {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  permissions: string[];
  totpEnabled: boolean;
  totpResetRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminRowActionsProps {
  admin: AdminItem;
  currentAdminId?: string;
  canManage: boolean;
  isOwnerActor: boolean;
  canRequestApproval: boolean;
  togglingStatusId: string | null;
  onEdit: (admin: AdminItem) => void;
  onToggleStatus: (admin: AdminItem) => void;
  onResetTotp: (admin: AdminItem) => void;
  onDelete: (admin: AdminItem) => void;
  className?: string;
}

/**
 * 管理员行操作：编辑 + “更多”菜单。
 * - owner：启用/禁用、重置二次验证、删除
 * - 非 owner：逐条申请恢复码/申请删除
 * - 非关键操作不再用一排同色图标，避免与状态图标抢语义
 */
function AdminRowActions({
  admin,
  currentAdminId,
  canManage,
  isOwnerActor,
  canRequestApproval,
  togglingStatusId,
  onEdit,
  onToggleStatus,
  onResetTotp,
  onDelete,
  className,
}: AdminRowActionsProps) {
  if (!canManage) {
    return <span className="text-xs text-ink-muted">只读</span>;
  }

  const isSelf = admin.id === currentAdminId;
  const canEdit = admin.role !== "owner" || isOwnerActor;
  const menuItems: DropdownItem[] = [];

  if (isOwnerActor && !isSelf) {
    menuItems.push({
      label: admin.status === "DISABLED" ? "启用账号" : "禁用账号",
      icon: <Power className="h-4 w-4" />,
      danger: admin.status !== "DISABLED",
      disabled: togglingStatusId === admin.id,
      onClick: () => onToggleStatus(admin),
    });
    if ((admin.totpEnabled || admin.totpResetRequired) && admin.role !== "owner") {
      menuItems.push({
        label: "重置二次验证",
        icon: <KeyRound className="h-4 w-4" />,
        onClick: () => onResetTotp(admin),
      });
    }
    if (!isSelf) {
      menuItems.push({
        label: "删除管理员",
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        onClick: () => onDelete(admin),
      });
    }
  }

  const needsOwnerApprovalRecovery =
    isOwnerActor &&
    !isSelf &&
    admin.role === "owner" &&
    (admin.totpEnabled || admin.totpResetRequired);
  const needsRequesterRecovery =
    !isOwnerActor && !isSelf && canRequestApproval && (admin.totpEnabled || admin.totpResetRequired);
  const needsRequesterDelete = !isOwnerActor && !isSelf && canRequestApproval;

  if (!canEdit && menuItems.length === 0 && !needsRequesterDelete && !needsOwnerApprovalRecovery) {
    return <span className="text-xs text-ink-muted">只读</span>;
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1", className)}>
      {canEdit && (
        <IconButton label={`编辑 ${admin.name}`} onClick={() => onEdit(admin)}>
          <Pencil className="h-4 w-4" />
        </IconButton>
      )}

      {menuItems.length > 0 && (
        <Dropdown
          trigger={
            <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm text-ink-muted transition-colors hover:bg-surface-hover hover:text-brand-charcoal sm:h-9 sm:min-w-9">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">更多操作</span>
            </span>
          }
          items={menuItems}
        />
      )}

      {needsOwnerApprovalRecovery && (
        <ApprovalRequestAction
          policyKey="totp.recovery.issue"
          initialValues={{ adminId: admin.id }}
          label="申请恢复码"
          variant="ghost"
          size="sm"
        />
      )}

      {needsRequesterRecovery && (
        <ApprovalRequestAction
          policyKey="totp.recovery.issue"
          initialValues={{ adminId: admin.id }}
          label="申请恢复码"
          variant="ghost"
          size="sm"
        />
      )}

      {needsRequesterDelete && (
        <ApprovalRequestAction
          policyKey="admin.delete"
          initialValues={{ adminId: admin.id }}
          label="申请删除"
          variant="ghost"
          size="sm"
        />
      )}
    </div>
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [passwordError, setPasswordError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<AdminItem | null>(null);
  const [pendingRole, setPendingRole] = useState<AdminRoleValue | null>(null);
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
  const permissionDiff = useMemo(
    () => getPermissionDiff(form.role, selectedPermissions),
    [form.role, selectedPermissions]
  );
  const { confirmClose } = useUnsavedChanges(isModalDirty);
  const isEditingSelf = !!editing && editing.id === currentAdminId;
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [batchDeleteReason, setBatchDeleteReason] = useState("");
  const [emailHistory, setEmailHistory] = useState<
    {
      id: string;
      email: string;
      changedAt: string;
      changedBy: string | null;
      reason: string | null;
    }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recoveryTarget, setRecoveryTarget] = useState<AdminItem | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");
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
const statusFilter = searchParams.get("status") || "";
const roleFilter = searchParams.get("role") || "";
const totpFilter = searchParams.get("totp") || "";
const customizedFilter = searchParams.get("customized") === "1";
const pageSizeRaw = Number(searchParams.get("pageSize"));
const pageSizeParam = (ADMIN_PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
  ? pageSizeRaw
  : 20;
// 勾选状态：翻页/搜索/筛选变化时自动清空
const selection = useRowSelection<AdminItem>(
  (admin) => admin.id,
  `${page}|${search}|${statusFilter}|${roleFilter}|${totpFilter}|${customizedFilter}|${pageSizeParam}`
);
  const { selectedIds } = selection;
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const takeLatestAdmins = useLatestRequest();
  const fetchAdmins = useCallback(async () => {
    const isLatest = takeLatestAdmins();
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    try {
        const data = await apiGet<{ admins: AdminItem[]; pagination: typeof pagination }>(
          "/api/admin/admins",
          {
            page,
            pageSize: pageSizeParam,
            search,
            status: statusFilter || undefined,
            role: roleFilter || undefined,
            totp: totpFilter || undefined,
            customized: customizedFilter ? "1" : undefined,
          }
        );
      if (!isLatest()) return;
      setAdmins(data.admins);
      setPagination(data.pagination);
      setLoadError(false);
      hasLoadedRef.current = true;
    } catch (err) {
      if (!isLatest()) return;
      if (err instanceof ApiError && err.status === 401) {
        router.push("/admin-login?reauth=1");
        return;
      }
      setLoadError(true);
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    }, [
    page,
    pageSizeParam,
    search,
    statusFilter,
    roleFilter,
    totpFilter,
    customizedFilter,
    router,
    takeLatestAdmins,
  ]);

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
    setEmailHistory([]);
    setForm(nextForm);
    setPasswordError("");
    setPendingRole(null);
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
    setEmailHistory([]);
    setForm(nextForm);
    setPasswordError("");
    setPendingRole(null);
    setSelectedPermissions(nextPermissions);
    setModalBaseline({ form: nextForm, permissions: permissionKey(nextPermissions) });
    setShowModal(true);

    setHistoryLoading(true);
    apiGet<{
      history: {
        id: string;
        email: string;
        changedAt: string;
        changedBy: string | null;
        reason: string | null;
      }[];
    }>(`/api/admin/admins/${admin.id}/email-history`)
      .then((data) => setEmailHistory(data.history))
      .catch(() => {
        // 历史邮箱失败不阻断编辑
      })
      .finally(() => setHistoryLoading(false));
  };

  /** 角色变化时重置为模板默认权限（owner 恒为全部） */
  const applyRoleChange = (role: AdminRoleValue) => {
    setForm((prev) => ({ ...prev, role }));
    setSelectedPermissions(new Set(resolveAdminPermissions(role)));
  };

  const handleRoleChange = (role: AdminRoleValue) => {
    if (editing && role !== editing.role && isCustomizedAdmin(editing.role, editing.permissions)) {
      setPendingRole(role);
      return;
    }
    applyRoleChange(role);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editing || form.password) {
      const strength = validatePasswordStrength(form.password);
      if (!strength.valid) {
        setPasswordError(strength.message || "密码格式不符合要求");
        passwordInputRef.current?.focus();
        return;
      }
    }
    setPasswordError("");

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

  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);

  const applyAdminStatus = async (target: AdminItem, nextStatus: "ACTIVE" | "DISABLED") => {
    if (togglingStatusId) return;
    setTogglingStatusId(target.id);
    try {
      const result = await withStepUp(() =>
        apiPut(`/api/admin/admins`, { id: target.id, status: nextStatus })
      );
      if (result === null) return;
      setAdmins((prev) =>
        prev.map((item) => (item.id === target.id ? { ...item, status: nextStatus } : item))
      );
      setStatusConfirmTarget(null);
      success(
        nextStatus === "ACTIVE" ? "管理员已启用" : "管理员已禁用，目标会话已失效"
      );
      // 静默对账，避免整表骨架闪烁
      await fetchAdmins();
    } catch (err) {
      error(err instanceof Error ? err.message : "状态修改失败");
    } finally {
      setTogglingStatusId(null);
    }
  };

  const requestToggleAdminStatus = (target: AdminItem) => {
    if (target.status === "DISABLED") {
      void applyAdminStatus(target, "ACTIVE");
      return;
    }
    setStatusConfirmTarget(target);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await withStepUp(() =>
        apiDelete(`/api/admin/admins/${deleteTarget.id}`, {
          reason: deleteReason.trim() || undefined,
        })
      );
      if (result === null) return;
      success("删除成功");
      setDeleteTarget(null);
      setDeleteReason("");
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
    setRecoveryResult(null);
    setRecoverySaved(false);
  };

  const closeRecovery = () => {
    if (recoverySubmitting) return;
    setRecoveryTarget(null);
    setRecoveryResult(null);
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

    setRecoverySubmitting(true);
    try {
      const data = await withStepUp(() =>
        apiPost<{
          code: string;
          expiresAt: string;
          targetEmail: string;
        }>(`/api/admin/admins/${recoveryTarget.id}/totp-recovery`, {
          reason: recoveryReason.trim(),
        })
      );
      if (!data) return;
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
    if (!isOwnerActor) {
      error("批量删除管理员需要 owner 审批，请逐个提交删除申请");
      return;
    }
    const ids = Array.from(selection.selectedIds);
    setBatchDeleting(true);
    try {
      const res = await withStepUp(() =>
        apiPost<{ message: string }>("/api/admin/admins", {
          ids,
          action: "delete",
          reason: batchDeleteReason.trim() || undefined,
        })
      );
      if (res === null) return;
      success(res.message || `已删除 ${ids.length} 名管理员`);
      const deletesWholePage = admins.length > 0 && admins.every((a) => ids.includes(a.id));
      selection.clear();
      setShowBatchDelete(false);
      setBatchDeleteReason("");
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
  const hasFilters = Boolean(
    search || statusFilter || roleFilter || totpFilter || customizedFilter
  );
  const clearFilters = () => router.push("/admin/admins");

  const columns: Column<AdminItem>[] = [
    ...(canManage && isOwnerActor
      ? [
          {
            key: "select",
            title: (
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isSelectionIndeterminate;
                }}
                onChange={(event) => selection.toggleAll(admins, event.target.checked)}
                className="h-4 w-4 rounded border-line-strong"
                aria-label="全选"
              />
            ),
            width: "44px",
            render: (_value: unknown, admin: AdminItem) => (
              <input
                type="checkbox"
                checked={selection.isSelected(admin)}
                onChange={() => selection.toggle(admin)}
                className="h-4 w-4 rounded border-line-strong"
                aria-label={`选择 ${admin.name}`}
              />
            ),
          },
        ]
      : []),
    {
      key: "name",
      title: "姓名",
      width: "160px",
      render: (_value, admin) => (
        <span className="font-medium text-brand-charcoal">{admin.name}</span>
      ),
    },
    {
      key: "email",
      title: "邮箱",
      width: "220px",
      render: (_value, admin) => (
        <span className="text-brand-charcoal/80">{admin.email}</span>
      ),
    },
    {
      key: "role",
      title: "角色",
      width: "160px",
      render: (_value, admin) => (
        <AdminRoleBadge role={admin.role} overrides={admin.permissions} />
      ),
    },
    {
      key: "status",
      title: "状态",
      width: "64px",
      align: "center",
      render: (_value, admin) => <AdminStatusIcon status={admin.status} />,
    },
    {
      key: "totp",
      title: "二次验证",
      width: "96px",
      align: "center",
      render: (_value, admin) => (
        <TotpStatusIcon
          enabled={admin.totpEnabled}
          resetRequired={admin.totpResetRequired}
        />
      ),
    },
    {
      key: "lastLoginAt",
      title: "最近登录",
      width: "180px",
      render: (_value, admin) => (
        <time
          dateTime={admin.lastLoginAt ?? undefined}
          title={admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : undefined}
          className="text-xs text-ink-muted"
        >
          {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : "从未登录"}
        </time>
      ),
    },
    {
      key: "advisor",
      title: "测肤权限",
      width: "110px",
      render: (_value, admin) => {
        const advisor = getAdvisorAccess(admin);
        return <Badge variant={advisor.variant}>{advisor.label}</Badge>;
      },
    },
    {
      key: "ba",
      title: "验真权限",
      width: "110px",
      render: (_value, admin) => {
        const ba = getBaAccess(admin);
        return <Badge variant={ba.variant}>{ba.label}</Badge>;
      },
    },
    {
      key: "actions",
      title: "操作",
      width: "100px",
      render: (_value, admin) => (
        <AdminRowActions
          admin={admin}
          currentAdminId={currentAdminId}
          canManage={canManage}
          isOwnerActor={isOwnerActor}
          canRequestApproval={canRequestApproval}
          togglingStatusId={togglingStatusId}
          onEdit={openEdit}
          onToggleStatus={requestToggleAdminStatus}
          onResetTotp={openRecovery}
          onDelete={setDeleteTarget}
        />
      ),
    },
  ];

  return (
    <RequirePermission permission="admins:read">
      <div className="space-y-6">
        <PageHeader
          title="管理员管理"
          description="管理后台管理员账号、角色与权限"
          accessory={isOwnerActor ? <BreakGlassButton /> : undefined}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                loading={refreshing}
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

      {/* 搜索与筛选 */}
      <div className="rounded-card border border-line bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <AdminSearchInput
            value={search}
            onCommit={(next) => updateParams({ search: next })}
            ariaLabel="搜索管理员"
            placeholder="搜索邮箱/姓名..."
            className="lg:max-w-sm lg:flex-1"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <Select
                aria-label="按状态筛选"
                value={statusFilter}
                onChange={(event) => updateParams({ status: event.target.value })}
                options={[
                  { value: "", label: "全部状态" },
                  { value: "ACTIVE", label: "已启用" },
                  { value: "DISABLED", label: "已禁用" },
                ]}
              />
            </div>
            <div className="w-36">
              <Select
                aria-label="按角色或自定义管理筛选"
                value={customizedFilter ? "custom" : roleFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "custom") {
                    updateParams({ role: "", customized: "1" });
                  } else {
                    updateParams({ role: value, customized: "" });
                  }
                }}
                options={[
                  { value: "", label: "全部角色" },
                  { value: "custom", label: "自定义管理" },
                  ...ADMIN_ROLES.map((role) => ({
                    value: role,
                    label: ROLE_LABELS[role as AdminRoleValue] ?? role,
                  })),
                ]}
              />
            </div>
            <div className="w-36">
              <Select
                aria-label="按二次验证筛选"
                value={totpFilter}
                onChange={(event) => updateParams({ totp: event.target.value })}
                options={[
                  { value: "", label: "全部二次验证" },
                  { value: "enabled", label: "已绑定" },
                  { value: "disabled", label: "未绑定" },
                ]}
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
            {canManage && isOwnerActor && selection.selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-muted">
                  已选 {selection.selectedCount} 项
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-status-danger-fg hover:bg-status-danger-soft"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setShowBatchDelete(true)}
                >
                  批量删除
                </Button>
                <button
                  onClick={selection.clear}
                  aria-label="取消选择"
                  className="inline-flex rounded p-1.5 text-ink-muted hover:text-brand-charcoal/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* 列表（移动端卡片） */}
        <DataTable
          columns={columns}
          data={admins}
          loading={loading}
          error={loadError ? "加载失败，请稍后重试" : null}
          onRetry={fetchAdmins}
          rowKey="id"
          minWidth="900px"
          emptyText="暂无管理员"
          emptyAction={
            canManage ? { label: "新增管理员", onClick: openCreate } : undefined
          }
          isFiltered={hasFilters}
          onClearFilters={clearFilters}
          ariaLabel="管理员列表"
          pagination={{
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: (nextPage) => updateParams({ page: String(nextPage) }),
            onPageSizeChange: (size) => updateParams({ pageSize: String(size) }),
          }}
          mobileCard={(admin) => {
            const advisor = getAdvisorAccess(admin);
            const ba = getBaAccess(admin);
            return (
              <div>
                <div className="flex items-start gap-3">
                  {canManage && isOwnerActor && (
                    <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(admin)}
                        onChange={() => selection.toggle(admin)}
                        className="h-4 w-4 rounded border-line-strong"
                        aria-label={`选择 ${admin.name}`}
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-medium text-brand-charcoal">{admin.name}</p>
                      <AdminRoleBadge role={admin.role} overrides={admin.permissions} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{admin.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <AdminStatusIcon status={admin.status} showLabel />
                      <TotpStatusIcon
                        enabled={admin.totpEnabled}
                        resetRequired={admin.totpResetRequired}
                        showLabel
                      />
                      <Badge variant={advisor.variant}>测肤 {advisor.label}</Badge>
                      <Badge variant={ba.variant}>验真 {ba.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      最近登录 {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : "从未"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end border-t border-line pt-2">
                  <AdminRowActions
                    admin={admin}
                    currentAdminId={currentAdminId}
                    canManage={canManage}
                    isOwnerActor={isOwnerActor}
                    canRequestApproval={canRequestApproval}
                    togglingStatusId={togglingStatusId}
                    onEdit={openEdit}
                    onToggleStatus={requestToggleAdminStatus}
                    onResetTotp={openRecovery}
                    onDelete={setDeleteTarget}
                  />
                </div>
              </div>
            );
          }}
        />

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
                  ref={passwordInputRef}
                  label={`密码${editing ? "（留空则不修改）" : ""}`}
                  type="password"
                  required={!editing}
                  minLength={8}
                  disabled={isEditingSelf || (!!editing && !isOwnerActor)}
                  value={form.password}
                  error={passwordError}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    if (passwordError) setPasswordError("");
                  }}
                />
                {(form.password.length > 0 || !editing) && (
                  <PasswordRulesChecklist password={form.password} className="mt-1.5" />
                )}
              </div>
              {editing && (historyLoading || emailHistory.length > 0) && (
                <div className="rounded-lg bg-surface-muted p-3 text-xs sm:col-span-2">
                  <p className="font-medium text-brand-charcoal/80">历史邮箱</p>
                  {historyLoading ? (
                    <p className="mt-1 text-ink-muted">加载中…</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-brand-charcoal/70">
                      {emailHistory.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-mono">{item.email}</span>
                          <span className="text-ink-faint">
                            {formatDateTime(item.changedAt)}
                          </span>
                          <Badge variant="secondary" size="sm">
                            {item.reason
                              ? EMAIL_HISTORY_REASON_LABELS[item.reason] || item.reason
                              : "历史记录"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
              <p className="rounded-lg bg-status-warning-soft px-3 py-2 text-xs text-status-warning-strong">
                不能修改自己的角色、权限或密码（防自锁），请由其他超级管理员操作。
              </p>
            )}
            {!isEditingSelf && !!editing && !isOwnerActor && (
              <p className="rounded-lg bg-status-warning-soft px-3 py-2 text-xs text-status-warning-strong">
                仅超级管理员可修改其他管理员的邮箱或密码。
              </p>
            )}
            {!!editing &&
              isCustomizedAdmin(editing.role, editing.permissions) &&
              form.role !== editing.role && (
                <p className="rounded-lg bg-status-warning-soft px-3 py-2 text-xs text-status-warning-fg">
                  已切换角色，保存后原有自定义权限将按新角色模板重置。
                </p>
              )}

            {/* 权限覆盖编辑器：勾选相对角色模板调整，保存为个人权限覆盖 */}
            {form.role !== "owner" && (
              <div className="rounded-lg border border-line-strong p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-brand-charcoal">权限（个人覆盖）</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      默认继承「{ROLE_LABELS[form.role]}」模板，可单独增减；保存时自动生成覆盖差异
                    </p>
                    <p
                      className="mt-1 text-xs text-brand-charcoal/70"
                      title={`新增：${
                        permissionDiff.added
                          .map((permission) => PERMISSION_LABELS[permission as AdminPermission] ?? permission)
                          .join("、") || "无"
                      }；撤销：${
                        permissionDiff.removed
                          .map((permission) => PERMISSION_LABELS[permission as AdminPermission] ?? permission)
                          .join("、") || "无"
                      }`}
                    >
                      当前差异：
                      <span className="font-medium text-status-success-fg">
                        +{permissionDiff.addedCount}
                      </span>
                      <span className="mx-1 text-ink-faint">/</span>
                      <span className="font-medium text-status-danger-fg">
                        -{permissionDiff.removedCount}
                      </span>
                      {permissionDiff.addedCount === 0 && permissionDiff.removedCount === 0 && (
                        <span className="ml-1 text-ink-muted">（与模板一致）</span>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      isEditingSelf ||
                      (permissionDiff.addedCount === 0 && permissionDiff.removedCount === 0)
                    }
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
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
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
                                  : "hover:bg-surface-muted"
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
              <div className="rounded-lg border border-status-warning-line bg-status-warning-soft px-4 py-3 text-sm text-status-warning-strong">
                恢复码只显示一次。请通过安全渠道发送给 {recoveryResult.targetEmail}。 对方使用“密码
                + 恢复码”登录后，必须重新绑定 TOTP。
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-hover px-3 py-2.5 font-mono text-sm">
                  {recoveryResult.code}
                </code>
                <Button type="button" variant="outline" onClick={copyRecoveryCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-ink-muted">
                有效期至：{new Date(recoveryResult.expiresAt).toLocaleString("zh-CN")}
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-status-warning-line bg-status-warning-soft p-3">
                <input
                  type="checkbox"
                  checked={recoverySaved}
                  onChange={(e) => setRecoverySaved(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-status-warning-strong">
                  我已通过安全渠道保存/发送恢复码；关闭后无法再次查看。
                </span>
              </label>
            </div>
          ) : (
            <form id="totp-recovery-form" onSubmit={handleIssueRecovery} className="space-y-4">
              <div className="rounded-lg border border-status-warning-line bg-status-warning-soft px-4 py-3 text-xs text-status-warning-strong">
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
            </form>
          )}
        </Modal>

        {/* 删除确认 */}
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteReason("");
          }}
          onConfirm={handleDelete}
          title="删除管理员"
          description={`确定要删除管理员「${deleteTarget?.name}」吗？原邮箱会归档并释放，账号满保留期后匿名化。`}
          type="danger"
          confirmText="删除"
          loading={deleting}
        >
          <Textarea
            label="删除原因"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="例如：离职 / 角色调整 / 安全事件（选填，写入审计）"
            rows={2}
            maxLength={500}
          />
        </ConfirmDialog>

        {/* 批量删除确认 */}
        <ConfirmDialog
          open={showBatchDelete}
          onClose={() => {
            setShowBatchDelete(false);
            setBatchDeleteReason("");
          }}
          onConfirm={handleBatchDelete}
          title="批量删除管理员"
          description={`确定要删除选中的 ${selectedIds.size} 名管理员吗？原邮箱会归档并释放，账号满保留期后匿名化。`}
          type="danger"
          confirmText="确认删除"
          loading={batchDeleting}
        >
          <Textarea
            label="删除原因"
            value={batchDeleteReason}
            onChange={(event) => setBatchDeleteReason(event.target.value)}
            placeholder="例如：组织调整 / 批量离职（选填，写入审计）"
            rows={2}
            maxLength={500}
          />
        </ConfirmDialog>

        {/* 禁用确认：服务端会递增 tokenVersion，目标会话立即失效 */}
        <ConfirmDialog
          open={!!statusConfirmTarget}
          onClose={() => setStatusConfirmTarget(null)}
          onConfirm={() =>
            statusConfirmTarget
              ? applyAdminStatus(statusConfirmTarget, "DISABLED")
              : Promise.resolve()
          }
          title="禁用管理员"
          description={`禁用后「${statusConfirmTarget?.name ?? ""}」将立即退出登录，无法访问管理后台；可随时重新启用。`}
          type="danger"
          confirmText="禁用账号"
          loading={!!statusConfirmTarget && togglingStatusId === statusConfirmTarget.id}
        />

        {/* 切换角色会重置自定义权限 */}
        <ConfirmDialog
          open={!!pendingRole}
          onClose={() => setPendingRole(null)}
          onConfirm={() => {
            if (pendingRole) applyRoleChange(pendingRole);
            setPendingRole(null);
          }}
          title="切换角色会重置权限"
          description={`当前账号的自定义权限将被「${
            pendingRole ? (ROLE_LABELS[pendingRole] ?? pendingRole) : ""
          }」模板覆盖，保存后无法恢复。`}
          type="warning"
          confirmVariant="danger"
          confirmText="切换角色"
        />

        {/* 高风险操作二次验证 */}
        {totpModal}
      </div>
    </RequirePermission>
  );
}
