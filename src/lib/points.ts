/**
 * VIP 积分工具模块
 * 处理积分计算、等级升级、交易记录等
 */
import type { Prisma, MembershipLevel } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

// 积分与等级映射
const LEVEL_THRESHOLDS: { level: MembershipLevel; minPoints: number }[] = [
  { level: "SILVER", minPoints: 0 },
  { level: "GOLD", minPoints: 5000 },
  { level: "DIAMOND", minPoints: 20000 },
];

/**
 * 根据积分数计算会员等级
 */
function calculateLevel(points: number): MembershipLevel {
  let level: MembershipLevel = "SILVER";
  for (const t of LEVEL_THRESHOLDS) {
    if (points >= t.minPoints) level = t.level;
  }
  return level;
}

/**
 * 判断当前月份是否为用户生日月
 */
function isBirthdayMonth(birthday: Date | null): boolean {
  if (!birthday) return false;
  const now = new Date();
  return birthday.getMonth() === now.getMonth();
}

/**
 * 为支付成功的订单增加积分
 * 调用时机：支付回调/模拟支付成功后
 *
 * @param tx Prisma 事务客户端（可选，传入则使用事务）
 * @param orderId 订单 ID
 * @param userId 用户 ID
 * @param payAmount 实付金额（元，Decimal 值转换为 number）
 * @param orderNo 订单号（用作 reference）
 */
export async function creditPointsForOrder(params: {
  tx?: Prisma.TransactionClient;
  orderId: string;
  userId: string;
  payAmount: number;
  orderNo: string;
}): Promise<{ points: number; newLevel: MembershipLevel; oldLevel: MembershipLevel } | null> {
  const { tx, orderId, userId, payAmount, orderNo } = params;
  const db = tx ?? prisma;

  try {
    // 幂等检查：该订单是否已发放过积分
    const existing = await db.pointTransaction.findFirst({
      where: { userId, type: "ORDER_REWARD", reference: orderNo },
    });
    if (existing) {
      apiConsole.debug(`[Points] 订单 ${orderNo} 积分已发放，跳过`);
      return null;
    }

    // 获取用户当前等级和生日
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true, totalPoints: true, birthday: true },
    });
    if (!user) return null;

    // 计算积分（1元=1分，取整）
    const basePoints = Math.floor(payAmount);

    // 生日月双倍积分（金卡及以上）
    const birthdayBonus =
      user.membershipLevel !== "SILVER" && isBirthdayMonth(user.birthday ?? null)
        ? basePoints
        : 0;

    const totalPointsEarned = basePoints + birthdayBonus;
    if (totalPointsEarned <= 0) return null;

    const newTotalPoints = user.totalPoints + totalPointsEarned;
    const newLevel = calculateLevel(newTotalPoints);
    const oldLevel = user.membershipLevel;
    const levelUp = newLevel !== oldLevel;

    // 写入积分交易记录
    await db.pointTransaction.create({
      data: {
        userId,
        points: totalPointsEarned,
        type: "ORDER_REWARD",
        reference: orderNo,
        note: `订单 ${orderNo} 消费奖励${birthdayBonus > 0 ? "（含生日双倍积分）" : ""}`,
      },
    });

    // 如果是升级，写入升级奖励记录
    if (levelUp) {
      const upgradeBonus = newLevel === "GOLD" ? 200 : newLevel === "DIAMOND" ? 500 : 0;
      if (upgradeBonus > 0) {
        await db.pointTransaction.create({
          data: {
            userId,
            points: upgradeBonus,
            type: "LEVEL_UP_BONUS",
            reference: orderNo,
            note: `升级至 ${newLevel === "GOLD" ? "金卡" : "钻石"}会员奖励`,
          },
        });
      }
    }

    // 更新用户积分和等级
    const finalPoints = newTotalPoints + (levelUp ? (newLevel === "GOLD" ? 200 : newLevel === "DIAMOND" ? 500 : 0) : 0);
    await db.user.update({
      where: { id: userId },
      data: {
        totalPoints: finalPoints,
        membershipLevel: newLevel,
      },
    });

    apiConsole.info(
      `[Points] 用户 ${userId} 获得 ${totalPointsEarned} 积分 (总 ${finalPoints}), ` +
      `等级: ${oldLevel} → ${newLevel}`
    );

    // 失效 profile 缓存，确保 AuthContext 拉取最新积分与等级
    try {
      revalidateTag("user-profile", "max");
    } catch {
      // revalidateTag 在非请求上下文中可能失败（如 standalone 模式），忽略
    }

    return {
      points: totalPointsEarned + (levelUp ? (newLevel === "GOLD" ? 200 : newLevel === "DIAMOND" ? 500 : 0) : 0),
      newLevel,
      oldLevel,
    };
  } catch (error) {
    apiConsole.error("[Points] 积分发放失败:", error);
    // 积分发放失败不应阻塞支付流程
    return null;
  }
}
