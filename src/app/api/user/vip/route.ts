/**
 * 会员信息 API
 * GET /api/user/vip - 获取用户会员等级、累计消费、权益信息
 *
 * 等级体系（四档）：普通会员(注册) / 银卡(消费满 ¥1,000) / 金卡(消费满 ¥5,000) / 钻石卡(消费满 ¥10,000)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { LEVEL_DEFAULT_BENEFITS, type LevelBenefitItem } from "@/lib/membership";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** 测肤子站（advisor.nihplod.cn）返回的 AI 测肤用量 */
interface SkinTestUsage {
  level: string;
  totalUsed: number;
  todayUsed: number;
  quota: {
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  remaining: number | null;
}

/**
 * 查询测肤子站的 AI 测肤已用次数（服务端到服务端内部接口）。
 * 任何失败（env 未配置 / 超时 / 网络错误 / 非 2xx）都返回 null，绝不影响 VIP 主流程。
 */
async function fetchSkinTestUsage(userId: string): Promise<SkinTestUsage | null> {
  try {
    const secret = process.env.ADVISOR_INTERNAL_SECRET;
    if (!secret) return null;
    const base = (process.env.ADVISOR_API_BASE || "https://advisor.nihplod.cn").replace(/\/+$/, "");
    const res = await fetch(
      `${base}/api/internal/skin-test-usage?userId=${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as SkinTestUsage;
  } catch {
    return null;
  }
}

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    // AI 测肤用量查询与 DB 查询并行，失败时降级为 null，不影响主流程
    const skinTestUsagePromise = fetchSkinTestUsage(payload.id);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        membershipLevel: true,
        totalSpent: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 获取权益配置（从数据库读取，没有则用默认）
    const dbBenefits = await prisma.membershipBenefit.findMany({
      orderBy: { minSpent: "asc" },
    });

    const benefitsMap = new Map<string, (typeof dbBenefits)[number]>(
      dbBenefits.map((b) => [b.level, b])
    );

    // 构建所有等级信息（DB 配置优先，缺失或权益为空数组时回退默认）
    const levels = Object.values(LEVEL_DEFAULT_BENEFITS).map((defaults) => {
      const db = benefitsMap.get(defaults.level);
      const dbBenefits = db?.benefits as LevelBenefitItem[] | null;
      return {
        level: defaults.level,
        name: db?.name ?? defaults.name,
        nameEn: db?.nameEn ?? defaults.nameEn,
        icon: db?.icon ?? defaults.icon,
        minSpent: db?.minSpent ?? defaults.minSpent,
        maxSpent: db?.maxSpent ?? defaults.maxSpent,
        benefits: dbBenefits?.length ? dbBenefits : defaults.benefits,
        colorClass: db?.colorClass ?? defaults.colorClass,
      };
    });

    // 当前等级信息
    const currentLevel = levels.find((l) => l.level === user.membershipLevel) ?? levels[0];

    // 下一等级（按消费门槛）
    const nextLevel = levels.find((l) => l.minSpent > user.totalSpent) ?? null;

    // 距离下一等级还需要消费多少
    const spentToNextLevel = nextLevel ? Math.max(0, nextLevel.minSpent - user.totalSpent) : 0;

    // AI 测肤已用次数（来自测肤子站内部接口，失败时降级为 null，不影响主流程）
    const skinTestUsage = await skinTestUsagePromise;

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel: user.membershipLevel,
        memberId: user.id.slice(0, 8).toUpperCase(),
        totalSpent: user.totalSpent,
        skinTestUsage,
        currentLevel,
        nextLevel: nextLevel
          ? {
              level: nextLevel.level,
              name: nextLevel.name,
              minSpent: nextLevel.minSpent,
              spentNeeded: spentToNextLevel,
              progress:
                nextLevel.minSpent > 0
                  ? Math.min(100, Math.round((user.totalSpent / nextLevel.minSpent) * 100))
                  : 100,
            }
          : null,
        allLevels: levels,
      },
    });
  } catch (error) {
    apiConsole.error("[GetVIP] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
