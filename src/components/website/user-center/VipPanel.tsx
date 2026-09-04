"use client";

/**
 * 会员中心面板（共享）
 * 显示会员等级与积分（等级体系 2026-09 四档：普通/银卡/金卡/钻石卡）
 *
 * 与其它用户面板保持一致外壳（标题栏 + 滚动内容区，stone 中性配色），
 * 不渲染任何 emoji 图标。会员权益为 2×2 等级卡片 + 点击切换介绍。
 * 积分展示在会员卡内：无冻结期、立即到账（账本在官网，兑礼在「积分商城」tab）。
 *
 * 会员卡与权益区等级卡背景图：四档均已登记到 CARD_BG_IMAGES；
 * 会员卡铺满使用，权益区等级卡做虚化淡化处理。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bot,
  Cake,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Gift,
  Infinity as InfinityIcon,
  Loader2,
  Lock,
  ScanFace,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import { BIRTHDAY_POINTS } from "@/lib/membership";
import { SpentAdjustmentPanel, type SpentPanelView } from "./SpentAdjustmentPanel";

// 会员卡背景图（四档）：
// - 会员卡（当前等级）：bg-cover 铺满作卡面底色，容器高度由内容决定
// - 权益区各等级卡片：同图做虚化（blur-md）+ 低透明度（opacity-25）的淡淡背景
const CARD_BG_IMAGES: Partial<Record<string, string>> = {
  REGULAR: "/images/membership-card-regular.png",
  SILVER: "/images/membership-card-silver.png",
  GOLD: "/images/membership-card-gold.png",
  DIAMOND: "/images/membership-card-diamond.png",
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

// 权益条目图标（按标题适配；未匹配的条目回退 Check）
const BENEFIT_ICONS: Record<string, typeof Check> = {
  测肤体验: ScanFace,
  测肤加赠: ScanFace,
  不限次测肤: InfinityIcon,
  档案永久保留: Archive,
  专属AI护肤顾问: Bot,
  "专属 AI 护肤顾问": Bot,
  积分兑礼: Gift,
  消费积分: Coins,
  会员升级: TrendingUp,
  生日礼遇: Cake,
};

function benefitIcon(title: string): typeof Check {
  return BENEFIT_ICONS[title] ?? Check;
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
}

// 右侧内容整版视图：主视图 / 等级详情 / 录入表单 / 录入历史，互斥整版切换（淡入淡出）
type VipView = "main" | "tier" | "spent-form" | "spent-history";

export function VipPanel() {
  const [vipData, setVipData] = useState<VIPData | null>(null);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [view, setView] = useState<VipView>("main");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { error: showError } = useToast();
  const { redirectToLogin, user, refreshUser, setUserCenterView } = useAuth();

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

  // 申请列表刷新（提交后/展开历史时）同步重拉会员卡与积分，
  // 审核通过后的等级/消费额/积分变化无需刷新页面即可体现
  const handleApplicationsLoaded = useCallback(() => {
    void loadVIPData();
    void loadPointsData();
  }, [loadVIPData, loadPointsData]);

  useEffect(() => {
    deferInEffect(loadVIPData);
    deferInEffect(loadPointsData);
  }, [loadVIPData, loadPointsData]);

  // 视图切换时回到顶部：整版内容淡入淡出后高度变化，避免停留在旧滚动位置
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

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

  // 权益区当前选中的等级（点击 2×2 等级卡片后整版切换到对应等级介绍）
  const selected = selectedLevel
    ? (allLevels.find((l) => l.level === selectedLevel) ?? null)
    : null;

  // 切换整版视图到补录表单（与权益区的解锁引导联动）
  const focusSpentForm = () => {
    setView("spent-form");
  };

  // 消费补录内部视图变化 → 整版视图映射
  const handleSpentViewChange = (v: SpentPanelView) => {
    if (v === "form") setView("spent-form");
    else if (v === "history") setView("spent-history");
    else setView("main");
  };

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-vip">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">会员中心</h2>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16"
      >
        <AnimatePresence mode="wait" initial={false}>
          {view === "main" && (
            <m.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
        {/* 会员卡 + 升级引导（桌面并排，移动端上下堆叠） */}
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="w-full lg:w-[390px] lg:shrink-0">
        {/* 当前等级会员卡（标准卡片比例 85.6:53.98 ≈ 1.586:1，左对齐，背景图按卡面铺满） */}
        <div
          className={`relative flex aspect-[1.586/1] w-full max-w-[390px] flex-col overflow-hidden rounded-xl border ${tierStyle.card}`}
        >
          {/* 卡面背景图 */}
          {cardBgImage && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${cardBgImage})` }}
            />
          )}

          <div className="relative flex items-start justify-between gap-4 p-5">
            <div>
              <p className="text-xs tracking-wider text-stone-400">当前等级</p>
              <h3 className={`mt-1 text-xl font-medium ${tierStyle.title}`}>
                {currentLevel.name}
              </h3>
              <p className="mt-1 text-[11px] font-light tracking-wider text-stone-400">
                NO.{memberId}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUserCenterView("mall")}
              className="text-right transition-opacity hover:opacity-70"
            >
              <p className="text-xs text-stone-400">我的积分</p>
              <p className="mt-1 text-xl font-light text-stone-700">
                {pointsData ? pointsData.available.toLocaleString() : "—"}
              </p>
            </button>
          </div>

          {/* 分割线以下：背景虚化处理，承载升级进度与生日礼遇 */}
          {(nextLevel ||
            (user && !user.birthday && currentLevel.level !== "REGULAR")) && (
            // 加 rounded-b-xl + overflow-hidden：backdrop-blur 层会忽略祖先圆角裁剪（Chromium 特性），
            // 需在本区块自身裁圆，否则底部两角显示为直角
            <div className="relative mt-auto overflow-hidden rounded-b-xl border-t border-stone-200/60">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 backdrop-blur-md bg-white/25"
              />
              <div className="relative p-5 pt-4">
                {/* 升级进度条（钻石卡为最高档） */}
                {nextLevel && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>
                        再消费 ¥{nextLevel.spentNeeded.toLocaleString()} 升级{nextLevel.name}
                      </span>
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

                {/* 生日礼遇引导：银卡及以上且未设置生日（生日设置入口在个人信息面板） */}
                {user && !user.birthday && currentLevel.level !== "REGULAR" && (
                  <button
                    type="button"
                    onClick={() => setUserCenterView("profile")}
                    className={`${nextLevel ? "mt-3" : ""} flex w-full items-center justify-between rounded-lg bg-stone-100/70 px-3 py-2 transition-colors hover:bg-stone-100`}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-stone-600">
                      <Gift className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                      设置生日，生日当月赠{" "}
                      {BIRTHDAY_POINTS[currentLevel.level as keyof typeof BIRTHDAY_POINTS]} 积分
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
          </div>

          {/* 升级引导卡片：录入消费 / 查看录入历史 */}
          <div className="flex flex-1 flex-col justify-center rounded-xl border border-stone-200/60 bg-white/40 p-5">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
              <TrendingUp className="h-4 w-4 text-[#00263e]" />
              提升会员等级
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-stone-400">
              {nextLevel
                ? "在天猫 / 京东 / 小程序 / 线下专柜等渠道消费后，录入订单凭证，审核通过后自动计入历史消费并升级会员等级。"
                : "您已是最高等级会员，全渠道消费记录可随时补录留存。"}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={focusSpentForm}
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#00263e] px-5 py-2 text-xs text-white transition-colors hover:bg-[#0d3b5c]"
              >
                录入消费
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView("spent-history")}
                className="text-xs text-stone-500 transition-colors hover:text-stone-800"
              >
                查看录入历史
              </button>
            </div>
          </div>
        </div>

        {/* 会员权益 - 2×2 等级卡片；点击后右侧整版内容淡出、对应等级介绍淡入 */}
        <div className="mt-6">
          <h4 className="mb-3 text-sm font-medium text-stone-700">会员权益</h4>
          <div className="grid grid-cols-2 gap-3">
            {allLevels.map((level) => {
              const isCurrent = level.level === currentLevel.level;
              const isUnlocked = !isCurrent && level.minSpent <= totalSpent;
              const tierBgImage = CARD_BG_IMAGES[level.level];
              return (
                <button
                  key={level.level}
                  type="button"
                  onClick={() => {
                    setSelectedLevel(level.level);
                    setView("tier");
                  }}
                  className={`relative overflow-hidden rounded-xl border p-4 text-left transition-opacity ${
                    isCurrent
                      ? "border-[#00263e] bg-white/60"
                      : isUnlocked
                        ? "border-stone-200/40 bg-white/20 opacity-60 hover:opacity-90"
                        : "border-stone-200/60 bg-white/40 opacity-85 hover:bg-white/60 hover:opacity-100"
                  }`}
                >
                  {/* 各等级背景图：统一虚化淡化（朦胧）；当前档以 #00263e 实线外框区分 */}
                  {tierBgImage && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25 blur-md"
                      style={{ backgroundImage: `url(${tierBgImage})` }}
                    />
                  )}
                  <div className="relative">
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="text-sm font-medium text-stone-800">{level.name}</p>
                      {isCurrent ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#00263e]">
                          <Crown className="h-3.5 w-3.5" />
                          当前
                        </span>
                      ) : isUnlocked ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#00263e]">
                          <Check className="h-3.5 w-3.5" />
                          已解锁
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-stone-400">
                          <Lock className="h-3 w-3" />
                          未解锁
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      {level.minSpent > 0
                        ? `消费满 ¥${level.minSpent.toLocaleString()}`
                        : "注册即享"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
            </m.div>
          )}

          {view === "tier" && selected && (
            <m.div
              key={`tier-${selected.level}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* 头部：等级名 + 返回入口 + 门槛 + 状态 */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-medium text-stone-800">{selected.name}</p>
                    <button
                      type="button"
                      onClick={() => setView("main")}
                      className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/40 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-white/70 hover:text-stone-900"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      查看全部等级
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-stone-400">
                    {selected.minSpent > 0
                      ? `消费满 ¥${selected.minSpent.toLocaleString()}`
                      : "注册即享"}
                  </p>
                </div>
                {selected.level === currentLevel.level ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-[#00263e]">
                    <Crown className="h-4 w-4" />
                    当前
                  </span>
                ) : selected.minSpent <= totalSpent ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-[#00263e]">
                    <Check className="h-4 w-4" />
                    已解锁
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-stone-400">
                    <Lock className="h-3.5 w-3.5" />
                    未解锁
                  </span>
                )}
              </div>

                {/* 权益列表：适配图标 + 标题 + 描述 */}
                <div className="mt-4 border-t border-stone-200/60 pt-4">
                  <p className="mb-3 text-xs font-medium tracking-wide text-stone-500">等级权益</p>
                  <div className="space-y-3">
                    {selected.benefits.map((b, i) => {
                      const BenefitIcon = benefitIcon(b.title);
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <BenefitIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#00263e]" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-800">{b.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-stone-400">{b.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 当前为普通档：升级引导（解锁银卡全部权益） */}
                {selected.level === "REGULAR" && selected.level === currentLevel.level && (
                  <div className="mt-4 rounded-lg bg-stone-100/60 px-3 py-3">
                    <div className="flex items-start gap-1.5">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
                      <p className="text-xs leading-relaxed text-stone-500">
                        累计消费满 ¥1,000 升级银卡会员，解锁档案保留、AI
                        顾问、积分兑礼与生日礼遇等权益
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={focusSpentForm}
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-[11px] text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-800"
                    >
                      补录消费记录
                    </button>
                  </div>
                )}

                {/* 未达档等级：解锁提示 + 补录引导 */}
                {selected.level !== "REGULAR" && selected.minSpent > totalSpent && (
                  <div className="mt-4 rounded-lg bg-stone-100/60 px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                      <p className="text-xs text-stone-500">
                        还差 ¥{(selected.minSpent - totalSpent).toLocaleString()} 解锁该等级
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={focusSpentForm}
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-[11px] text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-800"
                    >
                      补录消费记录
                    </button>
                      </div>
                    )}
            </m.div>
          )}

          {view === "spent-form" && (
            <m.div
              key="spent-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SpentAdjustmentPanel
                view="form"
                onViewChange={handleSpentViewChange}
                onApplicationsLoaded={handleApplicationsLoaded}
              />
            </m.div>
          )}

          {view === "spent-history" && (
            <m.div
              key="spent-history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SpentAdjustmentPanel
                view="history"
                onViewChange={handleSpentViewChange}
                onApplicationsLoaded={handleApplicationsLoaded}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
