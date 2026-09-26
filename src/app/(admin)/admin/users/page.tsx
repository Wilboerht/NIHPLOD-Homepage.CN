"use client";

/**
 * 用户管理页面
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  RefreshCw,
  Download,
  Eye,
  User,
  Loader2,
  Smartphone,
  Link2,
  Shield,
  Ban,
  CheckCircle,
  Lock,
  Award,
  Wallet,
  Trash2,
  CalendarDays,
  KeyRound,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { useRowSelection } from "@/hooks/useRowSelection";
import { apiConsole } from "@/lib/logger";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { SPENT_CHANNEL_LABELS, SPENT_STATUS_LABELS } from "@/lib/spent-adjustment-meta";

type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

interface UserItem {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  status: UserStatus;
  membershipLevel: string | null;
  createdAt: string;
}

const userStatusMap: Record<
  UserStatus,
  {
    label: string;
    variant: "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";
    description: string;
  }
> = {
  ACTIVE: { label: "正常", variant: "success", description: "账号可正常登录和使用" },
  SUSPENDED: { label: "冻结", variant: "warning", description: "账号暂时无法登录，可解冻恢复" },
  BANNED: { label: "封禁", variant: "danger", description: "账号永久封禁，不可恢复" },
};

const membershipLevelMap: Record<
  string,
  {
    label: string;
    variant: "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";
  }
> = {
  REGULAR: { label: "普通会员", variant: "secondary" },
  SILVER: { label: "银卡会员", variant: "default" },
  GOLD: { label: "金卡会员", variant: "warning" },
  DIAMOND: { label: "钻石卡会员", variant: "primary" },
};

interface UserDetail {
  id: string;
  phone: string | null;
  phoneVerified: boolean;
  nickname: string | null;
  avatar: string | null;
  status: UserStatus;
  membershipLevel: string | null;
  totalSpent: number | null;
  silverActivatedAt: string | null;
  goldActivatedAt: string | null;
  diamondActivatedAt: string | null;
  wechatOpenId: string | null;
  birthday: string | null;
  birthdayLocked: boolean;
  // 多平台外部身份（聚合框架单一数据源）
  externalIdentities?: {
    id: string;
    provider: string;
    subjectId: string;
    unionId: string | null;
    metadata: unknown;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

interface LoginAttemptItem {
  id: string;
  type: string;
  success: boolean;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  clientId: string | null;
  createdAt: string;
}

const LOGIN_TYPE_LABELS: Record<string, string> = {
  password: "密码登录",
  sms: "验证码登录",
  admin: "管理员登录",
  wechat: "微信登录",
  douyin: "抖音登录",
};

interface RedemptionDetailItem {
  id: string;
  productName: string;
  priceYuan: number;
  points: number;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
  carrier: string | null;
  waybillNo: string | null;
  recipient: string | null;
  phone: string | null;
  address: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

interface UserDetailPoints {
  available: number;
  frozen: number;
  redemptions: RedemptionDetailItem[];
  redemptionTotal: number;
}

interface AddressItem {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
  createdAt: string;
}

interface SpentAdjustmentItem {
  id: string;
  channel: string;
  orderNo: string;
  amountClaimed: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewAmount: number | null;
  reviewNote: string | null;
  createdAt: string;
}

interface LevelChangeItem {
  id: string;
  fromLevel: string;
  toLevel: string;
  note: string | null;
  createdAt: string;
}

interface PointLedgerItem {
  id: string;
  type: string;
  amount: number;
  remaining: number | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const POINT_TYPE_LABELS: Record<string, string> = {
  CONSUME: "消费获得",
  REFUND: "退款冲正",
  BIRTHDAY: "生日礼遇",
  CHECKIN: "打卡奖励",
  REDEEM: "积分兑礼",
  EXPIRE: "积分过期",
  ADJUST: "人工调整",
};

const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
};

const REDEMPTION_STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const ADJUSTMENT_STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-600",
};

// 外部身份平台标签（与后端 ExternalIdentity.provider 枚举一一对应；未知 provider 原样显示）
const providerLabelMap: Record<string, string> = {
  wechat_open: "微信开放平台",
  wechat_mp: "微信服务号",
  wechat_miniprogram: "微信小程序",
  douyin: "抖音",
};

/** 安全读取 ExternalIdentity metadata（Json 字段）中的平台昵称 */
function getIdentityNickname(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "nickname" in metadata) {
    const nickname = (metadata as { nickname?: unknown }).nickname;
    return typeof nickname === "string" && nickname ? nickname : null;
  }
  return null;
}

function AdminUsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const [searchInput, setSearchInput] = useState(search);

  // 批量操作状态（翻页/筛选/搜索变化时自动清空勾选）
  const userSelection = useRowSelection<UserItem>(
    (u) => u.id,
    `${page}|${pageSize}|${search}|${status}`
  );
  const { selectedIds, selectedCount } = userSelection;
  const [batchTarget, setBatchTarget] = useState<{ status: UserStatus } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailPoints, setDetailPoints] = useState<UserDetailPoints | null>(null);
  const [detailAddresses, setDetailAddresses] = useState<AddressItem[]>([]);
  const [detailAdjustments, setDetailAdjustments] = useState<SpentAdjustmentItem[]>([]);
  const [detailAdjustmentTotal, setDetailAdjustmentTotal] = useState(0);
  const [detailLevelChanges, setDetailLevelChanges] = useState<LevelChangeItem[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "basic" | "points" | "address" | "spent" | "growth" | "login"
  >("basic");
  const [detailLoginAttempts, setDetailLoginAttempts] = useState<LoginAttemptItem[]>([]);

  // 生日修改 / 解锁
  const [birthdayEditOpen, setBirthdayEditOpen] = useState(false);
  const [birthdayInput, setBirthdayInput] = useState("");
  const [birthdaySaving, setBirthdaySaving] = useState(false);

  // 解绑外部身份
  const [identityUnbindTarget, setIdentityUnbindTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [identityUnbinding, setIdentityUnbinding] = useState(false);

  // 重置密码
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // 权限（导航与按钮按权限点收敛，服务端为最终权威）
  const { can: canAdmin } = useAdminPermissions();
  const canWriteUsers = canAdmin("users:write");
  const canDeleteUsers = canAdmin("users:delete");
  const canSecurityWrite = canAdmin("users:security:write");
  const canRevealPhone = canAdmin("users:sensitive:read");

  // 积分流水与人工调整
  const [ledgerItems, setLedgerItems] = useState<PointLedgerItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [revealedPhone, setRevealedPhone] = useState("");
  const [revealingPhone, setRevealingPhone] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; status: UserStatus } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const takeLatestUsers = useLatestRequest();
  const fetchUsers = useCallback(async () => {
    const isLatest = takeLatestUsers();
    setLoading(true);
    try {
      const data = await apiGet<{ users: UserItem[]; pagination: typeof pagination }>(
        "/api/admin/users",
        {
          page,
          pageSize,
          search,
          status: status || undefined,
        }
      );
      // 丢弃过期响应：快速切换分页/筛选时只接受最新一次请求
      if (!isLatest()) return;
      setLoadError("");
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      if (!isLatest()) return;
      // 会话过期统一回登录页，而不是停留在“列表加载失败”
      if (err instanceof ApiError && err.status === 401) {
        router.push("/admin-login");
        return;
      }
      setLoadError(err instanceof Error ? err.message : "列表加载失败，请重试");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, search, status, router, takeLatestUsers]);

  useEffect(() => {
    deferInEffect(fetchUsers);
  }, [fetchUsers]);

  const fetchLedger = useCallback(async (userId: string, targetPage: number) => {
    setLedgerLoading(true);
    try {
      const data = await apiGet<{
        available: number;
        frozen: number;
        items: PointLedgerItem[];
        pagination: { totalPages: number };
      }>(`/api/admin/users/${userId}/points`, { page: targetPage, pageSize: 20 });
      setLedgerItems(data.items);
      setLedgerPage(targetPage);
      setLedgerTotalPages(data.pagination.totalPages);
      // 余额以流水接口物化结果为准（含过期处理）
      setDetailPoints((prev) =>
        prev ? { ...prev, available: data.available, frozen: data.frozen } : prev
      );
    } catch {
      toast.error("加载积分流水失败");
    } finally {
      setLedgerLoading(false);
    }
  }, [toast]);

  // 仅按用户 id 重置流水：详情对象因状态变更刷新时不重置当前翻页
  const detailUserId = detailUser?.id;
  useEffect(() => {
    if (activeDetailTab === "points" && detailUserId) {
      deferInEffect(() => fetchLedger(detailUserId, 1));
    }
  }, [activeDetailTab, detailUserId, fetchLedger]);

  const handleAdjustPoints = async () => {
    if (!detailUser) return;
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      toast.error("请输入非零整数分值");
      return;
    }
    if (adjustNote.trim().length < 2) {
      toast.error("请填写调整原因（至少 2 个字）");
      return;
    }

    setAdjusting(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost(`/api/admin/users/${detailUser.id}/points`, {
          amount,
          note: adjustNote.trim(),
          totpCode,
        });

      try {
        await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const code = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!code) return;
        await submit(code);
      }

      toast.success(amount > 0 ? `已为该用户增加 ${amount} 积分` : `已为该用户扣减 ${-amount} 积分`);
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustNote("");
      await fetchLedger(detailUser.id, 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "积分调整失败");
    } finally {
      setAdjusting(false);
    }
  };

  /** 保存生日（管理员代改，YYYY-MM-DD；空字符串表示清除并解锁） */
  const handleSaveBirthday = async () => {
    if (!detailUser) return;
    setBirthdaySaving(true);
    try {
      const data = await apiPatch<{ user: { birthday: string | null; birthdayLocked: boolean } }>(
        `/api/admin/users/${detailUser.id}`,
        { birthday: birthdayInput === "" ? null : birthdayInput }
      );
      toast.success(birthdayInput === "" ? "已清除生日并解锁" : "生日已更新");
      setDetailUser((prev) =>
        prev
          ? {
              ...prev,
              birthday: data.user?.birthday ?? (birthdayInput === "" ? null : birthdayInput),
              birthdayLocked: data.user?.birthdayLocked ?? birthdayInput !== "",
            }
          : prev
      );
      setBirthdayEditOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "生日更新失败");
    } finally {
      setBirthdaySaving(false);
    }
  };

  /** 解锁生日（保留生日值，允许用户自助修改） */
  const handleUnlockBirthday = async () => {
    if (!detailUser) return;
    setBirthdaySaving(true);
    try {
      await apiPatch(`/api/admin/users/${detailUser.id}`, { unlockBirthday: true });
      toast.success("已解锁生日，用户可自助修改");
      setDetailUser((prev) => (prev ? { ...prev, birthdayLocked: false } : prev));
      setBirthdayEditOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "解锁失败");
    } finally {
      setBirthdaySaving(false);
    }
  };

  /** 解绑外部身份 */
  const confirmIdentityUnbind = async () => {
    if (!detailUser || !identityUnbindTarget) return;
    setIdentityUnbinding(true);
    try {
      await apiDelete(
        `/api/admin/users/${detailUser.id}/identities/${identityUnbindTarget.id}`
      );
      toast.success("已解绑该外部身份");
      setDetailUser((prev) =>
        prev
          ? {
              ...prev,
              externalIdentities: (prev.externalIdentities ?? []).filter(
                (i) => i.id !== identityUnbindTarget.id
              ),
            }
          : prev
      );
      setIdentityUnbindTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "解绑失败");
    } finally {
      setIdentityUnbinding(false);
    }
  };

  /** 重置用户密码（生成一次性临时密码） */
  const confirmResetPassword = async () => {
    if (!detailUser) return;
    setResetPasswordLoading(true);
    try {
      const data = await apiPost<{ tempPassword: string }>(
        `/api/admin/users/${detailUser.id}/reset-password`
      );
      setResetPasswordOpen(false);
      setTempPassword(data.tempPassword);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "重置密码失败");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const updateUserStatus = (userId: string, status: UserStatus) => {
    setStatusTarget({ id: userId, status });
  };

  const requestDeleteUser = (id: string, label: string) => {
    setDeleteTarget({ id, label });
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteLoading(true);
    try {
      await apiDelete(`/api/admin/users/${id}`);
      toast.success("用户已删除");
      setDeleteTarget(null);
      if (detailUser?.id === id) {
        setDetailOpen(false);
        setDetailUser(null);
      }
      // 删除的是本页最后一条时回退一页，避免停留在空页
      if (users.length === 1 && page > 1) {
        updateParams({ page: String(page - 1) });
      } else {
        await fetchUsers();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除用户失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    const { id, status } = statusTarget;
    const target = userStatusMap[status];
    setStatusLoading(true);
    try {
      await apiPatch(`/api/admin/users/${id}`, { status });
      toast.success(`已设置用户状态为「${target.label}」`);
      setStatusTarget(null);
      await fetchUsers();
      if (detailUser?.id === id) {
        setDetailUser((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "状态修改失败");
    } finally {
      setStatusLoading(false);
    }
  };

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/users?${params.toString()}`);
  };

  const handleSelectAll = (checked: boolean) => {
    userSelection.toggleAll(users, checked);
  };

  const isAllSelected = userSelection.isAllSelected(users);
  const isSelectionIndeterminate = userSelection.isIndeterminate(users);

  const confirmBatchChange = async () => {
    if (!batchTarget || selectedIds.size === 0) return;
    const { status: targetStatus } = batchTarget;
    setBatchLoading(true);
    try {
      await apiPost<{ updated: number }>("/api/admin/users", {
        ids: Array.from(selectedIds),
        status: targetStatus,
      });
      toast.success(
        `已将选中的 ${selectedCount} 个用户设置为「${userStatusMap[targetStatus].label}」`
      );
      setBatchTarget(null);
      userSelection.clear();
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量操作失败");
    } finally {
      setBatchLoading(false);
    }
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    window.open(`/api/admin/users?export=csv&${params.toString()}`, "_blank");
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailUser(null);
    setDetailError("");
    setDetailPoints(null);
    setDetailAddresses([]);
    setDetailAdjustments([]);
    setDetailAdjustmentTotal(0);
    setDetailLevelChanges([]);
    setDetailLoginAttempts([]);
    setActiveDetailTab("basic");
    setRevealedPhone("");
    setLedgerItems([]);
    setLedgerPage(1);
    setLedgerTotalPages(0);
    try {
      const data = await apiGet<{
        user: UserDetail;
        points: UserDetailPoints;
        addresses: AddressItem[];
        spentAdjustments: { items: SpentAdjustmentItem[]; total: number };
        levelChanges: LevelChangeItem[];
        loginAttempts: LoginAttemptItem[];
      }>(`/api/admin/users/${id}`);
      setDetailUser(data.user);
      setDetailPoints(data.points);
      setDetailAddresses(data.addresses);
      setDetailAdjustments(data.spentAdjustments.items);
      setDetailAdjustmentTotal(data.spentAdjustments.total);
      setDetailLevelChanges(data.levelChanges ?? []);
      setDetailLoginAttempts(data.loginAttempts ?? []);
    } catch (err) {
      // 区分真实原因：404 才是「用户不存在」，其他错误（400/500/网络）原样展示便于排查
      setDetailError(err instanceof ApiError ? err.message : "加载失败，请稍后重试");
      apiConsole.error("获取用户详情失败:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  /** 显示完整手机号（敏感操作，服务端写审计日志） */
  const revealPhone = async () => {
    if (!detailUser || revealedPhone) return;
    setRevealingPhone(true);
    try {
      const data = await apiPost<{ phone: string }>(`/api/admin/users/${detailUser.id}`);
      setRevealedPhone(data.phone);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "获取手机号失败");
    } finally {
      setRevealingPhone(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("zh-CN");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">用户管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理注册用户</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
          >
            导出 CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchUsers}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
          <Input
            placeholder="搜索手机号/昵称..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-4">
          <Select
            options={[
              { value: "", label: "全部状态" },
              { value: "ACTIVE", label: "正常" },
              { value: "SUSPENDED", label: "冻结" },
              { value: "BANNED", label: "封禁" },
            ]}
            value={status}
            onChange={(e) => updateParams({ status: e.target.value })}
            className="w-32"
          />
          {canWriteUsers && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-charcoal/50">已选 {selectedCount} 项</span>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<CheckCircle className="h-4 w-4" />}
                onClick={() => setBatchTarget({ status: "ACTIVE" })}
              >
                恢复正常
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                leftIcon={<Lock className="h-4 w-4" />}
                onClick={() => setBatchTarget({ status: "SUSPENDED" })}
              >
                冻结
              </Button>
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Ban className="h-4 w-4" />}
                onClick={() => setBatchTarget({ status: "BANNED" })}
              >
                封禁
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 加载失败错误态 */}
      {loadError && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-red-500">{loadError}</p>
          <button
            onClick={fetchUsers}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs hover:bg-gray-50"
          >
            重试
          </button>
        </div>
      )}

      {/* 用户列表 */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              {canWriteUsers && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSelectionIndeterminate;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-brand-charcoal/20"
                    aria-label="全选"
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3">
                用户
              </th>
              <th scope="col" className="px-4 py-3">
                手机号
              </th>
              <th scope="col" className="px-4 py-3">
                会员等级
              </th>
              <th scope="col" className="px-4 py-3">
                状态
              </th>
              <th scope="col" className="px-4 py-3">
                注册时间
              </th>
              <th scope="col" className="px-4 py-3">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={canWriteUsers ? 8 : 7} />
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={canWriteUsers ? 8 : 7}>
                  <div className="flex justify-center py-12">
                    <Empty title="暂无用户" />
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-brand-charcoal/[0.03]">
                  {canWriteUsers && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => userSelection.toggle(user)}
                        className="h-4 w-4 rounded border-brand-charcoal/20"
                        aria-label={`选择 ${user.nickname || user.phone || user.id}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand-charcoal/[0.06] text-xs text-brand-charcoal/50">
                        {user.avatar && user.avatar.startsWith("http") ? (
                          <Image
                            src={user.avatar}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          user.nickname?.charAt(0) || "U"
                        )}
                      </div>
                      <span>{user.nickname || "未设置"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{user.phone || "-"}</td>
                  <td className="px-4 py-3">
                    {user.membershipLevel && membershipLevelMap[user.membershipLevel] ? (
                      <Badge variant={membershipLevelMap[user.membershipLevel].variant}>
                        {membershipLevelMap[user.membershipLevel].label}
                      </Badge>
                    ) : (
                      <span className="text-brand-charcoal/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={userStatusMap[user.status].variant}>
                      {userStatusMap[user.status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/50">
                    {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(user.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canDeleteUsers && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() =>
                            requestDeleteUser(user.id, user.nickname || user.phone || user.id)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
          onPageSizeChange={(size) => updateParams({ pageSize: String(size), page: "1" })}
        />
      </div>

      {/* 用户详情模态框 */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailUser?.nickname || detailUser?.phone || "用户详情"}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          </div>
        ) : !detailUser ? (
          <div className="flex h-64 flex-col items-center justify-center text-brand-charcoal/50">
            <User className="mb-2 h-12 w-12" />
            <p>{detailError || "用户不存在"}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 顶部：头像 + ID */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-charcoal/[0.06] text-xl text-brand-charcoal/50">
                {detailUser.avatar && detailUser.avatar.startsWith("http") ? (
                  <Image
                    src={detailUser.avatar}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  detailUser.nickname?.charAt(0) || "U"
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-medium text-brand-charcoal">
                  {detailUser.nickname || "未设置昵称"}
                </p>
                <p className="truncate font-mono text-xs text-brand-charcoal/50">
                  ID: {detailUser.id}
                </p>
              </div>
            </div>

            {/* 分区标签 */}
            <div className="flex flex-wrap gap-2 border-b border-brand-charcoal/10 pb-3">
              {(
                [
                  { key: "basic", label: "基本信息" },
                  { key: "points", label: "积分与兑换" },
                  { key: "address", label: "收货地址" },
                  { key: "spent", label: "消费记录" },
                  { key: "growth", label: "等级成长" },
                  { key: "login", label: "登录历史" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveDetailTab(t.key)}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    activeDetailTab === t.key
                      ? "bg-brand-charcoal text-white"
                      : "text-brand-charcoal/60 hover:bg-brand-charcoal/5"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 基本信息 */}
            {activeDetailTab === "basic" && (
              <div className="rounded-xl bg-brand-charcoal/[0.03] p-5">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">基本信息</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-brand-charcoal/50">
                      <Shield className="h-3.5 w-3.5" />
                      账号状态
                    </dt>
                    <dd>
                      <Badge variant={userStatusMap[detailUser.status].variant}>
                        {userStatusMap[detailUser.status].label}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-brand-charcoal/50">
                      <Smartphone className="h-3.5 w-3.5" />
                      手机号
                    </dt>
                    <dd className="flex items-center gap-2">
                      <span className="font-mono">
                        {revealedPhone || detailUser.phone || "未绑定"}
                      </span>
                      {detailUser.phoneVerified && (
                        <Badge variant="success" className="px-1.5 py-0 text-xs">
                          已验证
                        </Badge>
                      )}
                      {canRevealPhone && !revealedPhone && detailUser.phone && (
                        <Button size="sm" variant="ghost" loading={revealingPhone} onClick={revealPhone}>
                          显示完整号码
                        </Button>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="flex shrink-0 items-center gap-1.5 text-brand-charcoal/50">
                      <CalendarDays className="h-3.5 w-3.5" />
                      生日
                    </dt>
                    <dd className="flex items-center gap-2">
                      <span>
                        {detailUser.birthday
                          ? new Date(detailUser.birthday).toLocaleDateString("zh-CN")
                          : "未设置"}
                      </span>
                      {detailUser.birthdayLocked && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          已锁定
                        </Badge>
                      )}
                      {canWriteUsers && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setBirthdayInput(
                              detailUser.birthday
                                ? new Date(detailUser.birthday).toISOString().slice(0, 10)
                                : ""
                            );
                            setBirthdayEditOpen(true);
                          }}
                        >
                          修改
                        </Button>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="flex shrink-0 items-center gap-1.5 text-brand-charcoal/50">
                      <Link2 className="h-3.5 w-3.5" />
                      第三方平台绑定
                    </dt>
                    <dd className="flex flex-col items-end gap-1.5">
                      {detailUser.externalIdentities && detailUser.externalIdentities.length > 0 ? (
                        detailUser.externalIdentities.map((identity) => (
                          <div key={identity.id} className="flex items-center gap-2">
                            <Badge variant="outline" className="px-1.5 py-0 text-xs">
                              {providerLabelMap[identity.provider] || identity.provider}
                            </Badge>
                            {getIdentityNickname(identity.metadata) && (
                              <span className="max-w-[10rem] truncate text-brand-charcoal/70">
                                {getIdentityNickname(identity.metadata)}
                              </span>
                            )}
                            <span className="text-xs text-brand-charcoal/40">
                              {formatDate(identity.createdAt)}
                            </span>
                            {canWriteUsers && (
                              <button
                                type="button"
                                onClick={() =>
                                  setIdentityUnbindTarget({
                                    id: identity.id,
                                    label: providerLabelMap[identity.provider] || identity.provider,
                                  })
                                }
                                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                              >
                                解绑
                              </button>
                            )}
                          </div>
                        ))
                      ) : detailUser.wechatOpenId ? (
                        // 双写过渡期兜底：迁移前历史数据可能仅有旧列
                        <Badge variant="success" className="px-1.5 py-0 text-xs">
                          微信已绑定（历史数据）
                        </Badge>
                      ) : (
                        <span className="text-brand-charcoal/50">未绑定</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">注册时间</dt>
                    <dd>{formatDate(detailUser.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">最后更新</dt>
                    <dd>{formatDate(detailUser.updatedAt)}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-brand-charcoal/15 pt-4">
                  {canWriteUsers && (
                    <>
                      {detailUser.status !== "ACTIVE" && (
                        <Button
                          size="sm"
                          leftIcon={<CheckCircle className="h-4 w-4" />}
                          loading={statusLoading}
                          onClick={() => updateUserStatus(detailUser.id, "ACTIVE")}
                        >
                          恢复正常
                        </Button>
                      )}
                      {detailUser.status !== "SUSPENDED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-200 text-amber-700 hover:bg-amber-50"
                          leftIcon={<Lock className="h-4 w-4" />}
                          loading={statusLoading}
                          onClick={() => updateUserStatus(detailUser.id, "SUSPENDED")}
                        >
                          冻结账号
                        </Button>
                      )}
                      {detailUser.status !== "BANNED" && (
                        <Button
                          size="sm"
                          variant="danger"
                          leftIcon={<Ban className="h-4 w-4" />}
                          loading={statusLoading}
                          onClick={() => updateUserStatus(detailUser.id, "BANNED")}
                        >
                          封禁账号
                        </Button>
                      )}
                    </>
                  )}
                  {canSecurityWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<KeyRound className="h-4 w-4" />}
                      onClick={() => setResetPasswordOpen(true)}
                    >
                      重置密码
                    </Button>
                  )}
                  {canDeleteUsers && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() =>
                        requestDeleteUser(
                          detailUser.id,
                          detailUser.nickname || detailUser.phone || detailUser.id
                        )
                      }
                    >
                      删除用户
                    </Button>
                  )}
                  {!canWriteUsers && !canSecurityWrite && !canDeleteUsers && (
                    <p className="text-xs text-brand-charcoal/40">
                      账号状态变更、密码重置与删除需要更高权限
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 积分与兑换 */}
            {activeDetailTab === "points" && (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 rounded-xl bg-brand-charcoal/[0.03] p-4">
                    <p className="text-xs text-brand-charcoal/50">可用积分</p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-brand-charcoal">
                      {detailPoints ? detailPoints.available.toLocaleString() : "-"}
                    </p>
                  </div>
                  <div className="flex-1 rounded-xl bg-brand-charcoal/[0.03] p-4">
                    <p className="text-xs text-brand-charcoal/50">冻结积分</p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-brand-charcoal">
                      {detailPoints ? detailPoints.frozen.toLocaleString() : "-"}
                    </p>
                  </div>
                  {canSecurityWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Wallet className="h-4 w-4" />}
                      onClick={() => setAdjustOpen(true)}
                    >
                      调整积分
                    </Button>
                  )}
                </div>

                {/* 积分流水 */}
                <div>
                  <h3 className="mb-2 text-sm font-medium text-brand-charcoal">积分流水</h3>
                  {ledgerLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-charcoal/30" />
                    </div>
                  ) : ledgerItems.length === 0 ? (
                    <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无积分流水</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {ledgerItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-brand-charcoal/10 bg-white px-4 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-xs text-brand-charcoal/60">
                                {POINT_TYPE_LABELS[item.type] || item.type}
                              </span>
                              {item.note && (
                                <span className="truncate text-xs text-brand-charcoal/40">
                                  {item.note}
                                </span>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span
                                className={`font-mono text-sm font-medium ${
                                  item.amount > 0 ? "text-emerald-600" : "text-red-500"
                                }`}
                              >
                                {item.amount > 0 ? `+${item.amount}` : item.amount}
                              </span>
                              <span className="text-xs text-brand-charcoal/40">
                                {formatDate(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {ledgerTotalPages > 1 && (
                        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-brand-charcoal/50">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={ledgerPage <= 1 || ledgerLoading}
                            onClick={() => detailUser && fetchLedger(detailUser.id, ledgerPage - 1)}
                          >
                            上一页
                          </Button>
                          <span>
                            {ledgerPage}/{ledgerTotalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={ledgerPage >= ledgerTotalPages || ledgerLoading}
                            onClick={() => detailUser && fetchLedger(detailUser.id, ledgerPage + 1)}
                          >
                            下一页
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-brand-charcoal">
                    积分兑换记录
                    {detailPoints && detailPoints.redemptionTotal > 0 && (
                      <span className="ml-2 text-xs font-normal text-brand-charcoal/40">
                        共 {detailPoints.redemptionTotal} 条，展示最近 {detailPoints.redemptions.length} 条
                      </span>
                    )}
                  </h3>
                  {!detailPoints || detailPoints.redemptions.length === 0 ? (
                    <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无兑换记录</p>
                  ) : (
                    <div className="space-y-2">
                      {detailPoints.redemptions.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg border border-brand-charcoal/10 bg-white px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-medium text-brand-charcoal">
                                {r.productName}
                              </p>
                              <span className="shrink-0 text-xs text-brand-charcoal/40">
                                {r.points.toLocaleString()} 分
                              </span>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                                REDEMPTION_STATUS_BADGES[r.status]
                              }`}
                            >
                              {REDEMPTION_STATUS_LABELS[r.status]}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-charcoal/50">
                            <span>{formatDate(r.createdAt)}</span>
                            <span>参考价 ¥{r.priceYuan.toLocaleString()}</span>
                            {r.waybillNo && (
                              <span>
                                {r.carrier === "SF" ? "顺丰" : "快递"} · {r.waybillNo}
                              </span>
                            )}
                          </div>
                          {r.address && (
                            <p className="mt-1 text-xs text-brand-charcoal/50">
                              快照收货：{r.recipient} {r.phone} {r.address}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 登录历史 */}
            {activeDetailTab === "login" && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-brand-charcoal">
                  登录历史
                  {detailLoginAttempts.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-brand-charcoal/40">
                      展示最近 {detailLoginAttempts.length} 条
                    </span>
                  )}
                </h3>
                {detailLoginAttempts.length === 0 ? (
                  <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无登录记录</p>
                ) : (
                  <div className="space-y-2">
                    {detailLoginAttempts.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-charcoal/10 bg-white px-4 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`inline-flex h-2 w-2 flex-shrink-0 rounded-full ${
                              a.success ? "bg-emerald-500" : "bg-red-500"
                            }`}
                          />
                          <span className="text-sm text-brand-charcoal/80">
                            {LOGIN_TYPE_LABELS[a.type] || a.type}
                          </span>
                          {!a.success && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                              {a.reason || "失败"}
                            </span>
                          )}
                          {a.clientId && (
                            <span className="text-xs text-brand-charcoal/40">{a.clientId}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-brand-charcoal/40">
                          {a.ipAddress && <span className="font-mono">{a.ipAddress}</span>}
                          <span>{formatDate(a.createdAt)}</span>
                        </div>
                        {a.userAgent && (
                          <p className="w-full truncate text-xs text-brand-charcoal/30" title={a.userAgent}>
                            {a.userAgent}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 收货地址 */}
            {activeDetailTab === "address" && (
              <div>
                {detailAddresses.length === 0 ? (
                  <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无收货地址</p>
                ) : (
                  <div className="space-y-2">
                    {detailAddresses.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-brand-charcoal/10 bg-white px-4 py-3"
                      >
                        <p className="text-sm font-medium text-brand-charcoal">
                          {a.recipient}
                          <span className="ml-2 text-xs font-normal text-brand-charcoal/50">
                            {a.phone}
                          </span>
                          {a.isDefault && (
                            <span className="ml-2 rounded-full bg-brand-charcoal/10 px-2 py-0.5 text-xs text-brand-charcoal/70">
                              默认
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-brand-charcoal/60">
                          {a.region} {a.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 消费记录 */}
            {activeDetailTab === "spent" && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-brand-charcoal">
                  消费补录记录
                  {detailAdjustmentTotal > 0 && (
                    <span className="ml-2 text-xs font-normal text-brand-charcoal/40">
                      共 {detailAdjustmentTotal} 条，展示最近 {detailAdjustments.length} 条
                    </span>
                  )}
                </h3>
                {detailAdjustments.length === 0 ? (
                  <p className="py-4 text-center text-sm text-brand-charcoal/40">暂无消费记录</p>
                ) : (
                  <div className="space-y-2">
                    {detailAdjustments.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-brand-charcoal/10 bg-white px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate font-mono text-sm text-brand-charcoal">
                              {a.orderNo}
                            </p>
                            <span className="shrink-0 text-xs text-brand-charcoal/40">
                              {SPENT_CHANNEL_LABELS[a.channel as keyof typeof SPENT_CHANNEL_LABELS] ??
                                a.channel}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                              ADJUSTMENT_STATUS_BADGES[a.status]
                            }`}
                          >
                            {SPENT_STATUS_LABELS[a.status]}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-charcoal/50">
                          <span>{formatDate(a.createdAt)}</span>
                          {a.amountClaimed != null && (
                            <span>申报 ¥{a.amountClaimed.toLocaleString()}</span>
                          )}
                          {a.reviewAmount != null && (
                            <span className="text-emerald-700">
                              入账 ¥{a.reviewAmount.toLocaleString()}
                            </span>
                          )}
                        </div>
                        {a.status === "REJECTED" && a.reviewNote && (
                          <p className="mt-1 text-xs text-red-600">驳回原因：{a.reviewNote}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 等级成长 */}
            {activeDetailTab === "growth" && (
              <div className="rounded-xl bg-brand-charcoal/[0.03] p-5">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">等级成长</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1.5 text-brand-charcoal/50">
                      <Award className="h-3.5 w-3.5" />
                      会员等级
                    </dt>
                    <dd>
                      {detailUser.membershipLevel &&
                      membershipLevelMap[detailUser.membershipLevel] ? (
                        <Badge variant={membershipLevelMap[detailUser.membershipLevel].variant}>
                          {membershipLevelMap[detailUser.membershipLevel].label}
                        </Badge>
                      ) : (
                        <span className="text-brand-charcoal/40">未设置</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1.5 text-brand-charcoal/50">
                      <Wallet className="h-3.5 w-3.5" />
                      累计消费
                    </dt>
                    <dd className="font-mono font-medium">
                      {detailUser.totalSpent != null
                        ? `¥${detailUser.totalSpent.toLocaleString()}`
                        : "¥0"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">银卡激活时间</dt>
                    <dd>{detailUser.silverActivatedAt ? formatDate(detailUser.silverActivatedAt) : "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">金卡激活时间</dt>
                    <dd>{detailUser.goldActivatedAt ? formatDate(detailUser.goldActivatedAt) : "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">钻石卡激活时间</dt>
                    <dd>
                      {detailUser.diamondActivatedAt ? formatDate(detailUser.diamondActivatedAt) : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 border-t border-brand-charcoal/15 pt-3 text-xs text-brand-charcoal/40">
                  激活时间为首次达到该等级的时间（等级按累计消费实时判定，可升可降）
                </p>

                {/* 等级变更轨迹（升/降档记录） */}
                <div className="mt-4 border-t border-brand-charcoal/15 pt-4">
                  <h4 className="mb-2 text-sm font-medium text-brand-charcoal">等级变更轨迹</h4>
                  {detailLevelChanges.length === 0 ? (
                    <p className="py-2 text-sm text-brand-charcoal/40">
                      暂无等级变更记录（注册即为当前等级）
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detailLevelChanges.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-brand-charcoal/10 bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Badge
                              variant={membershipLevelMap[c.fromLevel]?.variant ?? "secondary"}
                            >
                              {membershipLevelMap[c.fromLevel]?.label ?? c.fromLevel}
                            </Badge>
                            <span className="text-brand-charcoal/40">→</span>
                            <Badge
                              variant={membershipLevelMap[c.toLevel]?.variant ?? "secondary"}
                            >
                              {membershipLevelMap[c.toLevel]?.label ?? c.toLevel}
                            </Badge>
                          </div>
                          <span className="shrink-0 text-xs text-brand-charcoal/40">
                            {formatDate(c.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 人工调整积分弹窗 */}
      <Modal
        open={adjustOpen}
        onClose={() => {
          if (!adjusting) setAdjustOpen(false);
        }}
        title="调整用户积分"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/60">
            正数为增加（6 个月有效期，可参与兑礼与过期清理），负数为扣减（直接冲减可用积分，可为负）。
            操作将写入审计日志，请填写可追溯的原因。
          </p>
          <Input
            label="调整分值"
            required
            type="number"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            placeholder="如 100 或 -50"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-charcoal/80">
              调整原因<span className="ml-0.5 text-red-500">*</span>
            </label>
            <textarea
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="如：客服补偿 / 退款冲正 / 活动奖励"
              className="w-full resize-y rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2 text-sm text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>
              取消
            </Button>
            <Button onClick={handleAdjustPoints} loading={adjusting}>
              确认调整
            </Button>
          </div>
        </div>
      </Modal>

      {/* 修改生日弹窗 */}
      <Modal
        open={birthdayEditOpen}
        onClose={() => {
          if (!birthdaySaving) setBirthdayEditOpen(false);
        }}
        title="修改用户生日"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/60">
            生日用于生日积分发放（每年一次）。保存后会自动锁定；留空保存将清除生日并解锁，
            用户可自行重新设置。操作将写入审计日志。
          </p>
          <Input
            label="生日"
            type="date"
            value={birthdayInput}
            min="1900-01-01"
            // 生日不能晚于今天，避免未来日期影响生日积分发放
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthdayInput(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleUnlockBirthday}
              disabled={!detailUser?.birthdayLocked || birthdaySaving}
            >
              仅解锁（不改生日）
            </Button>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setBirthdayEditOpen(false)}
                disabled={birthdaySaving}
              >
                取消
              </Button>
              <Button onClick={handleSaveBirthday} loading={birthdaySaving}>
                保存
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 解绑外部身份确认 */}
      <ConfirmDialog
        open={!!identityUnbindTarget}
        onClose={() => setIdentityUnbindTarget(null)}
        onConfirm={confirmIdentityUnbind}
        title="解绑外部身份"
        description={`确定解绑「${identityUnbindTarget?.label ?? ""}」吗？解绑后该平台将无法登录此账号，用户可在登录页重新绑定。`}
        confirmText="确认解绑"
        type="danger"
        loading={identityUnbinding}
      />

      {/* 重置密码确认 */}
      <ConfirmDialog
        open={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
        onConfirm={confirmResetPassword}
        title="重置用户密码"
        description={`确定重置「${detailUser?.nickname || detailUser?.phone || ""}」的密码吗？将生成一次性临时密码，并强制下线该用户全部会话（含 SSO）。`}
        confirmText="确认重置"
        type="danger"
        loading={resetPasswordLoading}
      />

      {/* 临时密码展示（仅一次） */}
      <Modal
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="临时密码（仅显示一次）"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/60">
            请立即通过安全渠道将临时密码告知用户，关闭本窗口后无法再次查看。
            用户所有会话已被强制下线，需使用该密码重新登录并尽快修改密码。
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-brand-charcoal/[0.04] px-4 py-3">
            <code className="flex-1 select-all break-all font-mono text-sm text-brand-charcoal">
              {tempPassword}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!tempPassword) return;
                try {
                  await navigator.clipboard.writeText(tempPassword);
                  toast.success("已复制");
                } catch {
                  toast.error("复制失败，请手动选择复制");
                }
              }}
            >
              复制
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setTempPassword(null)}>我已保存</Button>
          </div>
        </div>
      </Modal>

      {/* 状态变更确认 */}
      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        title="修改用户状态"
        description={
          statusTarget
            ? `确定要将该用户状态设置为「${userStatusMap[statusTarget.status].label}」吗？${userStatusMap[statusTarget.status].description}`
            : ""
        }
        confirmText="确认修改"
        loading={statusLoading}
      />

      {/* 批量状态变更确认 */}
      <ConfirmDialog
        open={!!batchTarget}
        onClose={() => setBatchTarget(null)}
        onConfirm={confirmBatchChange}
        title="批量修改用户状态"
        description={
          batchTarget
            ? `确定要将选中的 ${selectedCount} 个用户状态设置为「${userStatusMap[batchTarget.status].label}」吗？${userStatusMap[batchTarget.status].description}`
            : ""
        }
        confirmText={`确认${batchTarget ? userStatusMap[batchTarget.status].label : ""}`}
        loading={batchLoading}
      />

      {/* 删除用户确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteUser}
        title="删除用户"
        description={
          deleteTarget
            ? `确定要删除用户「${deleteTarget.label}」吗？该操作将封禁账号并匿名化全部个人数据（GDPR 合规），不可恢复。`
            : ""
        }
        type="danger"
        confirmText="确认删除"
        loading={deleteLoading}
      />

      {/* 资金类操作二次验证 */}
      {totpModal}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequirePermission permission="users:read">
      <AdminUsersContent />
    </RequirePermission>
  );
}
