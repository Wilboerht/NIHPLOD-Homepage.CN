/**
 * 会员视图数据组装（服务端专用）
 *
 * 主站 GET /api/user/vip 与 OAuth GET /api/oauth/membership 共用，
 * 避免两处等级/权益计算逻辑漂移。
 *
 * 注意：本文件依赖 Prisma，仅供服务端路由引用。
 * src/lib/membership.ts 同时被客户端组件（UserCenterModal 等）引用，
 * 不能在其内引入 Prisma，故本函数独立成文件。
 */
import { prisma } from "@/lib/prisma";
import { LEVEL_DEFAULT_BENEFITS, type LevelBenefitItem } from "@/lib/membership";

/**
 * 组装用户会员视图：等级、累计消费、当前/下一等级与全部等级权益。
 * 不含 skinTestUsage（子站私有数据，由 /api/user/vip 自行附加）。
 * DB 无权益配置时回退 LEVEL_DEFAULT_BENEFITS。
 *
 * @returns 用户不存在时返回 null
 */
export async function getMembershipView(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      membershipLevel: true,
      totalSpent: true,
    },
  });

  if (!user) return null;

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
    const dbBenefitItems = db?.benefits as LevelBenefitItem[] | null;
    return {
      level: defaults.level,
      name: db?.name ?? defaults.name,
      nameEn: db?.nameEn ?? defaults.nameEn,
      icon: db?.icon ?? defaults.icon,
      minSpent: db?.minSpent ?? defaults.minSpent,
      maxSpent: db?.maxSpent ?? defaults.maxSpent,
      benefits: dbBenefitItems?.length ? dbBenefitItems : defaults.benefits,
      colorClass: db?.colorClass ?? defaults.colorClass,
    };
  });

  // 当前等级信息
  const currentLevel = levels.find((l) => l.level === user.membershipLevel) ?? levels[0];

  // 下一等级（按消费门槛）
  const nextLevel = levels.find((l) => l.minSpent > user.totalSpent) ?? null;

  // 距离下一等级还需要消费多少
  const spentToNextLevel = nextLevel ? Math.max(0, nextLevel.minSpent - user.totalSpent) : 0;

  return {
    membershipLevel: user.membershipLevel,
    memberId: user.id.slice(0, 8).toUpperCase(),
    totalSpent: user.totalSpent,
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
  };
}

export type MembershipView = NonNullable<Awaited<ReturnType<typeof getMembershipView>>>;
