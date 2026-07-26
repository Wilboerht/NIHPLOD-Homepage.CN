/**
 * VIP 会员信息 API
 * GET /api/user/vip - 获取用户会员等级、积分、权益信息
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

// 默认权益配置（数据库未配置时的 fallback）
const DEFAULT_BENEFITS: Record<string, {
  level: string;
  name: string;
  nameEn: string;
  icon: string;
  minPoints: number;
  maxPoints: number | null;
  pointRate: number;
  benefits: { icon: string; title: string; desc: string }[];
  colorClass: string;
}> = {
  SILVER: {
    level: "SILVER",
    name: "银卡会员",
    nameEn: "Silver",
    icon: "🪙",
    minPoints: 0,
    maxPoints: 4999,
    pointRate: 1,
    benefits: [
      { icon: "🎁", title: "积分累积", desc: "消费1元=1积分" },
      { icon: "🎫", title: "专属优惠券", desc: "每月可领取专属优惠券" },
      { icon: "📦", title: "包邮权益", desc: "订单满99元包邮" },
    ],
    colorClass: "text-slate-400",
  },
  GOLD: {
    level: "GOLD",
    name: "金卡会员",
    nameEn: "Gold",
    icon: "🥇",
    minPoints: 5000,
    maxPoints: 19999,
    pointRate: 1,
    benefits: [
      { icon: "🎁", title: "双倍积分", desc: "生日当月消费享双倍积分" },
      { icon: "🎫", title: "专属优惠券", desc: "每月可领取专属大额优惠券" },
      { icon: "📦", title: "免邮权益", desc: "所有订单免运费" },
      { icon: "🎂", title: "生日礼遇", desc: "生日当月赠送专属优惠券" },
    ],
    colorClass: "text-amber-500",
  },
  DIAMOND: {
    level: "DIAMOND",
    name: "钻石会员",
    nameEn: "Diamond",
    icon: "💎",
    minPoints: 20000,
    maxPoints: null,
    pointRate: 1,
    benefits: [
      { icon: "🎁", title: "双倍积分", desc: "生日当月消费享双倍积分" },
      { icon: "🎫", title: "专属优惠券", desc: "每月可领取专属大额优惠券" },
      { icon: "📦", title: "免邮权益", desc: "所有订单免运费" },
      { icon: "🎂", title: "生日礼盒", desc: "生日当月赠送精美礼盒" },
      { icon: "⚡", title: "优先购买", desc: "新品首发优先购买权" },
      { icon: "💬", title: "专属客服", desc: "1对1专属护肤顾问" },
    ],
    colorClass: "text-violet-500",
  },
};

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        membershipLevel: true,
        totalPoints: true,
        birthday: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 生日当天自动发放优惠券（每日首次登录检查）
    let birthdayGiftGranted = false;
    let birthdayGiftPoints = 0;
    let updatedTotalPoints = user.totalPoints;

    if (user.birthday) {
      const now = new Date();
      const birthdayThisYear = new Date(now.getFullYear(), user.birthday.getMonth(), user.birthday.getDate());
      const isToday = birthdayThisYear.getDate() === now.getDate() &&
        birthdayThisYear.getMonth() === now.getMonth();

      if (isToday && user.membershipLevel !== "SILVER") {
        // 检查今年是否已发放过生日礼
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const existingGift = await prisma.pointTransaction.findFirst({
          where: {
            userId: user.id,
            type: "BIRTHDAY_GIFT",
            createdAt: { gte: yearStart },
          },
        });

        if (!existingGift) {
          // 发放生日积分礼
          const giftPoints = user.membershipLevel === "DIAMOND" ? 1000 : 500;
          const giftLabel = user.membershipLevel === "DIAMOND" ? "钻石会员生日礼盒" : "金卡会员生日礼遇";

          await prisma.pointTransaction.create({
            data: {
              userId: user.id,
              points: giftPoints,
              type: "BIRTHDAY_GIFT",
              note: `${giftLabel} — ${now.getFullYear()}年生日赠礼`,
            },
          });

          updatedTotalPoints = user.totalPoints + giftPoints;
          await prisma.user.update({
            where: { id: user.id },
            data: { totalPoints: updatedTotalPoints },
          });

          // 失效 profile 缓存，确保 AuthContext 拉取最新积分
          revalidateTag("user-profile", "max");

          birthdayGiftGranted = true;
          birthdayGiftPoints = giftPoints;

          apiConsole.info(
            `[BirthdayGift] 用户 ${user.id} (${user.membershipLevel}) 生日赠送 ${giftPoints} 积分`
          );
        }
      }
    }

    // 获取权益配置（从数据库读取，没有则用默认）
    const dbBenefits = await prisma.membershipBenefit.findMany({
      orderBy: { minPoints: "asc" },
    });

    const benefitsMap = new Map<string, (typeof dbBenefits)[number]>(dbBenefits.map((b) => [b.level, b]));

    // 构建所有等级信息
    const levels = Object.entries(DEFAULT_BENEFITS).map(([level, defaults]) => {
      const db = benefitsMap.get(level);
      return {
        level,
        name: db?.name ?? defaults.name,
        nameEn: db?.nameEn ?? defaults.nameEn,
        icon: db?.icon ?? defaults.icon,
        minPoints: db?.minPoints ?? defaults.minPoints,
        maxPoints: db?.maxPoints ?? defaults.maxPoints,
        pointRate: db?.pointRate ?? defaults.pointRate,
        benefits: (db?.benefits as typeof defaults.benefits) ?? defaults.benefits,
        colorClass: db?.colorClass ?? defaults.colorClass,
      };
    });

    // 当前等级信息
    const currentLevel = levels.find((l) => l.level === user.membershipLevel) ?? levels[0];

    // 下一等级
    const nextLevel = levels.find(
      (l) => l.minPoints > (currentLevel.maxPoints ?? Infinity)
    ) ?? null;

    // 距离下一等级还需要多少积分
    const pointsToNextLevel = nextLevel
      ? Math.max(0, nextLevel.minPoints - updatedTotalPoints)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        membershipLevel: user.membershipLevel,
        totalPoints: updatedTotalPoints,
        birthday: user.birthday?.toISOString() ?? null,
        birthdayGiftGranted,
        birthdayGiftPoints,
        currentLevel,
        nextLevel: nextLevel
          ? {
              level: nextLevel.level,
              name: nextLevel.name,
              minPoints: nextLevel.minPoints,
              pointsNeeded: pointsToNextLevel,
              progress: nextLevel.minPoints > 0
                ? Math.min(100, Math.round((updatedTotalPoints / nextLevel.minPoints) * 100))
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
