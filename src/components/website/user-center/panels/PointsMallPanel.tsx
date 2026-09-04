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
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Gift, Loader2, Lock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiPost } from "@/lib/api-client";
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
  createdAt: string;
}

interface GiftsData {
  membershipLevel: string;
  redeemRate: number | null;
  available: number;
  gifts: GiftItem[];
  redemptions: RedemptionRecord[];
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

const REDEMPTION_STATUS_LABELS: Record<RedemptionRecord["status"], string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
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

/** 产品描述由富文本编辑器存为 HTML（如 <p>...</p>），卡片展示时剥离标签取纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function PointsMallPanel() {
  const [giftsData, setGiftsData] = useState<GiftsData | null>(null);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [showAllRedemptions, setShowAllRedemptions] = useState(false);
  const [confirmGift, setConfirmGift] = useState<GiftItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const { error: showError, success: showSuccessToast } = useToast();

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

  const handleRedeem = async () => {
    if (!confirmGift) return;
    // crypto.randomUUID 仅在安全上下文（https）可用，非安全上下文降级随机串
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRedeeming(true);
    try {
      await apiPost("/api/user/points/redeem", {
        productId: confirmGift.id,
        requestId,
      });
      showSuccessToast("兑换成功，礼品将尽快为您寄出");
      setConfirmGift(null);
      await loadPointsData();
      await loadGiftsData();
    } catch (e) {
      showError(e instanceof Error ? e.message : "兑换失败，请稍后重试");
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => {
    deferInEffect(loadGiftsData);
    deferInEffect(loadPointsData);
  }, [loadGiftsData, loadPointsData]);

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-mall">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">积分商城</h2>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16">
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
                      onClick={() => setConfirmGift(g)}
                      className="rounded-full bg-[#00263e] px-4 py-1.5 text-xs text-white transition-colors hover:bg-[#0d3b5c] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                    >
                      {g.affordable ? "兑换" : "积分不足"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 我的兑换记录 */}
          {giftsData && giftsData.redemptions.length > 0 && (
            <div className="mt-4 border-t border-stone-200/60 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-stone-500">我的兑换记录</p>
                {giftsData.redemptions.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllRedemptions((v) => !v)}
                    className="text-[11px] text-stone-400 transition-colors hover:text-stone-700"
                  >
                    {showAllRedemptions ? "收起" : "查看全部"}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {(showAllRedemptions
                  ? giftsData.redemptions
                  : giftsData.redemptions.slice(0, 5)
                ).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-stone-600">
                      {r.productName}
                      <span className="ml-2 text-stone-400">
                        {r.points.toLocaleString()} 积分
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-stone-400">{formatDate(r.createdAt)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          r.status === "FULFILLED"
                            ? "bg-emerald-50 text-emerald-600"
                            : r.status === "PENDING"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-stone-100 text-stone-400"
                        }`}
                      >
                        {REDEMPTION_STATUS_LABELS[r.status]}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 兑换确认 */}
      <ConfirmDialog
        open={!!confirmGift}
        onClose={() => setConfirmGift(null)}
        onConfirm={handleRedeem}
        title="确认兑换"
        description={
          confirmGift
            ? `确定使用 ${confirmGift.cost?.toLocaleString()} 积分兑换「${confirmGift.name}」吗？兑换成功后积分不可退还。`
            : ""
        }
        confirmText="确认兑换"
        loading={redeeming}
      />
    </div>
  );
}
