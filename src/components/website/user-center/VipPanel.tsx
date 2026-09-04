"use client";

/**
 * 会员中心面板（共享）
 * 显示会员等级与积分（等级体系 2026-09 四档：普通/银卡/金卡/钻石卡）
 *
 * 与其它用户面板保持一致外壳（标题栏 + 滚动内容区，stone 中性配色），
 * 不渲染任何 emoji 图标。会员权益为手风琴式：默认收起，点击展开。
 * 积分展示在会员卡内：可用/冻结（账本在官网，兑礼入口在商城）。
 *
 * 会员卡背景图：设计稿就绪后放入 public/images 并登记到 CARD_BG_IMAGES，
 * 未登记时使用渐变 fallback。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Gift, Loader2, Lock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiPost } from "@/lib/api-client";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import { SpentAdjustmentPanel } from "./SpentAdjustmentPanel";

// 会员卡背景图（仅作卡面底色/纹理：bg-cover 铺满，容器高度由内容决定，
// 不按图片比例撑高卡片）
const CARD_BG_IMAGES: Partial<Record<string, string>> = {
  REGULAR: "/images/membership-card-regular.png",
};

// 四档卡片配色（border/gradient/文字）
const TIER_CARD_STYLES: Record<string, { card: string; title: string; bar: string }> = {
  REGULAR: {
    card: "border-stone-200/60 bg-white/40",
    title: "text-stone-800",
    bar: "bg-stone-400",
  },
  SILVER: {
    card: "border-zinc-200/70 bg-gradient-to-br from-zinc-50/80 to-stone-50/40",
    title: "text-zinc-700",
    bar: "bg-zinc-400",
  },
  GOLD: {
    card: "border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-stone-50/40",
    title: "text-amber-800",
    bar: "bg-amber-400",
  },
  DIAMOND: {
    card: "border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 to-stone-50/40",
    title: "text-indigo-800",
    bar: "bg-indigo-400",
  },
};

interface BenefitItem {
  title: string;
  desc: string;
}

interface LevelInfo {
  level: string;
  name: string;
  minSpent: number;
  benefits: BenefitItem[];
}

interface NextLevelInfo {
  name: string;
  spentNeeded: number;
  progress: number;
}

interface VIPData {
  membershipLevel: string;
  memberId: string;
  totalSpent: number;
  currentLevel: LevelInfo;
  nextLevel: NextLevelInfo | null;
  allLevels: LevelInfo[];
}

interface PointsData {
  available: number;
  frozen: number;
  nextReleaseAt: string | null;
  recent: {
    id: string;
    type: string;
    amount: number;
    note: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
}

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
  frozen: number;
  gifts: GiftItem[];
  redemptions: RedemptionRecord[];
}

const REDEMPTION_STATUS_LABELS: Record<RedemptionRecord["status"], string> = {
  PENDING: "待履约",
  FULFILLED: "已履约",
  CANCELLED: "已取消",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function VipPanel() {
  const [vipData, setVipData] = useState<VIPData | null>(null);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [giftsData, setGiftsData] = useState<GiftsData | null>(null);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [confirmGift, setConfirmGift] = useState<GiftItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { error: showError, success: showSuccessToast } = useToast();
  const { redirectToLogin, user, refreshUser } = useAuth();

  const toggleLevel = (level: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const loadVIPData = useCallback(async () => {
    try {
      // fetchWithAuth：401 时自动静默刷新重试；刷新失败抛 UnauthorizedError，
      // 避免会话过期后误渲染"暂无会员信息"假空态
      const res = await fetchWithAuth("/api/user/vip");
      const data = await res.json();
      if (data.success) {
        setVipData(data.data);
        if (user && data.data.membershipLevel !== user.membershipLevel) {
          void refreshUser(true);
        }
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        showError("登录已过期，请重新登录");
        redirectToLogin();
        return;
      }
      showError("加载会员信息失败");
    } finally {
      setLoading(false);
    }
  }, [showError, redirectToLogin, user, refreshUser]);

  const loadPointsData = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/points");
      const data = await res.json();
      if (data.success) {
        setPointsData(data.data);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      // 积分加载失败静默（不影响会员卡片主信息展示）
    }
  }, []);

  const loadGiftsData = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/points/gifts");
      const data = await res.json();
      if (data.success) {
        setGiftsData(data.data);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      // 礼品加载失败静默
    } finally {
      setGiftsLoading(false);
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
        giftId: confirmGift.id,
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
    deferInEffect(loadVIPData);
    deferInEffect(loadPointsData);
    deferInEffect(loadGiftsData);
  }, [loadVIPData, loadPointsData, loadGiftsData]);

  if (!vipData && loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!vipData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-stone-400">暂无会员信息</p>
      </div>
    );
  }

  const { currentLevel, nextLevel, totalSpent, allLevels, memberId } = vipData;
  const tierStyle = TIER_CARD_STYLES[currentLevel.level] ?? TIER_CARD_STYLES.REGULAR;
  const cardBgImage = CARD_BG_IMAGES[currentLevel.level];

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-vip">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">会员中心</h2>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16">
        {/* 当前等级会员卡（背景图就绪后自动切换） */}
        <div
          className={`rounded-xl border p-5 ${tierStyle.card} ${cardBgImage ? "bg-cover bg-center" : ""}`}
          style={{
            ...(cardBgImage ? { backgroundImage: `url(${cardBgImage})` } : {}),
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wider text-stone-400">当前等级</p>
              <h3 className={`mt-1 text-xl font-medium ${tierStyle.title}`}>
                {currentLevel.name}
              </h3>
              <p className="mt-1 text-[11px] font-light tracking-wider text-stone-400">
                NO.{memberId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-400">我的积分</p>
              <p className="mt-1 text-xl font-light text-stone-700">
                {pointsData ? pointsData.available.toLocaleString() : "—"}
              </p>
              {pointsData && pointsData.frozen > 0 && (
                <p className="mt-1 text-[11px] text-stone-400">
                  {pointsData.frozen} 冻结中
                  {pointsData.nextReleaseAt ? ` · ${formatDate(pointsData.nextReleaseAt)} 解冻` : ""}
                </p>
              )}
            </div>
          </div>

          {/* 升级进度条（钻石卡为最高档） */}
          {nextLevel && (
            <div className="mt-4 border-t border-stone-200/60 pt-4">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>再消费 ¥{nextLevel.spentNeeded.toLocaleString()} 升级{nextLevel.name}</span>
                <span>{nextLevel.progress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${tierStyle.bar}`}
                  style={{ width: `${nextLevel.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 积分兑换 */}
        <div className="mt-6 rounded-xl border border-stone-200/60 bg-white/40 p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
              <Gift className="h-4 w-4" />
              兑换好礼
            </h4>
            {giftsData && giftsData.redeemRate !== null && (
              <p className="text-xs text-stone-400">1 积分可兑 ¥{giftsData.redeemRate}</p>
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
                          <p className="mt-1 line-clamp-2 text-xs text-stone-400">{g.description}</p>
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
                      className="rounded-full bg-stone-800 px-4 py-1.5 text-xs text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
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
              <p className="mb-2 text-xs font-medium text-stone-500">我的兑换记录</p>
              <div className="space-y-2">
                {giftsData.redemptions.slice(0, 5).map((r) => (
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

        {/* 会员权益 - 手风琴：默认收起，点击展开 */}
        <div className="mt-6">
          <h4 className="mb-3 text-sm font-medium text-stone-700">会员权益</h4>
          <div className="space-y-3">
            {allLevels.map((level) => {
              const isExpanded = expanded.has(level.level);
              return (
                <div
                  key={level.level}
                  className={`rounded-xl border ${
                    level.level === currentLevel.level
                      ? "border-stone-300 bg-white/60"
                      : "border-stone-200/60 bg-white/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleLevel(level.level)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-stone-800">{level.name}</p>
                      {level.level === currentLevel.level && (
                        <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-[11px] text-stone-500">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-400">
                        {level.minSpent > 0
                          ? `消费满 ¥${level.minSpent.toLocaleString()}`
                          : "注册即享"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="space-y-2 border-t border-stone-200/60 px-5 py-4">
                      {level.benefits.map((b, i) => (
                        <div key={i}>
                          <p className="text-sm text-stone-700">{b.title}</p>
                          <p className="mt-0.5 text-xs text-stone-400">{b.desc}</p>
                        </div>
                      ))}
                      {level.level === "REGULAR" && (
                        <div className="flex items-center gap-1.5 pt-2">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                          <p className="text-xs text-stone-400">
                            累计消费满 ¥1,000 解锁肌肤档案、AI 顾问与积分权益
                          </p>
                        </div>
                      )}
                      {level.level !== "REGULAR" && level.minSpent > totalSpent && (
                        <div className="flex items-center gap-1.5 pt-2">
                          <Check className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                          <p className="text-xs text-stone-400">
                            还差 ¥{(level.minSpent - totalSpent).toLocaleString()} 解锁该等级
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* 消费补录（全渠道凭证 → 人工审核 → 补录历史消费金额） */}
        <SpentAdjustmentPanel />

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
    </div>
  );
}
