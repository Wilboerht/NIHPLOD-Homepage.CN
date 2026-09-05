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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gift,
  Loader2,
  Lock,
  MapPin,
  Plus,
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
    note: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
}

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
  REDEEM: "积分兑礼",
  EXPIRE: "积分过期",
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

export function PointsMallPanel() {
  const [giftsData, setGiftsData] = useState<GiftsData | null>(null);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  // 兑换记录：无限滚动加载（初始 10 条，滚动到底自动加载更多）
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
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
  // 面板视图：主视图 / 兑换详情 / 确认兑换（整版淡入淡出）
  const [view, setView] = useState<"main" | "detail" | "redeem">("main");
  const [selectedRedemption, setSelectedRedemption] = useState<RedemptionRecord | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
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
    try {
      const res = await fetchWithAuth("/api/user/points");
      const data = await res.json();
      if (data.success) {
        setPointsData(data.data);
      }
    } catch {
      // 明细加载失败静默
    }
  }, []);

  /** 重置加载兑换记录（offset=0） */
  const loadRedemptions = useCallback(async () => {
    setRedemptionsLoading(true);
    try {
      const data = await apiGet<{ redemptions: RedemptionRecord[]; hasMore: boolean }>(
        "/api/user/points/redemptions",
        { offset: "0" }
      );
      setRedemptions(data.redemptions);
      setHasMoreRedemptions(data.hasMore);
    } catch {
      // 记录加载失败静默
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

  /** 滚动到底部附近时自动加载更多记录 */
  const handleScroll = () => {
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

  /** 打开兑换详情：有运单号时拉取物流轨迹 */
  const openRedemptionDetail = (r: RedemptionRecord) => {
    setSelectedRedemption(r);
    setView("detail");
    setTracking(null);
    if (r.waybillNo) {
      void loadTracking(r.id);
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

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-mall">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">积分商城</h2>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16"
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

        {/* 积分余额概览 */}
        <div className="rounded-xl border border-stone-200/60 bg-white/40 p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-stone-700">积分余额</h4>
            <button
              type="button"
              onClick={() => setShowLedger((v) => !v)}
              aria-expanded={showLedger}
              className="flex items-center gap-0.5 rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-light text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800"
            >
              明细
              <ChevronRight
                className={`h-3 w-3 transition-transform duration-200 ${showLedger ? "rotate-90" : ""}`}
              />
            </button>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-light text-stone-800">
              {giftsData ? giftsData.available.toLocaleString() : "—"}
            </p>
          </div>

          {/* 积分明细（可折叠） */}
          {showLedger && (
            <div className="mt-4 border-t border-stone-200/60 pt-3">
              {!pointsData ? (
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
                        {r.note && r.type === "CONSUME" ? `（${r.note.slice(0, 20)}）` : ""}
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
          )}
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
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {giftsData.gifts.map((g) => (
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
                      className="rounded-full bg-[#00263e] px-4 py-1.5 text-xs text-white transition-colors hover:bg-[#0d3b5c] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                    >
                      {g.affordable ? "兑换" : "积分不足"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 我的兑换记录（滚动到底自动加载更多） */}
          {!redemptionsLoading || redemptions.length > 0 ? (
            <div className="mt-4 border-t border-stone-200/60 pt-3">
              <p className="mb-2 text-xs font-medium text-stone-500">我的兑换记录</p>
              {redemptions.length === 0 ? (
                <p className="py-2 text-xs text-stone-400">暂无兑换记录</p>
              ) : (
                <div className="space-y-2">
                  {redemptions.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-stone-600">
                        {r.productName}
                        <span className="ml-2 text-stone-400">
                          {r.points.toLocaleString()} 积分
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-stone-400">{formatDate(r.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => openRedemptionDetail(r)}
                          className="text-[#00263e] transition-opacity hover:opacity-70"
                        >
                          查看
                        </button>
                      </span>
                    </div>
                  ))}
                  {loadingMoreRedemptions && (
                    <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-stone-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中...
                    </div>
                  )}
                  {!hasMoreRedemptions && redemptions.length > 0 && (
                    <p className="pt-1 text-center text-[11px] text-stone-300">已加载全部记录</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
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
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-medium text-stone-800">兑换详情</h4>
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
                        <p className="mb-3 text-xs font-medium tracking-wide text-stone-500">
                          物流轨迹
                          <span className="ml-2 font-normal text-stone-400">
                            {selectedRedemption.carrier === "SF" ? "顺丰速运" : "快递"} ·{" "}
                            {selectedRedemption.waybillNo}
                          </span>
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
                        ) : tracking && !tracking.supported ? (
                          <p className="py-2 text-xs text-stone-400">
                            物流轨迹查询暂未开通，可前往顺丰速运官网查询
                          </p>
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
                        ) : (
                          <p className="py-2 text-xs text-stone-400">暂无轨迹信息</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </m.div>
            )
          ) : (
            confirmGift && (
              <m.div
                key="redeem"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2">
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

                  {/* 内联新增地址 */}
                  {showNewAddress ? (
                    <div className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white/50 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          maxLength={20}
                          value={newRecipient}
                          onChange={(e) => setNewRecipient(e.target.value)}
                          placeholder="收货人姓名"
                          className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e]"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                          placeholder="收货手机号"
                          className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e]"
                        />
                      </div>
                      <input
                        type="text"
                        maxLength={50}
                        value={newRegion}
                        onChange={(e) => setNewRegion(e.target.value)}
                        placeholder="省市区（如：上海市 浦东新区）"
                        className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e]"
                      />
                      <input
                        type="text"
                        maxLength={120}
                        value={newDetail}
                        onChange={(e) => setNewDetail(e.target.value)}
                        placeholder="详细地址（街道、门牌号等）"
                        className="w-full rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#00263e]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewAddress(false)}
                        className="text-xs text-stone-500 transition-colors hover:text-stone-800"
                      >
                        取消新增，使用已有地址
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewAddress(true)}
                      className="mt-2 flex items-center gap-1 text-xs text-[#00263e] transition-colors hover:opacity-70"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      使用新地址
                    </button>
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
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#00263e] px-8 py-2.5 text-sm text-white transition-colors hover:bg-[#0d3b5c] disabled:cursor-not-allowed disabled:opacity-50"
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
