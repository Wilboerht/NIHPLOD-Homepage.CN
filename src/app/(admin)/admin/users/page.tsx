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

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const [searchInput, setSearchInput] = useState(search);

  // 批量操作状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    "basic" | "points" | "address" | "spent" | "growth"
  >("basic");
  const [revealedPhone, setRevealedPhone] = useState("");
  const [revealingPhone, setRevealingPhone] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; status: UserStatus } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
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
      setLoadError("");
      setUsers(data.users);
      setPagination(data.pagination);
    } catch {
      console.error("获取用户失败");
      setLoadError("列表加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status]);

  useEffect(() => {
    deferInEffect(fetchUsers);
  }, [fetchUsers]);

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
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (detailUser?.id === id) {
        setDetailOpen(false);
        setDetailUser(null);
      }
      await fetchUsers();
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
    if (checked) {
      setSelectedIds(new Set(users.map((u) => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = users.length > 0 && selectedIds.size === users.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmBatchChange = async () => {
    if (!batchTarget || selectedIds.size === 0) return;
    const { status: targetStatus } = batchTarget;
    setBatchLoading(true);
    try {
      await apiPost<{ message: string }>("/api/admin/users", {
        ids: Array.from(selectedIds),
        status: targetStatus,
      });
      toast.success(
        `已将选中的 ${selectedIds.size} 个用户设置为「${userStatusMap[targetStatus].label}」`
      );
      setBatchTarget(null);
      setSelectedIds(new Set());
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
    setActiveDetailTab("basic");
    setRevealedPhone("");
    try {
      const data = await apiGet<{
        user: UserDetail;
        points: UserDetailPoints;
        addresses: AddressItem[];
        spentAdjustments: { items: SpentAdjustmentItem[]; total: number };
        levelChanges: LevelChangeItem[];
      }>(`/api/admin/users/${id}`);
      setDetailUser(data.user);
      setDetailPoints(data.points);
      setDetailAddresses(data.addresses);
      setDetailAdjustments(data.spentAdjustments.items);
      setDetailAdjustmentTotal(data.spentAdjustments.total);
      setDetailLevelChanges(data.levelChanges ?? []);
    } catch (err) {
      // 区分真实原因：404 才是「用户不存在」，其他错误（400/500/网络）原样展示便于排查
      setDetailError(err instanceof ApiError ? err.message : "加载失败，请稍后重试");
      console.error("获取用户详情失败:", err);
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
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-charcoal/50">已选 {selectedIds.size} 项</span>
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
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-charcoal/20"
                  aria-label="全选"
                />
              </th>
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
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={8} />)
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex justify-center py-12">
                    <Empty title="暂无用户" />
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-brand-charcoal/[0.03]">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleSelect(user.id)}
                      className="h-4 w-4 rounded border-brand-charcoal/20"
                      aria-label={`选择 ${user.nickname || user.phone || user.id}`}
                    />
                  </td>
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
                      {!revealedPhone && detailUser.phone && (
                        <Button size="sm" variant="ghost" loading={revealingPhone} onClick={revealPhone}>
                          显示完整号码
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

                <div className="mt-5 flex flex-wrap gap-2 border-t border-brand-charcoal/15 pt-4">
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
                </div>
              </div>
            )}

            {/* 积分与兑换 */}
            {activeDetailTab === "points" && (
              <div className="space-y-4">
                <div className="flex gap-4">
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
            ? `确定要将选中的 ${selectedIds.size} 个用户状态设置为「${userStatusMap[batchTarget.status].label}」吗？${userStatusMap[batchTarget.status].description}`
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
    </div>
  );
}
