"use client";

/**
 * 会员中心面板（共享）
 * 显示会员等级与测肤权益（等级体系 2026-09 简化：普通会员 / 高级会员）
 *
 * 与其它用户面板保持一致外壳（标题栏 + 滚动内容区，stone 中性配色），
 * 不渲染任何 emoji 图标。会员权益为手风琴式：默认收起，点击展开。
 * 高级会员含里程碑成长体系（按累计消费解锁礼遇，不新增等级名）。
 *
 * 会员卡背景图：设计稿就绪后放入 public/images 并登记到 CARD_BG_IMAGES，
 * 未登记时使用渐变 fallback。
 */
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Lock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import { SpentAdjustmentPanel } from "./SpentAdjustmentPanel";

// 会员卡背景图（仅作卡面底色/纹理：bg-cover 铺满，容器高度由内容决定，
// 不按图片比例撑高卡片）
const CARD_BG_IMAGES: Partial<Record<string, string>> = {
  REGULAR: "/images/membership-card-regular.png",
  ADVANCED: "/images/membership-card-advanced.png",
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

interface MilestoneInfo {
  threshold: number;
  name: string;
  benefits: BenefitItem[];
  unlocked: boolean;
}

interface NextMilestoneInfo {
  threshold: number;
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
  milestones: MilestoneInfo[];
  nextMilestone: NextMilestoneInfo | null;
}

export function VipPanel() {
  const [vipData, setVipData] = useState<VIPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { error: showError } = useToast();
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

  useEffect(() => {
    deferInEffect(loadVIPData);
  }, [loadVIPData]);

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

  const { currentLevel, nextLevel, totalSpent, allLevels, milestones, nextMilestone, memberId } =
    vipData;
  const isAdvanced = currentLevel.level === "ADVANCED";
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
          className={`rounded-xl border p-5 ${
            isAdvanced
              ? "border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-stone-50/40"
              : "border-stone-200/60 bg-white/40"
          } ${cardBgImage ? "bg-cover bg-center" : ""}`}
          style={{
            ...(cardBgImage ? { backgroundImage: `url(${cardBgImage})` } : {}),
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wider text-stone-400">当前等级</p>
              <h3 className={`mt-1 text-xl font-medium ${isAdvanced ? "text-amber-800" : "text-stone-800"}`}>
                {currentLevel.name}
              </h3>
              <p className="mt-1 text-[11px] font-light tracking-wider text-stone-400">
                NO.{memberId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-400">累计消费</p>
              <p className="mt-1 text-xl font-light text-stone-700">
                ¥{totalSpent.toLocaleString()}
              </p>
            </div>
          </div>

          {/* 普通会员：升级进度条（满 ¥1,000 升级高级会员） */}
          {!isAdvanced && nextLevel && (
            <div className="mt-4 border-t border-stone-200/60 pt-4">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>再消费 ¥{nextLevel.spentNeeded.toLocaleString()} 升级{nextLevel.name}</span>
                <span>{nextLevel.progress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-stone-400 transition-all duration-500"
                  style={{ width: `${nextLevel.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 高级会员：里程碑进度条（按累计消费解锁礼遇） */}
          {isAdvanced && (
            <div className="mt-4 border-t border-amber-200/50 pt-4">
              {nextMilestone ? (
                <>
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      再消费 ¥{nextMilestone.spentNeeded.toLocaleString()} 解锁「
                      {nextMilestone.name}」
                    </span>
                    <span>{nextMilestone.progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ width: `${nextMilestone.progress}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-amber-700">已解锁全部尊享礼遇</p>
              )}
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

                      {/* 高级会员里程碑礼遇（含锁定状态） */}
                      {level.level === "ADVANCED" && milestones.length > 0 && (
                        <div className="pt-3">
                          <div className="mb-3 h-px w-full bg-stone-200/60" />
                          <p className="mb-2 text-xs font-medium text-stone-500">尊享里程碑</p>
                          <div className="space-y-3">
                            {milestones.map((m) => (
                              <div
                                key={m.threshold}
                                className={m.unlocked ? "" : "opacity-60"}
                              >
                                <div className="flex items-center gap-1.5">
                                  {m.unlocked ? (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                  ) : (
                                    <Lock className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                                  )}
                                  <p className="text-xs font-medium text-stone-700">
                                    消费满 ¥{m.threshold.toLocaleString()} · {m.name}
                                  </p>
                                  {m.unlocked && (
                                    <span className="text-[11px] text-amber-600">已解锁</span>
                                  )}
                                </div>
                                {m.benefits.map((b, i) => (
                                  <div key={i} className="mt-1 pl-5">
                                    <p className="text-sm text-stone-700">{b.title}</p>
                                    <p className="mt-0.5 text-xs text-stone-400">{b.desc}</p>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
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
      </div>
    </div>
  );
}
