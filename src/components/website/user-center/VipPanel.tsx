"use client";

/**
 * VIP 会员中心面板
 * 显示会员等级、积分、权益、积分历史
 */
import { useEffect, useState } from "react";
import { Crown, Gift, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
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
  totalPoints: number;
  totalSpent: number;
  birthday: string | null;
  birthdayGiftGranted?: boolean;
  birthdayGiftPoints?: number;
  currentLevel: LevelInfo;
  nextLevel: NextLevelInfo | null;
  allLevels: LevelInfo[];
}

interface PointTransaction {
  id: string;
  points: number;
  type: string;
  typeLabel: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

const LEVEL_BG_COLORS: Record<string, string> = {
  REGULAR: "from-slate-100 to-slate-50",
  ADVANCED: "from-teal-50 to-cyan-50",
  VIP: "from-amber-50 to-yellow-50",
  SVIP: "from-violet-50 to-purple-50",
};

const LEVEL_BORDER_COLORS: Record<string, string> = {
  REGULAR: "border-slate-200",
  ADVANCED: "border-teal-200",
  VIP: "border-amber-200",
  SVIP: "border-violet-200",
};

const LEVEL_CROWN_COLORS: Record<string, string> = {
  REGULAR: "text-slate-400",
  ADVANCED: "text-teal-500",
  VIP: "text-amber-500",
  SVIP: "text-violet-500",
};

export function VipPanel() {
  const [vipData, setVipData] = useState<VIPData | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const { error: showError } = useToast();

  const loadVIPData = async () => {
    try {
      const res = await fetch("/api/user/vip");
      const data = await res.json();
      if (data.success) {
        setVipData(data.data);
      }
    } catch {
      showError("加载会员信息失败");
    }
  };

  const loadTransactions = async (page: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/points/history?page=${page}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setTxTotal(data.data.pagination.total);
        setTxPage(page);
      }
    } catch {
      showError("加载积分记录失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    deferInEffect(() => {
      loadVIPData();
      loadTransactions(1);
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

  const {
    currentLevel,
    nextLevel,
    totalPoints,
    totalSpent,
    birthday,
    allLevels,
    birthdayGiftGranted,
    birthdayGiftPoints,
  } = vipData;
  const levelBg = LEVEL_BG_COLORS[currentLevel.level] ?? "from-gray-50 to-gray-50";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 生日礼通知 */}
      {birthdayGiftGranted && (
        <div className="mx-6 mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-800">🎂 生日快乐！</p>
              <p className="mt-0.5 text-xs text-emerald-600">
                已为您发放 {birthdayGiftPoints?.toLocaleString() ?? 0} 生日积分礼
              </p>
            </div>
          </div>
        </div>
      )}

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

          {/* 积分与累计消费 */}
          <div className="mt-4 flex items-baseline gap-6">
            <div>
              <span className="text-3xl font-light text-stone-800">
                {totalPoints.toLocaleString()}
              </span>
              <span className="ml-1 text-sm text-stone-400">积分</span>
            </div>
            <div>
              <span className="text-xl font-light text-stone-700">
                ¥{totalSpent.toLocaleString()}
              </span>
              <span className="ml-1 text-sm text-stone-400">累计消费</span>
            </div>
          </div>

          {/* 生日（影响生日月 3 倍积分与生日礼，在个人信息中修改） */}
          <p className="mt-2 text-xs text-stone-400">
            {birthday ? `生日：${birthday.slice(0, 10)}（生日月消费享 3 倍积分）` : "未填写生日，可在个人信息中填写，享生日月 3 倍积分"}
          </p>

          {/* 升级进度条（按累计消费） */}
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
                  className="h-full rounded-full bg-amber-400 transition-all duration-500"
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
                  消费 ¥{level.minSpent.toLocaleString()}+
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

      {/* 积分记录 */}
      <div className="mt-6 flex-1 px-6 pb-8">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium uppercase tracking-wider text-stone-400">积分记录</h4>
          {txTotal > 20 && (
            <div className="flex gap-1">
              <button
                onClick={() => txPage > 1 && loadTransactions(txPage - 1)}
                disabled={txPage <= 1}
                className="rounded px-2 py-0.5 text-xs text-stone-400 hover:text-stone-600 disabled:opacity-30"
              >
                上一页
              </button>
              <button
                onClick={() => loadTransactions(txPage + 1)}
                disabled={txPage * 20 >= txTotal}
                className="rounded px-2 py-0.5 text-xs text-stone-400 hover:text-stone-600 disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="mt-8 text-center text-sm text-stone-400">暂无积分记录</p>
        ) : (
          <div className="mt-3 space-y-1">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-stone-700">{tx.note ?? tx.typeLabel}</p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {new Date(tx.createdAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 text-sm font-medium ${
                    tx.points > 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {tx.points > 0 ? "+" : ""}
                  {tx.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
