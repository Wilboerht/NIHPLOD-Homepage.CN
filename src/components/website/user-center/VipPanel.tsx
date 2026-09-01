"use client";

/**
 * 会员中心面板
 * 显示会员等级、测肤权益（等级体系 2026-09 简化：普通会员 / 高级会员）
 */
import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface BenefitItem {
  icon: string;
  title: string;
  desc: string;
}

interface LevelInfo {
  level: string;
  name: string;
  icon: string;
  minSpent: number;
  maxSpent: number | null;
  benefits: BenefitItem[];
  colorClass: string;
}

interface NextLevelInfo {
  level: string;
  name: string;
  minSpent: number;
  spentNeeded: number;
  progress: number;
}

interface VIPData {
  membershipLevel: string;
  totalSpent: number;
  currentLevel: LevelInfo;
  nextLevel: NextLevelInfo | null;
  allLevels: LevelInfo[];
}

const LEVEL_BG_COLORS: Record<string, string> = {
  REGULAR: "from-slate-100 to-slate-50",
  ADVANCED: "from-teal-50 to-cyan-50",
};

const LEVEL_BORDER_COLORS: Record<string, string> = {
  REGULAR: "border-slate-200",
  ADVANCED: "border-teal-200",
};

const LEVEL_CROWN_COLORS: Record<string, string> = {
  REGULAR: "text-slate-400",
  ADVANCED: "text-teal-500",
};

export function VipPanel() {
  const [vipData, setVipData] = useState<VIPData | null>(null);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();
  const { redirectToLogin } = useAuth();

  const loadVIPData = async () => {
    try {
      // fetchWithAuth：401 时自动静默刷新重试；刷新失败抛 UnauthorizedError，
      // 避免会话过期后误渲染"暂无会员信息"假空态
      const res = await fetchWithAuth("/api/user/vip");
      const data = await res.json();
      if (data.success) {
        setVipData(data.data);
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
  };

  useEffect(() => {
    deferInEffect(() => {
      loadVIPData();
    });
  }, []);

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

  const { currentLevel, nextLevel, totalSpent, allLevels } = vipData;
  const levelBg = LEVEL_BG_COLORS[currentLevel.level] ?? "from-gray-50 to-gray-50";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 会员等级卡片 */}
      <div className="px-6 pt-6">
        <div
          className={`rounded-2xl bg-gradient-to-br ${levelBg} border ${LEVEL_BORDER_COLORS[currentLevel.level] ?? "border-gray-200"} p-5`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs tracking-wider text-stone-500">当前等级</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg">{currentLevel.icon}</span>
                <h3 className={`text-xl font-medium ${currentLevel.colorClass}`}>
                  {currentLevel.name}
                </h3>
              </div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/60">
              <Crown
                className={`h-6 w-6 ${LEVEL_CROWN_COLORS[currentLevel.level] ?? "text-slate-400"}`}
              />
            </div>
          </div>

          {/* 累计消费 */}
          <div className="mt-4 flex items-baseline gap-6">
            <div>
              <span className="text-xl font-light text-stone-700">
                ¥{totalSpent.toLocaleString()}
              </span>
              <span className="ml-1 text-sm text-stone-400">累计消费</span>
            </div>
          </div>

          {/* 升级进度条（按累计消费：满 ¥1,000 升级高级会员） */}
          {nextLevel && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>
                  再消费 ¥{nextLevel.spentNeeded.toLocaleString()} 升级 {nextLevel.name}
                </span>
                <span>{nextLevel.progress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-teal-400 transition-all duration-500"
                  style={{ width: `${nextLevel.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 所有等级权益 */}
      <div className="mt-5 px-6">
        <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-400">
          会员权益
        </h4>
        <div className="space-y-2">
          {allLevels.map((level) => (
            <div
              key={level.level}
              className={`rounded-xl border p-4 ${
                level.level === currentLevel.level
                  ? `${LEVEL_BORDER_COLORS[level.level] ?? "border-gray-200"} bg-white/40`
                  : "border-transparent bg-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{level.icon}</span>
                <span className={`text-sm font-medium ${level.colorClass}`}>{level.name}</span>
                <span className="ml-auto text-xs text-stone-400">
                  {level.minSpent > 0 ? `消费 ¥${level.minSpent.toLocaleString()}+` : "注册即享"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {level.benefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-xs">{b.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-stone-700">{b.title}</p>
                      <p className="text-[11px] text-stone-400">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
