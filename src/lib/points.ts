/**
 * 护肤点数服务
 * 管理用户护肤点数的获取、消耗和查询
 * 护肤点数专用于AI护肤顾问对话
 */
import { prisma } from "./prisma";
import type { PointType } from "@/generated/prisma/client";

// 点数规则配置
export const POINT_RULES = {
  // 获取点数
  REGISTER_BONUS: 10,      // 注册奖励
  SHARE_BONUS: 5,          // 分享奖励
  PURCHASE_RATIO: 1,       // 消费返点比例 (每消费1元得1点)

  // 消耗点数
  AI_QUESTION_COST: 2,     // AI追问消耗
} as const;

/**
 * 获取用户当前积分
 */
export async function getUserPoints(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  return user?.points ?? 0;
}

/**
 * 添加积分
 */
export async function addPoints(
  userId: string,
  type: PointType,
  amount: number,
  description: string,
  relatedId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "点数数量必须大于0" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 更新用户积分
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          points: { increment: amount },
          totalPoints: { increment: amount },
        },
        select: { points: true },
      });

      // 创建积分记录
      await tx.pointRecord.create({
        data: {
          userId,
          type,
          amount,
          balance: user.points,
          description,
          relatedId,
        },
      });

      return user.points;
    });

    console.log(`[Points] 用户 ${userId} 获得 ${amount} 点数, 余额: ${result}`);
    return { success: true, newBalance: result };
  } catch (error) {
    console.error("[Points] 添加点数失败:", error);
    return { success: false, newBalance: 0, error: "点数添加失败" };
  }
}

/**
 * 消耗积分
 */
export async function consumePoints(
  userId: string,
  type: PointType,
  amount: number,
  description: string,
  relatedId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "消耗数量必须大于0" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 检查余额
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { points: true },
      });

      if (!user || user.points < amount) {
        throw new Error("点数不足");
      }

      // 扣减积分
      const updated = await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: amount } },
        select: { points: true },
      });

      // 创建消耗记录（金额为负数）
      await tx.pointRecord.create({
        data: {
          userId,
          type,
          amount: -amount,
          balance: updated.points,
          description,
          relatedId,
        },
      });

      return updated.points;
    });

    console.log(`[Points] 用户 ${userId} 消耗 ${amount} 点数, 余额: ${result}`);
    return { success: true, newBalance: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "点数消耗失败";
    console.error("[Points] 消耗点数失败:", message);
    return { success: false, newBalance: 0, error: message };
  }
}

/**
 * 检查用户是否有足够积分
 */
export async function hasEnoughPoints(userId: string, amount: number): Promise<boolean> {
  const points = await getUserPoints(userId);
  return points >= amount;
}

/**
 * 管理员调整积分（可正可负）
 */
export async function adjustPoints(
  userId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount === 0) {
    return { success: false, newBalance: 0, error: "调整数量不能为0" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 获取当前用户积分
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { points: true },
      });

      if (!user) {
        throw new Error("用户不存在");
      }

      // 如果是扣减，检查余额是否充足
      if (amount < 0 && user.points < Math.abs(amount)) {
        throw new Error("点数不足");
      }

      // 更新用户积分
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          points: { increment: amount },
          // 只有增加时才累计总积分
          ...(amount > 0 ? { totalPoints: { increment: amount } } : {}),
        },
        select: { points: true },
      });

      // 创建积分记录
      await tx.pointRecord.create({
        data: {
          userId,
          type: "ADMIN_ADJUST",
          amount,
          balance: updated.points,
          description: `[管理员调整] ${description}`,
        },
      });

      return updated.points;
    });

    console.log(`[Points] 管理员调整用户 ${userId} 点数 ${amount > 0 ? "+" : ""}${amount}, 余额: ${result}`);
    return { success: true, newBalance: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "点数调整失败";
    console.error("[Points] 管理员调整点数失败:", message);
    return { success: false, newBalance: 0, error: message };
  }
}

