/**
 * AI 测肤用量（测肤子站内部接口代理，共享核心）
 *
 * 主站 /api/user/vip 与 OAuth /api/oauth/skin-test-usage 共用，
 * 避免两处对子站接口字段与失败降级口径漂移。
 * 任何失败（env 未配置 / 超时 / 网络错误 / 非 2xx）都返回 null，绝不影响调用方主流程。
 */
import { advisorJson } from "@/lib/advisor-internal";
import { prisma } from "@/lib/prisma";

/** 测肤子站（smart.nihplod.cn）返回的 AI 测肤用量 */
export interface SkinTestUsage {
  // level 可能为 null：子站对从未使用过测肤的用户返回 level: null
  level: string | null;
  totalUsed: number;
  todayUsed: number;
  quota: {
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  remaining: number | null;
  /** 今日是否已完成手动打卡（自动测肤日记不计入）；旧版子站可能缺失 */
  todayCheckedIn?: boolean;
}

/**
 * 查询测肤子站的 AI 测肤已用次数（服务端到服务端内部接口）。
 * 任何失败返回 null（fail-soft）。
 *
 * 同时把主站会员等级/累计消费传给子站：子站本地 User 可能从未创建（用户只用过
 * 积分小程序/官网），仅靠子站本地副本会把 GOLD 用户按 REGULAR 配额返回。
 * 主站是会员数据的权威来源，查询失败时省略覆盖字段，保持原有 fail-soft。
 */
export async function fetchSkinTestUsage(userId: string): Promise<SkinTestUsage | null> {
  let membership: { level: string; totalSpent: number } | undefined;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true, totalSpent: true },
    });
    if (user) {
      membership = { level: user.membershipLevel, totalSpent: user.totalSpent };
    }
  } catch {
    // 主站库查询失败不阻断测肤用量；子站按本地/REGULAR 兜底
  }

  return advisorJson<SkinTestUsage>("/api/internal/skin-test-usage", {
    query: {
      userId,
      ...(membership ? { level: membership.level, totalSpent: membership.totalSpent } : {}),
    },
    timeoutMs: 3000,
  });
}
