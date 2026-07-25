"use client";

/**
 * 用户管理页面
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  RefreshCw,
  Eye,
  User,
  Loader2,
  MapPin,
  Ticket,
  Smartphone,
  MessageCircle,
  Shield,
  Ban,
  CheckCircle,
  Lock,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet, apiPatch } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

interface UserItem {
  id: string;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  status: UserStatus;
  orderCount: number;
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

interface UserDetail {
  id: string;
  phone: string | null;
  phoneVerified: boolean;
  nickname: string | null;
  avatar: string | null;
  status: UserStatus;
  wechatOpenId: string | null;
  createdAt: string;
  updatedAt: string;
  orders: {
    id: string;
    orderNo: string;
    status: string;
    payAmount: number;
    createdAt: string;
  }[];
  addresses: {
    id: string;
    name: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    isDefault: boolean;
  }[];
  userCoupons: {
    id: string;
    coupon: {
      name: string;
      type: string;
      value: number;
    };
  }[];
  _count: { orders: number };
}

const orderStatusMap: Record<
  string,
  {
    label: string;
    variant: "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "outline";
  }
> = {
  PENDING: { label: "待支付", variant: "warning" },
  PAYING: { label: "支付中", variant: "primary" },
  PAID: { label: "已支付", variant: "success" },
  PROCESSING: { label: "处理中", variant: "primary" },
  SHIPPED: { label: "已发货", variant: "success" },
  DELIVERED: { label: "已签收", variant: "success" },
  COMPLETED: { label: "已完成", variant: "default" },
  CANCELLED: { label: "已取消", variant: "danger" },
  REFUNDING: { label: "退款中", variant: "warning" },
  REFUNDED: { label: "已退款", variant: "danger" },
};

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; status: UserStatus } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ users: UserItem[]; pagination: typeof pagination }>(
        "/api/admin/users",
        {
          page,
          search,
        }
      );
      setUsers(data.users);
      setPagination(data.pagination);
    } catch {
      console.error("获取用户失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateUserStatus = (userId: string, status: UserStatus) => {
    setStatusTarget({ id: userId, status });
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

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailUser(null);
    try {
      const data = await apiGet<{ user: UserDetail }>(`/api/admin/users/${id}`);
      setDetailUser(data.user);
    } catch {
      console.error("获取用户详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("zh-CN");
  };

  const formatDateShort = (date: string) => {
    return new Date(date).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">用户管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理注册用户</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={fetchUsers}>
          刷新
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-4 rounded-xl bg-white p-4 shadow-sm">
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
      </div>

      {/* 用户列表 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
              <th scope="col" className="px-4 py-3">用户</th>
              <th scope="col" className="px-4 py-3">手机号</th>
              <th scope="col" className="px-4 py-3">状态</th>
              <th scope="col" className="px-4 py-3">订单数</th>
              <th scope="col" className="px-4 py-3">注册时间</th>
              <th scope="col" className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={6} />
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brand-charcoal/50">
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-brand-charcoal/[0.03]">
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
                    <Badge variant={userStatusMap[user.status].variant}>
                      {userStatusMap[user.status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{user.orderCount}</td>
                  <td className="px-4 py-3 text-brand-charcoal/50">
                    {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(user.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
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
            <p>用户不存在</p>
          </div>
        ) : (
          <div className="space-y-6">
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
                <p className="truncate font-mono text-xs text-brand-charcoal/50">ID: {detailUser.id}</p>
              </div>
            </div>

            {/* 基本信息 + 账号状态 */}
            <div className="grid gap-4 md:grid-cols-2">
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
                      {detailUser.phone || "未绑定"}
                      {detailUser.phoneVerified && (
                        <Badge variant="success" className="px-1.5 py-0 text-xs">
                          已验证
                        </Badge>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-brand-charcoal/50">
                      <MessageCircle className="h-3.5 w-3.5" />
                      微信绑定
                    </dt>
                    <dd>
                      {detailUser.wechatOpenId ? (
                        <Badge variant="success" className="px-1.5 py-0 text-xs">
                          已绑定
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
                </div>
              </div>

              <div className="rounded-xl bg-brand-charcoal/[0.03] p-5">
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">数据统计</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">订单数量</dt>
                    <dd className="font-medium">{detailUser._count?.orders ?? 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">收货地址</dt>
                    <dd className="font-medium">{detailUser.addresses?.length ?? 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-charcoal/50">可用优惠券</dt>
                    <dd className="font-medium">{detailUser.userCoupons?.length ?? 0}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* 收货地址 */}
            {detailUser.addresses && detailUser.addresses.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-brand-charcoal">
                  <MapPin className="h-4 w-4" />
                  收货地址
                </h3>
                <div className="space-y-2">
                  {detailUser.addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="rounded-xl border border-brand-charcoal/8 bg-white p-4 text-sm"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">
                          {addr.name} {addr.phone}
                        </span>
                        {addr.isDefault && (
                          <Badge variant="success" className="px-1.5 py-0 text-xs">
                            默认
                          </Badge>
                        )}
                      </div>
                      <p className="text-brand-charcoal/50">
                        {addr.province} {addr.city} {addr.district} {addr.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 优惠券 */}
            {detailUser.userCoupons && detailUser.userCoupons.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-brand-charcoal">
                  <Ticket className="h-4 w-4" />
                  可用优惠券
                </h3>
                <div className="flex flex-wrap gap-2">
                  {detailUser.userCoupons.map((uc) => (
                    <div
                      key={uc.id}
                      className="rounded-lg border border-dashed border-brand-primary/40 bg-brand-primary/5 px-3 py-1.5 text-xs"
                    >
                      <span className="font-medium text-brand-charcoal">{uc.coupon.name}</span>
                      <span className="ml-1 text-brand-primary">
                        {uc.coupon.type === "DISCOUNT_PERCENT"
                          ? `${(uc.coupon.value * 10).toFixed(1)}折`
                          : `¥${uc.coupon.value}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 最近订单 */}
            {detailUser.orders && detailUser.orders.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium text-brand-charcoal">最近订单</h3>
                <div className="overflow-hidden rounded-xl border border-brand-charcoal/8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left text-brand-charcoal/60">
                        <th scope="col" className="px-4 py-2 font-medium">订单号</th>
                        <th scope="col" className="px-4 py-2 font-medium">状态</th>
                        <th scope="col" className="px-4 py-2 font-medium">金额</th>
                        <th scope="col" className="px-4 py-2 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detailUser.orders.map((order) => {
                        const status = orderStatusMap[order.status] || {
                          label: order.status,
                          variant: "default",
                        };
                        return (
                          <tr key={order.id} className="hover:bg-brand-charcoal/[0.03]">
                            <td className="px-4 py-2">
                              <button
                                className="text-brand-primary hover:underline"
                                onClick={() => router.push(`/admin/orders/${order.id}`)}
                              >
                                {order.orderNo}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant={status.variant} className="px-1.5 py-0 text-xs">
                                {status.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">¥{order.payAmount}</td>
                            <td className="px-4 py-2 text-brand-charcoal/50">
                              {formatDateShort(order.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
    </div>
  );
}
