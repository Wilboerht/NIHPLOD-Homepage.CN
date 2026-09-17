"use client";

/**
 * 积分商城面板（共享）
 * 独立一级 tab「积分商城」：积分余额概览 + 兑换好礼 + 我的兑换记录。
 *
 * 与其它用户面板保持一致外壳（标题栏 + 滚动内容区，stone 中性配色）。
 * 礼品来自产品库 pointRedeemable 标记，按当前等级兑礼率折算扣分；
 * 普通档仅累积积分、不开放兑换（redeemRate=null 时展示解锁提示）。
 * 兑换幂等：requestId 由客户端生成；履约由管理端发货。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Gift,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost } from "@/lib/api-client";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface GiftItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  priceYuan: number;
  cost: number | null; // 当前等级所需积分（普通档 null）
  affordable: boolean;
}

interface RedemptionRecord {
  id: string;
  productName: string;
  priceYuan: number;
  points: number;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
  recipient: string | null;
  phone: string | null;
  address: string | null;
  carrier: string | null;
  waybillNo: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

interface TrackingData {
  waybillNo: string;
  carrier: string | null;
  supported: boolean;
  routes: { time: string; description: string; location?: string }[] | null;
  error: string | null;
}

interface GiftsData {
  membershipLevel: string;
  redeemRate: number | null;
  available: number;
  gifts: GiftItem[];
}

interface PointsData {
  available: number;
  recent: {
    id: string;
    type: string;
    amount: number;
    remaining: number | null;
    note: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
}

/** 即将过期提示窗口（天） */
const EXPIRING_WINDOW_DAYS = 30;

/** 主视图「我的兑换记录」预览条数（更多记录进「查看全部」子视图） */
const RECORDS_PREVIEW_COUNT = 3;

/** 兑换好礼默认展示条数（超出显示「展开更多」） */
const GIFTS_PREVIEW_COUNT = 4;

/** 展开状态在会话内记忆（面板反复开关不重置） */
const SESSION_KEYS = {
  ledger: "nihplod:points:ledger-open",
  gifts: "nihplod:points:gifts-expanded",
} as const;

interface AddressItem {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}

const REDEMPTION_STATUS_LABELS: Record<RedemptionRecord["status"], string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
};

const REDEMPTION_STATUS_ICONS: Record<RedemptionRecord["status"], typeof Clock> = {
  PENDING: Clock,
  FULFILLED: CheckCircle2,
  CANCELLED: XCircle,
};

const REDEMPTION_STATUS_STYLES: Record<RedemptionRecord["status"], string> = {
  PENDING: "bg-amber-50 text-amber-600",
  FULFILLED: "bg-[#00263e]/10 text-[#00263e]",
  CANCELLED: "bg-stone-100 text-stone-400",
};

const POINT_TYPE_LABELS: Record<string, string> = {
  CONSUME: "消费获得",
  REFUND: "退款冲正",
  BIRTHDAY: "生日礼遇",
  CHECKIN: "打卡奖励",
  REDEEM: "积分兑礼",
  EXPIRE: "积分过期",
  ADJUST: "人工调整",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 产品描述由富文本编辑器存为 HTML（如 <p>...</p>），卡片展示时剥离标签取纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * 计算 30 天内即将过期的积分（加载时调用，避免渲染期取当前时间）
 * 仅统计仍有剩余（remaining>0）的发放类流水：FIFO 消耗后仍有效的部分才是真实可损失积分。
 */
function computeExpiringSoon(data: PointsData): { points: number; date: number } | null {
  const now = Date.now();
  const deadline = now + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let points = 0;
  let earliest: number | null = null;
  for (const r of data.recent) {
    if (r.amount <= 0 || !r.remaining || r.remaining <= 0 || !r.expiresAt) continue;
    const t = new Date(r.expiresAt).getTime();
    if (Number.isNaN(t) || t <= now || t > deadline) continue;
    points += r.remaining;
    if (earliest === null || t < earliest) earliest = t;
  }
  return points > 0 && earliest !== null ? { points, date: earliest } : null;
}

export function PointsMallPanel() {
  const [giftsData, setGiftsData] = useState<GiftsData | null>(null);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [giftsExpanded, setGiftsExpanded] = useState(false);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [pointsError, setPointsError] = useState(false);
  // 即将过期积分（加载时计算，避免渲染期调用 Date.now 触发 react-hooks/purity）
  const [expiringSoon, setExpiringSoon] = useState<{ points: number; date: number } | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  // 兑换记录：无限滚动加载（初始 10 条，滚动到底自动加载更多）
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [redemptionsError, setRedemptionsError] = useState(false);
  const [redemptionTotal, setRedemptionTotal] = useState(0);
  const [loadingMoreRedemptions, setLoadingMoreRedemptions] = useState(false);
  const [hasMoreRedemptions, setHasMoreRedemptions] = useState(false);
  const [confirmGift, setConfirmGift] = useState<GiftItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [creatingAddress, setCreatingAddress] = useState(false);
  // 面板视图：主视图 / 全部兑换记录 / 兑换详情 / 确认兑换（整版淡入淡出）
  const [view, setView] = useState<"main" | "records" | "detail" | "redeem">("main");
  // 兑换详情返回目标（从主视图或全部记录进入）
  const [detailFrom, setDetailFrom] = useState<"main" | "records">("main");
  const [selectedRedemption, setSelectedRedemption] = useState<RedemptionRecord | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [copiedWaybill, setCopiedWaybill] = useState(false);
  // 兑换成功面板内提示（自动消失）
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { error: showError } = useToast();

  const loadGiftsData = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/points/gifts");
      const data = await res.json();
      if (data.success) {
        setGiftsData(data.data);
      }
    } catch {
      // 加载失败静默（面板展示失败态，可刷新重试）
    } finally {
      setGiftsLoading(false);
    }
  }, []);

  const loadPointsData = useCallback(async () => {
    setPointsError(false);
    try {
      const res = await fetchWithAuth("/api/user/points");
      const data = await res.json();
      if (data.success) {
        const points = data.data as PointsData;
        setPointsData(points);
        setExpiringSoon(computeExpiringSoon(points));
      } else {
        setPointsError(true);
      }
    } catch {
      // 失败态由 UI 呈现（可重试）
      setPointsError(true);
    }
  }, []);

  /** 重置加载兑换记录（offset=0） */
  const loadRedemptions = useCallback(async () => {
    setRedemptionsLoading(true);
    setRedemptionsError(false);
    try {
      const data = await apiGet<{ redemptions: RedemptionRecord[]; hasMore: boolean; total: number }>(
        "/api/user/points/redemptions",
        { offset: "0" }
      );
      setRedemptions(data.redemptions);
      setHasMoreRedemptions(data.hasMore);
      setRedemptionTotal(data.total);
    } catch {
      // 失败态由 UI 呈现（可重试）
      setRedemptionsError(true);
    } finally {
      setRedemptionsLoading(false);
    }
  }, []);

  /** 滚动到底加载更多兑换记录（追加） */
  const loadMoreRedemptions = useCallback(async () => {
    if (loadingMoreRedemptions || !hasMoreRedemptions) return;
    setLoadingMoreRedemptions(true);
    try {
      const data = await apiGet<{ redemptions: RedemptionRecord[]; hasMore: boolean }>(
        "/api/user/points/redemptions",
        { offset: String(redemptions.length) }
      );
      setRedemptions((prev) => [...prev, ...data.redemptions]);
      setHasMoreRedemptions(data.hasMore);
    } catch {
      // 静默失败，滚动可重试
    } finally {
      setLoadingMoreRedemptions(false);
    }
  }, [loadingMoreRedemptions, hasMoreRedemptions, redemptions.length]);

  /** 滚动到底部附近时自动加载更多记录（仅在「全部记录」子视图触发） */
  const handleScroll = () => {
    if (view !== "records") return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void loadMoreRedemptions();
    }
  };

  const loadAddresses = useCallback(async () => {
    setAddressesLoading(true);
    try {
      const data = await apiGet<{ addresses: AddressItem[] }>("/api/user/addresses");
      setAddresses(data.addresses);
      // 默认选中默认地址（无默认则选第一条）
      setSelectedAddressId((prev) => {
        if (prev && data.addresses.some((a) => a.id === prev)) return prev;
        return data.addresses.find((a) => a.isDefault)?.id ?? data.addresses[0]?.id ?? null;
      });
    } catch {
      // 加载失败静默，用户可内联新增
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  /** 打开兑换详情：有运单号时拉取物流轨迹（记录来源视图，返回时回到原处） */
  const openRedemptionDetail = (r: RedemptionRecord, from: "main" | "records" = "main") => {
    setSelectedRedemption(r);
    setDetailFrom(from);
    setView("detail");
    setTracking(null);
    setCopiedWaybill(false);
    if (r.waybillNo) {
      void loadTracking(r.id);
    }
  };

  /** 一键复制快递单号 */
  const copyWaybill = async () => {
    if (!selectedRedemption?.waybillNo) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedRedemption.waybillNo);
      } else {
        // 非安全上下文降级：选中文本让用户手动复制
        showError("当前环境不支持一键复制，请长按运单号手动复制");
        return;
      }
      setCopiedWaybill(true);
      setTimeout(() => setCopiedWaybill(false), 1500);
    } catch {
      showError("复制失败，请手动复制");
    }
  };

  /** 拉取物流轨迹（顺丰丰桥） */
  const loadTracking = useCallback(async (redemptionId: string) => {
    setTrackingLoading(true);
    try {
      const res = await fetchWithAuth(`/api/user/points/redemptions/${redemptionId}/tracking`);
      const data = await res.json();
      if (data.success) {
        setTracking(data.data);
      } else {
        setTracking(null);
      }
    } catch {
      setTracking(null);
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  /** 打开兑换确认视图：加载地址并预选默认地址 */
  const openRedeem = (g: GiftItem) => {
    setConfirmGift(g);
    setShowNewAddress(false);
    setNewRecipient("");
    setNewPhone("");
    setNewRegion("");
    setNewDetail("");
    setView("redeem");
    void loadAddresses();
  };

  const handleRedeem = async () => {
    if (!confirmGift) return;
    // crypto.randomUUID 仅在安全上下文（https）可用，非安全上下文降级随机串
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setRedeeming(true);
    try {
      let addressId = selectedAddressId;

      // 内联新增地址：先创建地址再兑换
      if (showNewAddress) {
        if (!newRecipient.trim()) {
          showError("请填写收货人姓名");
          setRedeeming(false);
          return;
        }
        if (!/^1[3-9]\d{9}$/.test(newPhone)) {
          showError("请输入正确的手机号");
          setRedeeming(false);
          return;
        }
        if (!newRegion.trim()) {
          showError("请填写省市区");
          setRedeeming(false);
          return;
        }
        if (!newDetail.trim()) {
          showError("请填写详细地址");
          setRedeeming(false);
          return;
        }
        setCreatingAddress(true);
        try {
          const created = await apiPost<{ address: AddressItem }>("/api/user/addresses", {
            recipient: newRecipient.trim(),
            phone: newPhone,
            region: newRegion.trim(),
            detail: newDetail.trim(),
            // 地址簿为空时后端自动设为默认
          });
          addressId = created.address.id;
        } finally {
          setCreatingAddress(false);
        }
      }

      if (!addressId) {
        showError("请选择收货地址");
        setRedeeming(false);
        return;
      }

      await apiPost("/api/user/points/redeem", {
        productId: confirmGift.id,
        addressId,
        requestId,
      });
      setConfirmGift(null);
      setShowNewAddress(false);
      setView("main");
      // 面板内成功提示（5 秒后自动消失）
      setRedeemSuccess(true);
      await loadPointsData();
      await loadGiftsData();
      await loadRedemptions();
    } catch (e) {
      showError(e instanceof Error ? e.message : "兑换失败，请稍后重试");
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => {
    deferInEffect(loadGiftsData);
    deferInEffect(loadPointsData);
    deferInEffect(loadRedemptions);
  }, [loadGiftsData, loadPointsData, loadRedemptions]);

  // 视图切换时回到顶部：整版内容淡入淡出后高度变化，避免停留在旧滚动位置
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [view]);

  // 兑换成功提示 5 秒后自动消失
  useEffect(() => {
    if (!redeemSuccess) return;
    const timer = setTimeout(() => setRedeemSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [redeemSuccess]);

  // 会话内记忆展开状态（明细 / 礼品展开），面板反复开关不重置。
  // 用 deferInEffect 延迟一个微任务，满足 react-hooks/set-state-in-effect 规则。
  useEffect(() => {
    deferInEffect(() => {
      try {
        if (sessionStorage.getItem(SESSION_KEYS.ledger) === "1") setShowLedger(true);
        if (sessionStorage.getItem(SESSION_KEYS.gifts) === "1") setGiftsExpanded(true);
      } catch {
        // 隐私模式等场景忽略
      }
    });
  }, []);

  const toggleLedger = () => {
    const next = !showLedger;
    setShowLedger(next);
    try {
      sessionStorage.setItem(SESSION_KEYS.ledger, next ? "1" : "0");
    } catch {
      // 忽略存储失败
    }
  };

  const toggleGiftsExpanded = () => {
    const next = !giftsExpanded;
    setGiftsExpanded(next);
    try {
      sessionStorage.setItem(SESSION_KEYS.gifts, next ? "1" : "0");
    } catch {
      // 忽略存储失败
    }
  };

  /** 主视图预览：兑换记录仅展示最近 N 条 */
  const previewRedemptions = redemptions.slice(0, RECORDS_PREVIEW_COUNT);
  /** 兑换好礼：默认展示 N 条，可展开更多 */
  const visibleGifts = giftsData
    ? giftsExpanded
      ? giftsData.gifts
      : giftsData.gifts.slice(0, GIFTS_PREVIEW_COUNT)
    : [];
  const hiddenGiftsCount = giftsData
    ? Math.max(0, giftsData.gifts.length - GIFTS_PREVIEW_COUNT)
    : 0;
  /** 明细收起时的「最近一笔」摘要 */
  const lastLedger = pointsData?.recent[0] ?? null;

  /** 兑换记录列表（主视图预览与全部记录子视图复用） */
  const renderRedemptionList = (items: RedemptionRecord[], from: "main" | "records") => (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-stone-600">
            {r.productName}
            <span className="ml-2 text-stone-400">{r.points.toLocaleString()} 积分</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-stone-400">{formatDate(r.createdAt)}</span>
            <button
              type="button"
              onClick={() => openRedemptionDetail(r, from)}
              className="py-1 text-[#00263e] transition-opacity hover:opacity-70 active:opacity-60"
            >
              查看
            </button>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-mall">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">积分商城</h2>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex-1 overflow-y-auto overscroll-contain px-6 py-6 md:px-16"
      >
        <AnimatePresence mode="wait" initial={false}>
          {view === "main" ? (
            <m.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
        {/* 兑换成功提示（面板内，可手动关闭，5 秒自动消失） */}
        {redeemSuccess && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#00263e]/20 bg-[#00263e]/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00263e]" />
              <p className="text-xs text-stone-700">
                兑换成功，礼品将尽快为您寄出，可在「我的兑换记录」中查看发货进度
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRedeemSuccess(false)}
              aria-label="关闭提示"
              className="shrink-0 text-stone-400 transition-colors hover:text-stone-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 积分余额概览：右下角渐隐水印（Sparkles，向卡片内部淡出，纯装饰） */}
        <div className="relative overflow-hidden rounded-xl border border-stone-200/60 bg-white/40 p-5">
          <Sparkles
            aria-hidden
            strokeWidth={1}
            className="pointer-events-none absolute -bottom-6 -right-6 h-28 w-28 text-[#00263e]/[0.05] [-webkit-mask-image:linear-gradient(to_top_left,black,transparent_75%)] [mask-image:linear-gradient(to_top_left,black,transparent_75%)]"
          />
          <div className="relative flex items-center justify-between">
            <h4 className="text-sm font-medium text-stone-700">积分余额</h4>
            <button
              type="button"
              onClick={toggleLedger}
              aria-expanded={showLedger}
              className="flex items-center gap-0.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-light text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800 active:opacity-70"
            >
              明细
              <ChevronRight
                className={`h-3 w-3 transition-transform duration-200 ${showLedger ? "rotate-90" : ""}`}
              />
            </button>
          </div>
          <div className="relative mt-4 flex items-baseline gap-1.5">
            <p className="text-3xl font-light text-stone-800">
              {giftsData ? giftsData.available.toLocaleString() : "—"}
            </p>
            <span className="text-xs text-stone-400">积分</span>
          </div>

          {/* 明细收起时的「最近一笔」摘要（展开后由完整明细替代） */}
          {!showLedger && lastLedger && (
            <p className="relative mt-2 truncate text-xs text-stone-400">
              最近一笔：{POINT_TYPE_LABELS[lastLedger.type] ?? lastLedger.type}{" "}
              <span
                className={`font-medium ${lastLedger.amount >= 0 ? "text-stone-600" : "text-stone-400"}`}
              >
                {lastLedger.amount >= 0 ? "+" : ""}
                {lastLedger.amount.toLocaleString()}
              </span>
              <span className="ml-1.5">{formatDate(lastLedger.createdAt)}</span>
            </p>
          )}

          {/* 即将过期提醒（常显，不依赖明细展开） */}
          {expiringSoon && (
            <p className="relative mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {expiringSoon.points.toLocaleString()} 积分将于{" "}
              {formatDate(new Date(expiringSoon.date).toISOString())} 过期，请尽快使用
            </p>
          )}

          {/* 积分明细（可折叠，高度过渡动画） */}
          <AnimatePresence initial={false}>
            {showLedger && (
              <m.div
                key="ledger"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="relative overflow-hidden"
              >
            <div className="relative mt-4 border-t border-stone-200/60 pt-3">
              {pointsError ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-stone-400">
                  明细加载失败
                  <button
                    type="button"
                    onClick={() => void loadPointsData()}
                    className="text-[#00263e] transition-opacity hover:opacity-70"
                  >
                    重试
                  </button>
                </div>
              ) : !pointsData ? (
                <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-stone-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 明细加载中...
                </div>
              ) : pointsData.recent.length === 0 ? (
                <p className="py-4 text-center text-xs text-stone-400">暂无积分明细</p>
              ) : (
                <div className="space-y-2">
                  {pointsData.recent.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-stone-500">
                        {POINT_TYPE_LABELS[r.type] ?? r.type}
                        {r.note && (r.type === "CONSUME" || r.type === "CHECKIN" || r.type === "ADJUST")
                          ? `（${r.note.slice(0, 20)}）`
                          : ""}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-stone-400">{formatDate(r.createdAt)}</span>
                        <span
                          className={`font-medium ${r.amount >= 0 ? "text-stone-700" : "text-stone-400"}`}
                        >
                          {r.amount >= 0 ? "+" : ""}
                          {r.amount.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* 兑换好礼 */}
        <div className="mt-6 rounded-xl border border-stone-200/60 bg-white/40 p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
              <Gift className="h-4 w-4" />
              兑换好礼
            </h4>
            {giftsData && giftsData.redeemRate !== null && (
              <p className="text-xs text-stone-400">按当前等级折算所需积分</p>
            )}
          </div>

          {giftsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
            </div>
          ) : !giftsData ? (
            <p className="py-6 text-center text-xs text-stone-400">礼品加载失败，请稍后重试</p>
          ) : giftsData.redeemRate === null ? (
            <div className="flex items-center justify-center gap-1.5 py-6 text-xs text-stone-400">
              <Lock className="h-3.5 w-3.5" />
              升级银卡会员解锁积分兑换
            </div>
          ) : giftsData.gifts.length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-400">暂无上架礼品</p>
          ) : (
            <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleGifts.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col justify-between rounded-xl border border-stone-200/60 bg-white/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {g.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.image}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-stone-200/60 object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-800">{g.name}</p>
                        {g.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-stone-400">
                            {stripHtml(g.description)}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">
                      价格 ¥{g.priceYuan.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-700">
                      {g.cost?.toLocaleString()} 积分
                    </span>
                    <button
                      type="button"
                      disabled={!g.affordable}
                      onClick={() => openRedeem(g)}
                      className="rounded-full bg-[#00263e] px-4 py-2 text-xs text-white transition-colors hover:bg-[#0d3b5c] active:opacity-80 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                    >
                      {g.affordable ? "兑换" : "积分不足"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {giftsData.gifts.length > GIFTS_PREVIEW_COUNT && (
              <button
                type="button"
                onClick={toggleGiftsExpanded}
                aria-expanded={giftsExpanded}
                className="mx-auto mt-3 flex items-center gap-1 rounded-full border border-stone-200 px-4 py-1.5 text-xs text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800 active:opacity-70"
              >
                {giftsExpanded ? "收起" : `展开更多（还有 ${hiddenGiftsCount} 件）`}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${giftsExpanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
            </>
          )}

          {/* 我的兑换记录：主视图仅预览最近 N 条，更多记录进「查看全部」 */}
          <div className="mt-4 border-t border-stone-200/60 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-stone-500">
                我的兑换记录
                {redemptionTotal > 0 && (
                  <span className="ml-1 font-normal text-stone-400">（{redemptionTotal}）</span>
                )}
              </p>
              {redemptionTotal > RECORDS_PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setView("records")}
                  className="inline-flex items-center gap-0.5 rounded-full border border-stone-200 bg-white/40 px-3 py-1 text-xs text-stone-500 transition-colors hover:border-stone-300 hover:bg-white/70 hover:text-stone-800 active:opacity-70"
                >
                  查看全部
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            {redemptionsLoading && redemptions.length === 0 ? (
              <div className="flex items-center gap-1.5 py-3 text-xs text-stone-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 记录加载中...
              </div>
            ) : redemptionsError && redemptions.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-xs text-stone-400">
                记录加载失败
                <button
                  type="button"
                  onClick={() => void loadRedemptions()}
                  className="text-[#00263e] transition-opacity hover:opacity-70"
                >
                  重试
                </button>
              </div>
            ) : redemptions.length === 0 ? (
              <p className="py-2 text-xs text-stone-400">暂无兑换记录</p>
            ) : (
              renderRedemptionList(previewRedemptions, "main")
            )}
          </div>
        </div>
            </m.div>
          ) : view === "detail" ? (
            selectedRedemption && (
              <m.div
                key="redemption-detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-lg font-medium text-stone-800">兑换详情</h4>
                  <button
                    type="button"
                    onClick={() => setView(detailFrom)}
                    className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/40 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-white/70 hover:text-stone-900"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    返回
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-stone-200/60 bg-white/40 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-medium text-stone-800">
                      {selectedRedemption.productName}
                    </p>
                    {(() => {
                      const StatusIcon = REDEMPTION_STATUS_ICONS[selectedRedemption.status];
                      return (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${REDEMPTION_STATUS_STYLES[selectedRedemption.status]}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {REDEMPTION_STATUS_LABELS[selectedRedemption.status]}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="mt-4 space-y-2.5 border-t border-stone-200/60 pt-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">消耗积分</span>
                      <span className="font-medium text-stone-700">
                        {selectedRedemption.points.toLocaleString()} 积分
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">参考价格</span>
                      <span className="text-stone-700">
                        ¥{selectedRedemption.priceYuan.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">兑换时间</span>
                      <span className="text-stone-700">{formatDate(selectedRedemption.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">发货状态</span>
                      {selectedRedemption.status === "FULFILLED" ? (
                        <span className="text-[#00263e]">
                          已发货
                          {selectedRedemption.fulfilledAt
                            ? ` · ${formatDateTime(selectedRedemption.fulfilledAt)}`
                            : ""}
                        </span>
                      ) : selectedRedemption.status === "PENDING" ? (
                        <span className="text-amber-600">待发货</span>
                      ) : (
                        <span className="text-stone-400">已取消</span>
                      )}
                    </div>
                    {selectedRedemption.address && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="shrink-0 text-stone-400">收货信息</span>
                        <span className="text-right text-stone-700">
                          {selectedRedemption.recipient}
                          {selectedRedemption.phone && (
                            <span className="ml-2 text-stone-400">{selectedRedemption.phone}</span>
                          )}
                          <span className="mt-0.5 block text-stone-500">
                            {selectedRedemption.address}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* 物流轨迹（有运单号时查询丰桥轨迹） */}
                    {selectedRedemption.waybillNo && (
                      <div className="border-t border-stone-200/60 pt-4">
                        <p className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-stone-500">
                          物流轨迹
                          <span className="font-normal text-stone-400">
                            {selectedRedemption.carrier === "SF" ? "顺丰速运" : "快递"} ·{" "}
                            {selectedRedemption.waybillNo}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyWaybill()}
                            className="inline-flex items-center gap-0.5 rounded-full border border-stone-200 px-2 py-0.5 text-[10px] text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800"
                          >
                            {copiedWaybill ? (
                              <Check className="h-3 w-3 text-[#00263e]" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedWaybill ? "已复制" : "复制"}
                          </button>
                        </p>

                        {trackingLoading ? (
                          <div className="flex items-center gap-1.5 py-3 text-xs text-stone-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 轨迹查询中...
                          </div>
                        ) : tracking && tracking.supported && tracking.routes && tracking.routes.length > 0 ? (
                          <div>
                            {[...tracking.routes].reverse().map((r, i) => (
                              <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                                {i < tracking.routes!.length - 1 && (
                                  <span className="absolute left-[5px] top-4 h-full w-px bg-stone-200" />
                                )}
                                <span
                                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                    i === 0 ? "bg-[#00263e]" : "bg-stone-300"
                                  }`}
                                />
                                <div className="min-w-0">
                                  <p className="text-xs leading-relaxed text-stone-700">
                                    {r.description}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-stone-400">
                                    {r.location ? `${r.location} · ` : ""}
                                    {formatDateTime(r.time)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : tracking && tracking.error ? (
                          <div className="flex items-center gap-3 py-2">
                            <p className="text-xs text-stone-400">{tracking.error}</p>
                            <button
                              type="button"
                              onClick={() => void loadTracking(selectedRedemption.id)}
                              className="text-xs text-[#00263e] transition-opacity hover:opacity-70"
                            >
                              重试
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </m.div>
            )
          ) : view === "records" ? (
            <m.div
              key="records"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-lg font-medium text-stone-800">
                  我的兑换记录
                  {redemptionTotal > 0 && (
                    <span className="ml-1.5 text-sm font-normal text-stone-400">
                      （{redemptionTotal}）
                    </span>
                  )}
                </h4>
                <button
                  type="button"
                  onClick={() => setView("main")}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/40 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-white/70 hover:text-stone-900"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  返回
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-stone-200/60 bg-white/40 p-5">
                {redemptionsLoading && redemptions.length === 0 ? (
                  <div className="flex items-center justify-center gap-1.5 py-6 text-xs text-stone-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 记录加载中...
                  </div>
                ) : redemptionsError && redemptions.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-stone-400">
                    记录加载失败
                    <button
                      type="button"
                      onClick={() => void loadRedemptions()}
                      className="text-[#00263e] transition-opacity hover:opacity-70"
                    >
                      重试
                    </button>
                  </div>
                ) : redemptions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-stone-400">暂无兑换记录</p>
                ) : (
                  <>
                    {renderRedemptionList(redemptions, "records")}
                    {/* 记录不足一屏时滚动事件不触发，提供按钮兜底 */}
                    {hasMoreRedemptions && !loadingMoreRedemptions && (
                      <button
                        type="button"
                        onClick={() => void loadMoreRedemptions()}
                        className="mt-3 w-full rounded-full border border-stone-200 py-2 text-xs text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800 active:opacity-70"
                      >
                        加载更多
                      </button>
                    )}
                    {loadingMoreRedemptions && (
                      <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-stone-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中...
                      </div>
                    )}
                    {!hasMoreRedemptions && (
                      <p className="pt-3 text-center text-[11px] text-stone-300">已加载全部记录</p>
                    )}
                  </>
                )}
              </div>
            </m.div>
          ) : (
            confirmGift && (
              <m.div
                key="redeem"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-lg font-medium text-stone-800">确认兑换</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmGift(null);
                      setShowNewAddress(false);
                      setView("main");
                    }}
                    disabled={redeeming || creatingAddress}
                    className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/40 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-white/70 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    返回
                  </button>
                </div>

                {/* 礼品信息卡 */}
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200/60 bg-white/60 p-3">
                  {confirmGift.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={confirmGift.image}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg border border-stone-200/60 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800">
                      {confirmGift.name}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      消耗{" "}
                      <span className="font-medium text-[#00263e]">
                        {confirmGift.cost?.toLocaleString()}
                      </span>{" "}
                      积分
                      <span className="mx-1.5 text-stone-300">·</span>
                      参考价 ¥{confirmGift.priceYuan.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* 收货地址 */}
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
                    <MapPin className="h-3.5 w-3.5 text-[#00263e]" />
                    收货地址
                    <span className="font-normal text-stone-400">
                      （礼品将寄送至所选地址）
                    </span>
                  </p>

                  {addressesLoading ? (
                    <div className="flex items-center gap-1.5 py-4 text-xs text-stone-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> 地址加载中...
                    </div>
                  ) : !showNewAddress && addresses.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {addresses.map((a) => {
                        const isSelected = selectedAddressId === a.id;
                        return (
                          <label
                            key={a.id}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                              isSelected
                                ? "border-[#00263e] bg-[#00263e]/5"
                                : "border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="redeem-address"
                              checked={isSelected}
                              onChange={() => setSelectedAddressId(a.id)}
                              className="mt-0.5 h-3.5 w-3.5 accent-[#00263e]"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-stone-800">
                                {a.recipient}
                                <span className="ml-2 font-normal text-stone-400">
                                  {a.phone}
                                </span>
                                {a.isDefault && (
                                  <span className="ml-2 rounded-full bg-[#00263e]/10 px-1.5 py-0.5 text-[10px] text-[#00263e]">
                                    默认
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                                {a.region} {a.detail}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : showNewAddress ? null : (
                    <p className="mt-2 py-2 text-xs text-stone-400">
                      暂无收货地址，请先填写寄送地址
                    </p>
                  )}

                  {/* 内联新增地址：触发器常驻并暴露 aria-expanded，与「明细」交互语义一致 */}
                  <button
                    type="button"
                    onClick={() => setShowNewAddress((v) => !v)}
                    aria-expanded={showNewAddress}
                    aria-controls="new-redeem-address"
                    className="mt-2 flex items-center gap-1 py-1 text-xs text-[#00263e] transition-colors hover:opacity-70 active:opacity-60"
                  >
                    {showNewAddress ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 rotate-180 transition-transform duration-200" />
                        取消新增
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        使用新地址
                      </>
                    )}
                  </button>
                  {showNewAddress && (
                    <div
                      id="new-redeem-address"
                      className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white/50 p-3"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          maxLength={20}
                          value={newRecipient}
                          onChange={(e) => setNewRecipient(e.target.value)}
                          placeholder="收货人姓名"
                          className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2.5 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e] md:text-sm"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                          placeholder="收货手机号"
                          className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2.5 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e] md:text-sm"
                        />
                      </div>
                      <input
                        type="text"
                        maxLength={50}
                        value={newRegion}
                        onChange={(e) => setNewRegion(e.target.value)}
                        placeholder="省市区（如：上海市 浦东新区）"
                        className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2.5 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e] md:text-sm"
                      />
                      <input
                        type="text"
                        maxLength={120}
                        value={newDetail}
                        onChange={(e) => setNewDetail(e.target.value)}
                        placeholder="详细地址（街道、门牌号等）"
                        className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2.5 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e] md:text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* 提交 */}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={handleRedeem}
                    disabled={
                      redeeming ||
                      creatingAddress ||
                      (!showNewAddress && !selectedAddressId)
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#00263e] px-8 py-2.5 text-sm text-white transition-colors hover:bg-[#0d3b5c] active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {redeeming || creatingAddress ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Gift className="h-4 w-4" />
                    )}
                    {redeeming || creatingAddress ? "提交中..." : "确认兑换"}
                  </button>
                </div>
              </m.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
