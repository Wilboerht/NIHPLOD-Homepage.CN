/**
 * 会员信息 API
 * GET /api/user/vip - 获取用户会员等级、累计消费、权益信息
 *
 * 等级体系（2026-09 简化）：普通会员(注册) / 高级会员(消费满 ¥1,000)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { LEVEL_DEFAULT_BENEFITS, type LevelBenefitItem } from "@/lib/membership";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
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

    return NextResponse.json({
      success: true,
      data: {
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
