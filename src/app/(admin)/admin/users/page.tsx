"use client";

/**
 * 用户管理页面
 */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  RefreshCw,
  Download,
  Eye,
  User,
  Smartphone,
  Ban,
  CheckCircle,
  Lock,
  Award,
  Wallet,
  Trash2,
  KeyRound,
  MapPin,
  ReceiptText,
  History,
  Sparkles,
  Copy,
  X,
  LayoutDashboard,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Empty } from "@/components/ui/Empty";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/api-client";
import { downloadFromUrl } from "@/lib/client-download";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { createClientRequestId } from "@/lib/request-id";
import { useRowSelection } from "@/hooks/useRowSelection";
import { apiConsole } from "@/lib/logger";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/admin/PageHeader";
import { UserAvatar } from "@/components/admin/UserAvatar";
import { UserAdvisorPanel } from "@/components/admin/UserAdvisorPanel";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  ApprovalRequestDialog,
  type ApprovalInitialValues,
} from "@/components/admin/ApprovalRequestDialog";
import type { ApprovalPolicyKey } from "@/lib/admin-approval-policy";
import { SPENT_CHANNEL_LABELS, SPENT_STATUS_LABELS } from "@/lib/spent-adjustment-meta";
import type { UserExportGroup } from "@/lib/user-export";
import { UserExportDialog } from "./UserExportDialog";

type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";

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
  BANNED: {
    label: "封禁",
    variant: "danger",
    description: "长期封禁，用户不能自助恢复；非 super admin 解封需 owner 审批",
  },
  DELETED: { label: "已注销", variant: "secondary", description: "账号已注销并匿名化，不可恢复" },
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

type DetailTab =
  "overview" | "basic" | "advisor" | "points" | "address" | "spent" | "growth" | "login";

const DETAIL_TABS: { key: DetailTab; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "概览", icon: LayoutDashboard },
  { key: "basic", label: "账号资料", icon: User },
  { key: "advisor", label: "测肤档案", icon: Sparkles },
  { key: "points", label: "积分与兑换", icon: Wallet },
  { key: "address", label: "收货地址", icon: MapPin },
  { key: "spent", label: "消费记录", icon: ReceiptText },
  { key: "growth", label: "等级成长", icon: Award },
  { key: "login", label: "登录历史", icon: History },
];

function DetailSection({
  title,
  action,
  children,
  bodyClassName,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-brand-charcoal/10 bg-white",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-brand-charcoal">{title}</h3>
        {action}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-brand-charcoal/65">{label}</dt>
      <dd className="mt-1 text-sm text-brand-charcoal">{children}</dd>
    </div>
  );
}

/** 紧凑的两列信息行：标签固定宽度，值占满剩余空间，适合工具型详情面板 */
function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[5.5rem_1fr] items-start gap-3 py-2.5 sm:grid-cols-[6rem_1fr]",
        className
      )}
    >
      <dt className="text-xs leading-5 text-brand-charcoal/65">{label}</dt>
      <dd className="min-w-0 text-sm leading-5 text-brand-charcoal">{children}</dd>
    </div>
  );
}

function UserDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-brand-charcoal/10 bg-white p-4">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-brand-charcoal/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-5 w-16 animate-pulse rounded-full bg-brand-charcoal/[0.06]" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-brand-charcoal/[0.06]" />
          </div>
          <div className="h-3 w-48 animate-pulse rounded bg-brand-charcoal/[0.06]" />
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex shrink-0 gap-1 overflow-hidden rounded-xl border border-brand-charcoal/10 bg-white p-1 lg:w-44 lg:flex-col">
          {Array.from({ length: DETAIL_TABS.length }).map((_, index) => (
            <div
              key={index}
              className="h-8 w-20 shrink-0 animate-pulse rounded-lg bg-brand-charcoal/[0.06] lg:w-full"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-xl border border-brand-charcoal/10 bg-white">
            <div className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] px-4 py-2.5">
              <div className="h-4 w-20 animate-pulse rounded bg-brand-charcoal/[0.06]" />
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-brand-charcoal/[0.06]" />
                  <div className="h-4 w-24 animate-pulse rounded bg-brand-charcoal/[0.06]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UserDetail {
  id: string;
  phone: string | null;
  phoneVerified: boolean;
  nickname: string | null;
  avatar: string | null;
  gender: string | null;
  status: UserStatus;
  membershipLevel: string | null;
  totalSpent: number | null;
  silverActivatedAt: string | null;
  goldActivatedAt: string | null;
  diamondActivatedAt: string | null;
  wechatOpenId: string | null;
  wechatUnionId: string | null;
  birthday: string | null;
  birthdayLocked: boolean;
  // 多平台外部身份（聚合框架单一数据源）
  externalIdentities?: {
    id: string;
    provider: string;
    subjectId: string;
    unionId: string | null;
    metadata: unknown;
    // 来源小程序（metadata.mpClientId 解析；存量行无此字段）
    mpClientId?: string | null;
    clientName?: string | null;
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
  REDEEM_REFUND: "兑换撤销退分",
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

  const runWithStepUp = async <T,>(run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      if (!isTotpRequired(err)) throw err;
      const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
      if (!verified) return null;
      return run();
    }
  };

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const rawPage = Number(searchParams.get("page") || "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(1000, Math.trunc(rawPage)) : 1;
  const rawPageSize = Number(searchParams.get("pageSize") || "20");
  const pageSize = [10, 20, 50, 100].includes(rawPageSize) ? rawPageSize : 20;
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const level = searchParams.get("level") || "";
  const [searchInput, setSearchInput] = useState(search);
  // 浏览器前进/后退时同步搜索框，避免输入框与 URL 筛选不一致
  const [prevSearch, setPrevSearch] = useState(search);
  if (prevSearch !== search) {
    setPrevSearch(search);
    setSearchInput(search);
  }

  // 批量操作状态（翻页/筛选/搜索变化时自动清空勾选）
  const userSelection = useRowSelection<UserItem>(
    (u) => u.id,
    `${page}|${pageSize}|${search}|${status}|${level}`
  );
  const { selectedIds, selectedCount } = userSelection;
  const [batchTarget, setBatchTarget] = useState<{ status: UserStatus } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // 模态框状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailPoints, setDetailPoints] = useState<UserDetailPoints | null>(null);
  const [detailAddresses, setDetailAddresses] = useState<AddressItem[]>([]);
  const [detailAdjustments, setDetailAdjustments] = useState<SpentAdjustmentItem[]>([]);
  const [detailAdjustmentTotal, setDetailAdjustmentTotal] = useState(0);
  const [detailLevelChanges, setDetailLevelChanges] = useState<LevelChangeItem[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
  const [detailLoginAttempts, setDetailLoginAttempts] = useState<LoginAttemptItem[]>([]);
  // 登录历史：仅看失败（在最近返回的数据内前端筛选）
  const [loginFailedOnly, setLoginFailedOnly] = useState(false);

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
  const [tempPasswordSaved, setTempPasswordSaved] = useState(false);

  // 权限（导航与按钮按权限点收敛，服务端为最终权威）
  const { can: canAdmin, role } = useAdminPermissions();
  const isOwnerActor = role === "owner";
  const canExportUsers = canAdmin("users:export");
  const canWriteUsers = canAdmin("users:write");
  const canDeleteUsers = canAdmin("users:delete");
  const canSecurityWrite = canAdmin("users:security:write");
  const canAdjustPoints = canAdmin("points:adjust");
  const canRevealPhone = canAdmin("users:sensitive:read");
  const canReadAdvisorProfile = canAdmin("advisor:users:read");
  const canReadAdvisorReport = canAdmin("advisor:report:read");
  const canRequestApproval = canAdmin("approvals:request");
  const [approvalTarget, setApprovalTarget] = useState<{
    policyKey: ApprovalPolicyKey;
    values: ApprovalInitialValues;
  } | null>(null);

  const copyText = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label}已复制`);
      } catch {
        toast.error("复制失败，请手动选择复制");
      }
    },
    [toast]
  );

  /** Tabs 键盘导航：方向键切换，Home/End 跳到首尾 */
  const handleDetailTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tabs: typeof DETAIL_TABS
  ) => {
    const { key } = event;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.key === activeDetailTab);
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? tabs.length - 1
          : key === "ArrowRight" || key === "ArrowDown"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    setActiveDetailTab(nextTab.key);
    document.getElementById(`detail-tab-${nextTab.key}`)?.focus();
  };

  // 积分流水与人工调整
  const [ledgerItems, setLedgerItems] = useState<PointLedgerItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  // 资金操作幂等键：弹窗打开时生成，网络超时/重试复用，避免重复加减积分
  const adjustRequestIdRef = useRef<string | null>(null);
  const initialBirthday = detailUser?.birthday
    ? new Date(detailUser.birthday).toISOString().slice(0, 10)
    : "";
  const isAdjustDirty = adjustOpen && (adjustAmount !== "" || adjustNote !== "");
  const isBirthdayDirty = birthdayEditOpen && birthdayInput !== initialBirthday;
  const { confirmClose: confirmCloseAdjust } = useUnsavedChanges(isAdjustDirty);
  const { confirmClose: confirmCloseBirthday } = useUnsavedChanges(isBirthdayDirty);
  const [revealedPhone, setRevealedPhone] = useState("");
  const [revealingPhone, setRevealingPhone] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; status: UserStatus } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const takeLatestUsers = useLatestRequest();
  const takeLatestDetail = useLatestRequest();
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
          level: level || undefined,
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
        router.push("/admin-login?reauth=1");
        return;
      }
      setLoadError(err instanceof Error ? err.message : "列表加载失败，请重试");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [page, pageSize, search, status, level, router, takeLatestUsers]);

  useEffect(() => {
    deferInEffect(fetchUsers);
  }, [fetchUsers]);

  const fetchLedger = useCallback(
    async (userId: string, targetPage: number) => {
      const isLatest = takeLatestDetail();
      setLedgerLoading(true);
      try {
        const data = await apiGet<{
          available: number;
          items: PointLedgerItem[];
          pagination: { totalPages: number };
        }>(`/api/admin/users/${userId}/points`, { page: targetPage, pageSize: 20 });
        if (!isLatest()) return;
        setLedgerItems(data.items);
        setLedgerPage(targetPage);
        setLedgerTotalPages(data.pagination.totalPages);
        // 余额以流水接口物化结果为准（含过期处理）
        setDetailPoints((prev) => (prev ? { ...prev, available: data.available } : prev));
      } catch {
        if (isLatest()) toast.error("加载积分流水失败");
      } finally {
        if (isLatest()) setLedgerLoading(false);
      }
    },
    [takeLatestDetail, toast]
  );

  // 仅按用户 id 重置流水：详情对象因状态变更刷新时不重置当前翻页
  useEffect(() => {
    if (activeDetailTab === "points" && detailUserId) {
      deferInEffect(() => fetchLedger(detailUserId, 1));
    }
  }, [activeDetailTab, detailUserId, fetchLedger]);

  const closeAdjustModal = () => {
    adjustRequestIdRef.current = null;
    setAdjustOpen(false);
    setAdjustAmount("");
    setAdjustNote("");
  };

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
      // 复用弹窗打开时生成的幂等键；兼容旧状态/直接调用时兜底生成
      if (!adjustRequestIdRef.current) {
        adjustRequestIdRef.current = createClientRequestId();
      }
      const requestId = adjustRequestIdRef.current;

      const submit = (totpCode?: string) =>
        apiPost<{ duplicated: boolean; available: number | null; amount: number }>(
          `/api/admin/users/${detailUser.id}/points`,
          {
            amount,
            note: adjustNote.trim(),
            requestId,
            totpCode,
          }
        );

      let data: { duplicated: boolean; available: number | null; amount: number };
      try {
        data = await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        data = await submit();
      }

      if (data.duplicated) {
        toast.success("该调整请求已处理过，未重复加减积分；请以最新流水为准");
      } else {
        toast.success(
          amount > 0 ? `已为该用户增加 ${amount} 积分` : `已为该用户扣减 ${-amount} 积分`
        );
      }
      adjustRequestIdRef.current = null;
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustNote("");
      await fetchLedger(detailUser.id, 1);
    } catch (err) {
      // 保留 requestId：网络超时后重试仍会命中同一幂等键
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
      const data = await runWithStepUp(() =>
        apiPatch<{ user: { birthday: string | null; birthdayLocked: boolean } }>(
          `/api/admin/users/${detailUser.id}`,
          { birthday: birthdayInput === "" ? null : birthdayInput }
        )
      );
      if (data === null) return;
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
      const result = await runWithStepUp(() =>
        apiPatch(`/api/admin/users/${detailUser.id}`, { unlockBirthday: true })
      );
      if (result === null) return;
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
      const result = await runWithStepUp(() =>
        apiDelete(`/api/admin/users/${detailUser.id}/identities/${identityUnbindTarget.id}`)
      );
      if (result === null) return;
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

  /** 重置用户密码（生成一次性临时密码，需二次验证） */
  const confirmResetPassword = async () => {
    if (!detailUser) return;
    setResetPasswordLoading(true);
    try {
      const submit = (totpCode?: string) =>
        apiPost<{ tempPassword: string }>(`/api/admin/users/${detailUser.id}/reset-password`, {
          totpCode,
        });

      let data: { tempPassword: string };
      try {
        data = await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        data = await submit();
      }

      setResetPasswordOpen(false);
      setTempPasswordSaved(false);
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
      const submit = () => apiDelete(`/api/admin/users/${id}`);
      try {
        await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        await submit();
      }
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
      const result = await runWithStepUp(() => apiPatch(`/api/admin/users/${id}`, { status }));
      if (result === null) return;
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

  const updateParams = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/users?${params.toString()}`);
  };

  // URL 中 page 越界（如从分享链接进入）时收敛到最后一页
  useEffect(() => {
    if (pagination.totalPages > 0 && page > pagination.totalPages) {
      updateParams({ page: String(pagination.totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pagination.totalPages]);

  const handleSelectAll = (checked: boolean) => {
    userSelection.toggleAll(users, checked);
  };

  const isAllSelected = userSelection.isAllSelected(users);
  const isSelectionIndeterminate = userSelection.isIndeterminate(users);

  const confirmBatchChange = async () => {
    if (!batchTarget || selectedIds.size === 0) return;
    if (!isOwnerActor) {
      toast.error("批量修改用户状态需要 owner 审批，请到详情页逐条提交申请");
      return;
    }
    const { status: targetStatus } = batchTarget;
    setBatchLoading(true);
    try {
      const result = await runWithStepUp(() =>
        apiPost<{ updated: number }>("/api/admin/users", {
          ids: Array.from(selectedIds),
          status: targetStatus,
        })
      );
      if (result === null) return;
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

  const startExport = async (groups: UserExportGroup[]) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (level) params.set("level", level);
    params.set("include", groups.join(","));
    const qs = params.toString();
    setExporting(true);
    try {
      const preflight = await runWithStepUp(() =>
        apiGet("/api/admin/users/export", {
          check: "1",
          search: search || undefined,
          status: status || undefined,
          level: level || undefined,
          include: groups.join(","),
        })
      );
      if (preflight === null) return;

      setExportOpen(false);
      const downloaded = await runWithStepUp(() =>
        downloadFromUrl(`/api/admin/users/export?${qs}`, "users-export.zip")
      );
      if (downloaded === null) return;
      toast.success("已开始生成导出文件，请保持页面打开");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (id: string) => {
    const isLatest = takeLatestDetail();
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailUserId(id);
    setDetailUser(null);
    setDetailError("");
    setDetailPoints(null);
    setDetailAddresses([]);
    setDetailAdjustments([]);
    setDetailAdjustmentTotal(0);
    setDetailLevelChanges([]);
    setDetailLoginAttempts([]);
    setActiveDetailTab("overview");
    setRevealedPhone("");
    setLedgerItems([]);
    setLedgerPage(1);
    setLedgerTotalPages(0);
    try {
      const data = await runWithStepUp(() =>
        apiGet<{
          user: UserDetail;
          points: UserDetailPoints;
          addresses: AddressItem[];
          spentAdjustments: { items: SpentAdjustmentItem[]; total: number };
          levelChanges: LevelChangeItem[];
          loginAttempts: LoginAttemptItem[];
        }>(`/api/admin/users/${id}`)
      );
      if (!isLatest()) return;
      // 取消二次验证：关闭详情弹窗，避免停留在加载骨架
      if (data === null) {
        setDetailOpen(false);
        return;
      }
      setDetailUser(data.user);
      setDetailPoints(data.points);
      setDetailAddresses(data.addresses);
      setDetailAdjustments(data.spentAdjustments.items);
      setDetailAdjustmentTotal(data.spentAdjustments.total);
      setDetailLevelChanges(data.levelChanges ?? []);
      setDetailLoginAttempts(data.loginAttempts ?? []);
    } catch (err) {
      if (!isLatest()) return;
      // 区分真实原因：404 才是「用户不存在」，其他错误（400/500/网络）原样展示便于排查
      setDetailError(err instanceof ApiError ? err.message : "加载失败，请稍后重试");
      apiConsole.error("获取用户详情失败:", err);
    } finally {
      if (isLatest()) setDetailLoading(false);
    }
  };

  /** 显示完整手机号（敏感操作，服务端写审计日志） */
  const revealPhone = async () => {
    if (!detailUser || revealedPhone) return;
    setRevealingPhone(true);
    try {
      const data = await runWithStepUp(() =>
        apiPost<{ phone: string }>(`/api/admin/users/${detailUser.id}`)
      );
      // 取消 TOTP 时 runWithStepUp 返回 null，手机号保持脱敏。
      if (data === null) return;
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

  const visibleDetailTabs = DETAIL_TABS.filter(
    (tab) => tab.key !== "advisor" || canReadAdvisorProfile
  );

  const detailMoreItems: DropdownItem[] = [];
  if (detailUser && detailUser.status !== "DELETED") {
    if (canSecurityWrite) {
      detailMoreItems.push({
        label: "重置密码",
        icon: <KeyRound className="h-3.5 w-3.5" />,
        onClick: () => setResetPasswordOpen(true),
      });
    }
    if (isOwnerActor && canWriteUsers && detailUser.status !== "SUSPENDED") {
      detailMoreItems.push({
        label: "冻结账号",
        icon: <Lock className="h-3.5 w-3.5" />,
        onClick: () => updateUserStatus(detailUser.id, "SUSPENDED"),
      });
    }
    if (isOwnerActor && canWriteUsers && detailUser.status !== "BANNED") {
      detailMoreItems.push({
        label: "封禁账号",
        icon: <Ban className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => updateUserStatus(detailUser.id, "BANNED"),
      });
    }
    if (isOwnerActor && canDeleteUsers) {
      detailMoreItems.push(
        { divider: true },
        {
          label: "删除用户",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () =>
            requestDeleteUser(
              detailUser.id,
              detailUser.nickname || detailUser.phone || detailUser.id
            ),
        }
      );
    }
    if (!isOwnerActor && canRequestApproval) {
      const approvalItems: DropdownItem[] = [];
      approvalItems.push({
        label: "申请调整积分",
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onClick: () =>
          setApprovalTarget({
            policyKey: "points.adjust",
            values: { userId: detailUser.id },
          }),
      });
      if (detailUser.status !== "SUSPENDED") {
        approvalItems.push({
          label: "申请冻结账号",
          icon: <Lock className="h-3.5 w-3.5" />,
          onClick: () =>
            setApprovalTarget({
              policyKey: "user.status",
              values: { userId: detailUser.id, status: "SUSPENDED" },
            }),
        });
      }
      if (detailUser.status !== "BANNED") {
        approvalItems.push({
          label: "申请封禁账号",
          icon: <Ban className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () =>
            setApprovalTarget({
              policyKey: "user.status",
              values: { userId: detailUser.id, status: "BANNED" },
            }),
        });
      }
      approvalItems.push({
        label: "申请删除用户",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () =>
          setApprovalTarget({
            policyKey: "user.delete",
            values: { userId: detailUser.id },
          }),
      });
      if (approvalItems.length > 0) {
        detailMoreItems.push({ divider: true }, ...approvalItems);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="用户管理"
        description="管理注册用户"
        actions={
          <>
            {canExportUsers && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={() => setExportOpen(true)}
                loading={exporting}
              >
                {exporting ? "预检中..." : "导出用户数据"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchUsers}
            >
              刷新
            </Button>
          </>
        }
      />

      {/* 工具栏：搜索 + 筛选保持同一行，避免筛选器堆叠产生大片空白 */}
      <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-sm md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
            <Input
              placeholder="搜索用户 ID/完整手机号/昵称..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
              className={searchInput ? "pl-10 pr-10" : "pl-10"}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  updateParams({ search: "" });
                }}
                aria-label="清除搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-charcoal/65 hover:text-brand-charcoal"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:items-center">
            <div className="w-full sm:w-36">
              <Select
                options={[
                  { value: "", label: "全部状态" },
                  { value: "ACTIVE", label: "正常" },
                  { value: "SUSPENDED", label: "冻结" },
                  { value: "BANNED", label: "封禁" },
                  { value: "DELETED", label: "已注销" },
                ]}
                value={status}
                onChange={(e) => updateParams({ status: e.target.value })}
                aria-label="按用户状态筛选"
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                options={[
                  { value: "", label: "全部等级" },
                  { value: "REGULAR", label: membershipLevelMap.REGULAR.label },
                  { value: "SILVER", label: membershipLevelMap.SILVER.label },
                  { value: "GOLD", label: membershipLevelMap.GOLD.label },
                  { value: "DIAMOND", label: membershipLevelMap.DIAMOND.label },
                ]}
                value={level}
                onChange={(e) => updateParams({ level: e.target.value })}
                aria-label="按会员等级筛选"
              />
            </div>
            {(search || status || level) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  updateParams({ search: null, status: null, level: null });
                }}
                leftIcon={<X className="h-4 w-4" />}
              >
                清除筛选
              </Button>
            )}
          </div>

          <span className="hidden text-sm text-brand-charcoal/65 md:ml-auto md:inline">
            共 {pagination.total} 位用户
          </span>
        </div>
      </div>

      {/* 批量操作独立一行，避免勾选后把筛选器挤到第二行 */}
      {canWriteUsers && isOwnerActor && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/15 bg-brand-primary/[0.03] px-4 py-3">
          <span className="mr-1 text-sm font-medium text-brand-charcoal">
            已选 {selectedCount} 项
          </span>
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
          <Button size="sm" variant="ghost" className="ml-auto" onClick={userSelection.clear}>
            取消选择
          </Button>
        </div>
      )}

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

      {/* 列表与分页：加载失败时用错误态独占，避免同时出现“暂无用户” */}
      {!loadError && (
        <>
          {/* 用户列表（移动端卡片） */}
          <div className="md:hidden">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-brand-charcoal/[0.04]"
                  />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-brand-charcoal/10 bg-white py-10">
                <Empty title="暂无用户" />
              </div>
            ) : (
              <div className="divide-y divide-brand-charcoal/10 rounded-2xl border border-brand-charcoal/10 bg-white">
                {users.map((user) => (
                  <div key={user.id} className="p-4">
                    <div className="flex items-start gap-3">
                      {canWriteUsers && (
                        <label className="-ml-2 flex h-11 w-9 flex-shrink-0 items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(user.id)}
                            onChange={() => userSelection.toggle(user)}
                            className="h-4 w-4 rounded border-brand-charcoal/20"
                            aria-label={`选择 ${user.nickname || user.phone || user.id}`}
                          />
                        </label>
                      )}
                      <UserAvatar src={user.avatar} name={user.nickname} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-brand-charcoal">
                          {user.nickname || "未设置"}
                        </p>
                        <p className="truncate text-xs text-brand-charcoal/65">
                          {user.phone || "未绑定手机号"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant={userStatusMap[user.status].variant}>
                            {userStatusMap[user.status].label}
                          </Badge>
                          {user.membershipLevel && membershipLevelMap[user.membershipLevel] && (
                            <Badge variant={membershipLevelMap[user.membershipLevel].variant}>
                              {membershipLevelMap[user.membershipLevel].label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-brand-charcoal/10 pt-2">
                      <span className="text-xs text-brand-charcoal/65">
                        注册于 {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`查看 ${user.nickname || user.phone || "用户"} 详情`}
                          onClick={() => openDetail(user.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canDeleteUsers && isOwnerActor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                            aria-label={`删除 ${user.nickname || user.phone || "用户"}`}
                            onClick={() =>
                              requestDeleteUser(user.id, user.nickname || user.phone || user.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 用户列表（桌面端表格） */}
          <div className="hidden overflow-x-auto rounded-2xl border border-brand-charcoal/10 bg-white md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                  {canWriteUsers && (
                    <th scope="col" className="w-10 px-4 py-3 font-normal">
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
                  <th scope="col" className="px-4 py-3 font-normal">
                    用户
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    手机号
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    会员等级
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    状态
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    注册时间
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
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
                          <UserAvatar src={user.avatar} name={user.nickname} size="sm" />
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
                          <span className="text-brand-charcoal/65">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={userStatusMap[user.status].variant}>
                          {userStatusMap[user.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-brand-charcoal/65">
                        {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(user.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canDeleteUsers && isOwnerActor && (
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
        </>
      )}

      {/* 用户详情模态框 */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailUser?.nickname || detailUser?.phone || "用户详情"}
        size="full"
        mobileFullScreen
      >
        {detailLoading ? (
          <UserDetailSkeleton />
        ) : !detailUser ? (
          <Empty
            icon={<User className="h-8 w-8 text-brand-charcoal/65" />}
            title="无法加载用户详情"
            description={detailError || "用户不存在或已被删除"}
            className="py-10"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {detailUserId && (
                  <Button variant="outline" size="sm" onClick={() => openDetail(detailUserId)}>
                    重试
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDetailOpen(false)}>
                  关闭
                </Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* 用户摘要：身份/状态 + 全局操作，切换分区时保持可见 */}
            <div className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 sm:p-4">
              <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4">
                <UserAvatar src={detailUser.avatar} name={detailUser.nickname} size="md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={userStatusMap[detailUser.status].variant}>
                      {userStatusMap[detailUser.status].label}
                    </Badge>
                    {detailUser.membershipLevel &&
                      membershipLevelMap[detailUser.membershipLevel] && (
                        <Badge variant={membershipLevelMap[detailUser.membershipLevel].variant}>
                          {membershipLevelMap[detailUser.membershipLevel].label}
                        </Badge>
                      )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-brand-charcoal/65">
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="h-3.5 w-3.5" />
                      <span className="font-mono">
                        {revealedPhone || detailUser.phone || "未绑定手机号"}
                      </span>
                      {detailUser.phoneVerified && (
                        <Badge variant="success" className="ml-1 px-1.5 py-0 text-[11px]">
                          已验证
                        </Badge>
                      )}
                      {canRevealPhone && !revealedPhone && detailUser.phone && (
                        <button
                          type="button"
                          onClick={revealPhone}
                          disabled={revealingPhone}
                          className="ml-1 text-brand-primary hover:underline disabled:opacity-50"
                        >
                          {revealingPhone ? "加载中..." : "显示完整号码"}
                        </button>
                      )}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <span className="shrink-0 text-brand-charcoal/65">ID</span>
                      <code className="max-w-[16rem] truncate font-mono" title={detailUser.id}>
                        {detailUser.id}
                      </code>
                      <Tooltip content="复制用户 ID" side="top">
                        <button
                          type="button"
                          aria-label="复制用户 ID"
                          onClick={() => void copyText(detailUser.id, "用户 ID")}
                          className="inline-flex shrink-0 rounded p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal/80"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </span>
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {canWriteUsers &&
                    detailUser.status !== "ACTIVE" &&
                    detailUser.status !== "DELETED" && (
                      <Button
                        size="sm"
                        leftIcon={<CheckCircle className="h-4 w-4" />}
                        disabled={statusLoading}
                        onClick={() => updateUserStatus(detailUser.id, "ACTIVE")}
                      >
                        恢复正常
                      </Button>
                    )}
                  {detailMoreItems.length > 0 && (
                    <Dropdown
                      trigger={
                        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-charcoal/20 bg-white px-3 text-sm font-medium text-brand-charcoal/80 transition-colors hover:bg-brand-charcoal/[0.03]">
                          更多操作
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                      }
                      items={detailMoreItems}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 分区导航 + 内容 */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
              <div className="shrink-0 lg:sticky lg:top-0 lg:w-44">
                <div
                  role="tablist"
                  aria-label="用户详情分区"
                  className="scrollbar-hide flex gap-1 overflow-x-auto rounded-xl border border-brand-charcoal/10 bg-white p-1 lg:flex-col"
                >
                  {visibleDetailTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeDetailTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`detail-tab-${tab.key}`}
                        aria-controls={active ? `detail-panel-${tab.key}` : undefined}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setActiveDetailTab(tab.key)}
                        onKeyDown={(event) => handleDetailTabKeyDown(event, visibleDetailTabs)}
                        className={cn(
                          "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40",
                          active
                            ? "bg-brand-primary/10 font-medium text-brand-primary"
                            : "text-brand-charcoal/65 hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                role="tabpanel"
                id={`detail-panel-${activeDetailTab}`}
                aria-labelledby={`detail-tab-${activeDetailTab}`}
                className="min-w-0 flex-1"
              >
                {/* 概览 */}
                {activeDetailTab === "overview" && (
                  <div className="space-y-4">
                    <DetailSection title="账号概览">
                      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailField label="账号状态">
                          <Badge variant={userStatusMap[detailUser.status].variant}>
                            {userStatusMap[detailUser.status].label}
                          </Badge>
                        </DetailField>
                        <DetailField label="会员等级">
                          {detailUser.membershipLevel &&
                          membershipLevelMap[detailUser.membershipLevel] ? (
                            <Badge variant={membershipLevelMap[detailUser.membershipLevel].variant}>
                              {membershipLevelMap[detailUser.membershipLevel].label}
                            </Badge>
                          ) : (
                            <span className="text-brand-charcoal/65">未设置</span>
                          )}
                        </DetailField>
                        <DetailField label="累计消费">
                          <span className="font-mono font-medium tabular-nums">
                            ¥{(detailUser.totalSpent ?? 0).toLocaleString()}
                          </span>
                        </DetailField>
                        <DetailField label="可用积分">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-mono font-medium tabular-nums">
                              {detailPoints ? detailPoints.available.toLocaleString() : "—"}
                            </span>
                            {canAdjustPoints && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto px-1.5 py-0.5 text-xs"
                                onClick={() => {
                                  adjustRequestIdRef.current = createClientRequestId();
                                  setAdjustOpen(true);
                                }}
                              >
                                调整
                              </Button>
                            )}
                          </span>
                        </DetailField>
                      </dl>
                    </DetailSection>

                    <DetailSection title="活跃信息">
                      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailField label="注册时间">
                          {formatDate(detailUser.createdAt)}
                        </DetailField>
                        <DetailField label="最后登录">
                          {detailLoginAttempts[0]
                            ? formatDate(detailLoginAttempts[0].createdAt)
                            : "—"}
                        </DetailField>
                        <DetailField label="收货地址">
                          {detailAddresses.length > 0 ? `${detailAddresses.length} 个` : "暂无"}
                        </DetailField>
                        <DetailField label="最近等级变更">
                          {detailLevelChanges[0]
                            ? formatDate(detailLevelChanges[0].createdAt)
                            : "—"}
                        </DetailField>
                      </dl>
                    </DetailSection>
                  </div>
                )}

                {/* 基本信息 */}
                {activeDetailTab === "basic" && (
                  <DetailSection title="账号资料">
                    <dl className="grid gap-x-6 sm:grid-cols-2">
                      <DetailRow label="性别">
                        {detailUser.gender === "male"
                          ? "男"
                          : detailUser.gender === "female"
                            ? "女"
                            : "未设置"}
                      </DetailRow>
                      <DetailRow label="生日">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {detailUser.birthday
                              ? new Date(detailUser.birthday).toLocaleDateString("zh-CN", {
                                  timeZone: "UTC",
                                })
                              : "未设置"}
                          </span>
                          {detailUser.birthdayLocked && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                              已锁定
                            </Badge>
                          )}
                          {canWriteUsers && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-auto px-1.5 py-0.5 text-xs"
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
                        </div>
                      </DetailRow>
                      <DetailRow label="最后更新">{formatDate(detailUser.updatedAt)}</DetailRow>
                      <DetailRow label="微信 UnionID">
                        {detailUser.wechatUnionId ? (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <code
                              className="min-w-0 truncate font-mono text-xs text-brand-charcoal/70"
                              title={detailUser.wechatUnionId}
                            >
                              {detailUser.wechatUnionId}
                            </code>
                            <Tooltip content="复制 UnionID" side="top">
                              <button
                                type="button"
                                aria-label="复制微信 UnionID"
                                onClick={() =>
                                  void copyText(detailUser.wechatUnionId ?? "", "微信 UnionID")
                                }
                                className="inline-flex shrink-0 rounded p-1 text-brand-charcoal/65 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal/80"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                          </div>
                        ) : (
                          <span className="text-brand-charcoal/65">未绑定</span>
                        )}
                      </DetailRow>
                      <DetailRow label="第三方平台绑定" className="sm:col-span-2">
                        {detailUser.externalIdentities &&
                        detailUser.externalIdentities.length > 0 ? (
                          <div className="divide-y divide-brand-charcoal/[0.06] overflow-hidden rounded-lg border border-brand-charcoal/10">
                            {detailUser.externalIdentities.map((identity) => {
                              // 小程序渠道无昵称快照：优先显示来源小程序名称（新数据），
                              // 其次平台昵称快照（网页扫码绑定）
                              const identityLabel =
                                identity.clientName || getIdentityNickname(identity.metadata);
                              return (
                                <div
                                  key={identity.id}
                                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                                >
                                  <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
                                    {providerLabelMap[identity.provider] || identity.provider}
                                  </Badge>
                                  {identityLabel && (
                                    <span className="max-w-[12rem] truncate text-brand-charcoal/70">
                                      {identityLabel}
                                    </span>
                                  )}
                                  {/* OpenID：无 users:sensitive:read 时由服务端脱敏，明文仅见于敏感权限 */}
                                  <code
                                    className="max-w-[12rem] truncate font-mono text-[11px] text-brand-charcoal/65"
                                    title={`OpenID: ${identity.subjectId}`}
                                  >
                                    {identity.subjectId}
                                  </code>
                                  <span className="ml-auto text-xs text-brand-charcoal/65">
                                    {formatDate(identity.createdAt)}
                                  </span>
                                  {canWriteUsers && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIdentityUnbindTarget({
                                          id: identity.id,
                                          label:
                                            providerLabelMap[identity.provider] ||
                                            identity.provider,
                                        })
                                      }
                                      className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                                    >
                                      解绑
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : detailUser.wechatOpenId ? (
                          // 双写过渡期兜底：迁移前历史数据可能仅有旧列
                          <Badge variant="success" className="px-1.5 py-0 text-[11px]">
                            微信已绑定（历史数据）
                          </Badge>
                        ) : (
                          <span className="text-brand-charcoal/65">未绑定</span>
                        )}
                      </DetailRow>
                    </dl>
                  </DetailSection>
                )}

                {/* 测肤档案 */}
                {activeDetailTab === "advisor" && canReadAdvisorProfile && (
                  <UserAdvisorPanel
                    key={detailUser.id}
                    userId={detailUser.id}
                    mainStatus={detailUser.status}
                  />
                )}

                {/* 积分与兑换 */}
                {activeDetailTab === "points" && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-xl border border-brand-charcoal/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-brand-charcoal/65">可用积分</p>
                        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-brand-charcoal">
                          {detailPoints ? detailPoints.available.toLocaleString() : "—"}
                        </p>
                        {detailPoints && detailPoints.redemptionTotal > 0 && (
                          <p className="mt-1 text-xs text-brand-charcoal/65">
                            累计兑换 {detailPoints.redemptionTotal} 次
                          </p>
                        )}
                      </div>
                      {canAdjustPoints && (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Wallet className="h-4 w-4" />}
                          onClick={() => {
                            adjustRequestIdRef.current = createClientRequestId();
                            setAdjustOpen(true);
                          }}
                        >
                          调整积分
                        </Button>
                      )}
                    </div>

                    <DetailSection title="积分流水" bodyClassName="p-0">
                      {ledgerLoading ? (
                        <div className="space-y-2 p-4">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={index}
                              className="h-10 animate-pulse rounded-lg bg-brand-charcoal/[0.04]"
                            />
                          ))}
                        </div>
                      ) : ledgerItems.length === 0 ? (
                        <Empty title="暂无积分流水" className="py-8" />
                      ) : (
                        <div className="divide-y divide-brand-charcoal/10">
                          {ledgerItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-xs text-brand-charcoal/70">
                                  {POINT_TYPE_LABELS[item.type] || item.type}
                                </span>
                                {item.note && (
                                  <span className="truncate text-xs text-brand-charcoal/65">
                                    {item.note}
                                  </span>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <span
                                  className={cn(
                                    "font-mono text-sm font-medium tabular-nums",
                                    item.amount > 0 ? "text-emerald-600" : "text-red-500"
                                  )}
                                >
                                  {item.amount > 0 ? `+${item.amount}` : item.amount}
                                </span>
                                <span className="text-xs text-brand-charcoal/65">
                                  {formatDate(item.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ledgerTotalPages > 1 && (
                        <div className="flex items-center justify-end gap-2 border-t border-brand-charcoal/10 px-4 py-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={ledgerPage <= 1 || ledgerLoading}
                            onClick={() => detailUser && fetchLedger(detailUser.id, ledgerPage - 1)}
                          >
                            上一页
                          </Button>
                          <span className="text-xs tabular-nums text-brand-charcoal/65">
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
                    </DetailSection>

                    <DetailSection
                      title={
                        <span>
                          积分兑换记录
                          {detailPoints && detailPoints.redemptionTotal > 0 && (
                            <span className="ml-2 text-xs font-normal text-brand-charcoal/65">
                              共 {detailPoints.redemptionTotal} 条，展示最近{" "}
                              {detailPoints.redemptions.length} 条
                            </span>
                          )}
                        </span>
                      }
                      bodyClassName="p-0"
                    >
                      {!detailPoints || detailPoints.redemptions.length === 0 ? (
                        <Empty title="暂无兑换记录" className="py-8" />
                      ) : (
                        <div className="divide-y divide-brand-charcoal/10">
                          {detailPoints.redemptions.map((r) => (
                            <div key={r.id} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="truncate text-sm font-medium text-brand-charcoal">
                                    {r.productName}
                                  </p>
                                  <span className="shrink-0 text-xs text-brand-charcoal/65">
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
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-charcoal/65">
                                <span>{formatDate(r.createdAt)}</span>
                                <span>参考价 ¥{r.priceYuan.toLocaleString()}</span>
                                {r.waybillNo && (
                                  <span>
                                    {r.carrier === "SF" ? "顺丰" : "快递"} · {r.waybillNo}
                                  </span>
                                )}
                              </div>
                              {r.address && (
                                <p className="mt-1 text-xs text-brand-charcoal/65">
                                  快照收货：{r.recipient} {r.phone} {r.address}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </DetailSection>
                  </div>
                )}

                {/* 收货地址 */}
                {activeDetailTab === "address" && (
                  <DetailSection title="收货地址" bodyClassName="p-0">
                    {detailAddresses.length === 0 ? (
                      <Empty title="暂无收货地址" className="py-8" />
                    ) : (
                      <div className="divide-y divide-brand-charcoal/10">
                        {detailAddresses.map((a) => (
                          <div key={a.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-brand-charcoal">
                                {a.recipient}
                              </p>
                              <span className="text-xs text-brand-charcoal/65">{a.phone}</span>
                              {a.isDefault && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                                  默认
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-brand-charcoal/70">
                              {a.region} {a.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>
                )}

                {/* 消费记录 */}
                {activeDetailTab === "spent" && (
                  <DetailSection
                    title={
                      <span>
                        消费补录记录
                        {detailAdjustmentTotal > 0 && (
                          <span className="ml-2 text-xs font-normal text-brand-charcoal/65">
                            共 {detailAdjustmentTotal} 条，展示最近 {detailAdjustments.length} 条
                          </span>
                        )}
                      </span>
                    }
                    bodyClassName="p-0"
                  >
                    {detailAdjustments.length === 0 ? (
                      <Empty title="暂无消费记录" className="py-8" />
                    ) : (
                      <div className="divide-y divide-brand-charcoal/10">
                        {detailAdjustments.map((a) => (
                          <div key={a.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate font-mono text-sm text-brand-charcoal">
                                  {a.orderNo}
                                </p>
                                <span className="shrink-0 text-xs text-brand-charcoal/65">
                                  {SPENT_CHANNEL_LABELS[
                                    a.channel as keyof typeof SPENT_CHANNEL_LABELS
                                  ] ?? a.channel}
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
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-charcoal/65">
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
                  </DetailSection>
                )}

                {/* 等级成长 */}
                {activeDetailTab === "growth" && (
                  <div className="space-y-4">
                    <DetailSection title="等级概览">
                      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                        <DetailField label="会员等级">
                          {detailUser.membershipLevel &&
                          membershipLevelMap[detailUser.membershipLevel] ? (
                            <Badge variant={membershipLevelMap[detailUser.membershipLevel].variant}>
                              {membershipLevelMap[detailUser.membershipLevel].label}
                            </Badge>
                          ) : (
                            <span className="text-brand-charcoal/65">未设置</span>
                          )}
                        </DetailField>
                        <DetailField label="累计消费">
                          <span className="font-mono font-medium tabular-nums">
                            {detailUser.totalSpent != null
                              ? `¥${detailUser.totalSpent.toLocaleString()}`
                              : "¥0"}
                          </span>
                        </DetailField>
                        <DetailField label="银卡激活时间">
                          {detailUser.silverActivatedAt
                            ? formatDate(detailUser.silverActivatedAt)
                            : "—"}
                        </DetailField>
                        <DetailField label="金卡激活时间">
                          {detailUser.goldActivatedAt
                            ? formatDate(detailUser.goldActivatedAt)
                            : "—"}
                        </DetailField>
                        <DetailField label="钻石卡激活时间">
                          {detailUser.diamondActivatedAt
                            ? formatDate(detailUser.diamondActivatedAt)
                            : "—"}
                        </DetailField>
                      </dl>
                      <p className="mt-4 border-t border-brand-charcoal/10 pt-3 text-xs text-brand-charcoal/65">
                        激活时间为首次达到该等级的时间（等级按累计消费实时判定，可升可降）
                      </p>
                    </DetailSection>

                    <DetailSection title="等级变更轨迹" bodyClassName="p-0">
                      {detailLevelChanges.length === 0 ? (
                        <Empty
                          title="暂无等级变更记录"
                          description="注册即为当前等级"
                          className="py-8"
                        />
                      ) : (
                        <div className="divide-y divide-brand-charcoal/10">
                          {detailLevelChanges.map((c) => (
                            <div
                              key={c.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <Badge
                                  variant={membershipLevelMap[c.fromLevel]?.variant ?? "secondary"}
                                >
                                  {membershipLevelMap[c.fromLevel]?.label ?? c.fromLevel}
                                </Badge>
                                <span className="text-brand-charcoal/65">→</span>
                                <Badge
                                  variant={membershipLevelMap[c.toLevel]?.variant ?? "secondary"}
                                >
                                  {membershipLevelMap[c.toLevel]?.label ?? c.toLevel}
                                </Badge>
                                {c.note && (
                                  <span
                                    className="max-w-[16rem] truncate text-xs text-brand-charcoal/65"
                                    title={c.note}
                                  >
                                    {c.note}
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 text-xs text-brand-charcoal/65">
                                {formatDate(c.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </DetailSection>
                  </div>
                )}

                {/* 登录历史 */}
                {activeDetailTab === "login" && (
                  <DetailSection
                    title={
                      <span>
                        登录历史
                        {detailLoginAttempts.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-brand-charcoal/65">
                            最近 {detailLoginAttempts.length} 条
                          </span>
                        )}
                      </span>
                    }
                    action={
                      detailLoginAttempts.length > 0 ? (
                        <Switch
                          label="仅看失败"
                          checked={loginFailedOnly}
                          onChange={setLoginFailedOnly}
                        />
                      ) : undefined
                    }
                    bodyClassName="p-0"
                  >
                    {detailLoginAttempts.length === 0 ? (
                      <Empty title="暂无登录记录" className="py-8" />
                    ) : (
                      (() => {
                        const visibleAttempts = loginFailedOnly
                          ? detailLoginAttempts.filter((a) => !a.success)
                          : detailLoginAttempts;
                        return visibleAttempts.length === 0 ? (
                          <Empty title="最近记录中没有失败登录" className="py-8" />
                        ) : (
                          <div className="divide-y divide-brand-charcoal/10">
                            {visibleAttempts.map((a) => (
                              <div key={a.id} className="px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
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
                                      <Badge variant="danger" className="px-1.5 py-0 text-[11px]">
                                        {a.reason || "失败"}
                                      </Badge>
                                    )}
                                    {a.clientId && (
                                      <span className="truncate text-xs text-brand-charcoal/65">
                                        {a.clientId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-brand-charcoal/65">
                                    {a.ipAddress && (
                                      <span className="font-mono">{a.ipAddress}</span>
                                    )}
                                    <span>{formatDate(a.createdAt)}</span>
                                  </div>
                                </div>
                                {a.userAgent && (
                                  <p
                                    className="mt-1 w-full truncate text-xs text-brand-charcoal/65"
                                    title={a.userAgent}
                                  >
                                    {a.userAgent}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </DetailSection>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 人工调整积分弹窗 */}
      <Modal
        open={adjustOpen}
        onClose={() => {
          if (adjusting) return;
          closeAdjustModal();
        }}
        title="调整用户积分"
        closeOnBackdrop={false}
        closeGuard={() => !adjusting && confirmCloseAdjust()}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (!confirmCloseAdjust()) return;
                closeAdjustModal();
              }}
              disabled={adjusting}
            >
              取消
            </Button>
            <Button onClick={handleAdjustPoints} loading={adjusting}>
              确认调整
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/70">
            正数为增加（6
            个月有效期，可参与兑礼与过期清理），负数为扣减（直接冲减可用积分，可为负）。
            操作将写入审计日志，请填写可追溯的原因。
          </p>
          <Input
            label="调整分值"
            required
            type="number"
            data-autofocus
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
              className="w-full resize-y rounded-lg border border-brand-charcoal/20 bg-white px-3 py-2 text-sm text-brand-charcoal placeholder:text-brand-charcoal/65 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
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
        closeOnBackdrop={false}
        closeGuard={() => !birthdaySaving && confirmCloseBirthday()}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={handleUnlockBirthday}
              disabled={!detailUser?.birthdayLocked || birthdaySaving}
            >
              仅解锁（不改生日）
            </Button>
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirmCloseBirthday()) setBirthdayEditOpen(false);
                }}
                disabled={birthdaySaving}
              >
                取消
              </Button>
              <Button onClick={handleSaveBirthday} loading={birthdaySaving}>
                保存
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/70">
            生日用于生日积分发放（每年一次）。保存后会自动锁定；留空保存将清除生日并解锁，
            用户可自行重新设置。操作将写入审计日志。
          </p>
          <Input
            label="生日"
            type="date"
            data-autofocus
            value={birthdayInput}
            min="1900-01-01"
            // 生日不能晚于今天，避免未来日期影响生日积分发放
            max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`}
            onChange={(e) => setBirthdayInput(e.target.value)}
          />
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
        description={`确定重置「${detailUser?.nickname || detailUser?.phone || ""}」的密码吗？将生成一次性临时密码，并强制下线该用户全部会话（含 SSO）。该操作需输入二次验证码确认。`}
        confirmText="确认重置"
        type="danger"
        loading={resetPasswordLoading}
      />

      {/* 临时密码展示（仅一次） */}
      <Modal
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="临时密码（仅显示一次）"
        closeOnBackdrop={false}
        closeOnEscape={false}
        showCloseButton={false}
        footer={
          <div className="flex justify-end">
            <Button
              disabled={!tempPasswordSaved}
              onClick={() => {
                setTempPassword(null);
                setTempPasswordSaved(false);
              }}
            >
              我已保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-charcoal/70">
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
              data-autofocus
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
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={tempPasswordSaved}
              onChange={(e) => setTempPasswordSaved(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-amber-800">我已安全保存临时密码</p>
              <p className="mt-0.5 text-xs text-amber-600">
                临时密码仅显示一次，关闭后无法再次查看。
              </p>
            </div>
          </label>
        </div>
      </Modal>

      {/* 状态变更确认 */}
      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        title="修改用户状态"
        type={statusTarget?.status === "BANNED" ? "danger" : "warning"}
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
        type={batchTarget?.status === "BANNED" ? "danger" : "warning"}
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

      <UserExportDialog
        open={exportOpen}
        total={pagination.total}
        canReadSensitive={canRevealPhone}
        canReadAdvisor={canReadAdvisorProfile}
        canReadAdvisorReport={canReadAdvisorReport}
        loading={exporting}
        onClose={() => setExportOpen(false)}
        onConfirm={startExport}
      />

      {/* 资金类操作二次验证 */}
      {approvalTarget && (
        <ApprovalRequestDialog
          open
          onClose={() => setApprovalTarget(null)}
          initialPolicyKey={approvalTarget.policyKey}
          initialValues={approvalTarget.values}
          lockPolicy
        />
      )}
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
