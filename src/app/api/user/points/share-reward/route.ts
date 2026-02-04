/**
 * 分享奖励 API
 * POST /api/user/points/share-reward
 * 用户分享后获得护肤点数奖励
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { z } from "zod";

// 分享奖励点数
const SHARE_REWARD_POINTS = 5;

// 每日分享奖励次数上限
const DAILY_SHARE_LIMIT = 3;

// 请求参数验证
const shareRewardSchema = z.object({
  // 分享类型：advisor（问卷结果）、product（商品）
  shareType: z.enum(["advisor", "product"]),
  // 分享平台
  platform: z.enum(["wechat", "weibo", "xiaohongshu", "douyin", "copy", "native"]),
  // 可选：分享的资源ID（如商品ID）
  resourceId: z.string().optional(),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = shareRewardSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { shareType, platform } = result.data;

    // 检查今日分享奖励次数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayShareCount = await prisma.pointRecord.count({
      where: {
        userId: payload.id,
        type: "SHARE_REWARD",
        createdAt: { gte: today },
      },
    });

    if (todayShareCount >= DAILY_SHARE_LIMIT) {
      return NextResponse.json({
        success: true,
        data: {
          rewarded: false,
          message: `今日分享奖励次数已达上限（${DAILY_SHARE_LIMIT}次）`,
          todayCount: todayShareCount,
          dailyLimit: DAILY_SHARE_LIMIT,
        },
      });
    }

    // 发放分享奖励
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: payload.id },
        data: { 
          points: { increment: SHARE_REWARD_POINTS },
          totalPoints: { increment: SHARE_REWARD_POINTS },
        },
      });

      await tx.pointRecord.create({
        data: {
          userId: payload.id,
          type: "SHARE_REWARD",
          amount: SHARE_REWARD_POINTS,
          balance: updatedUser.points,
          description: `分享${shareType === "advisor" ? "护肤报告" : "商品"}到${getPlatformName(platform)}`,
        },
      });

      return updatedUser;
    });

    console.log(`[ShareReward] 用户 ${payload.id} 分享奖励: +${SHARE_REWARD_POINTS} 点`);

    return NextResponse.json({
      success: true,
      data: {
        rewarded: true,
        pointsEarned: SHARE_REWARD_POINTS,
        currentPoints: user.points,
        todayCount: todayShareCount + 1,
        dailyLimit: DAILY_SHARE_LIMIT,
        message: `分享成功，获得 ${SHARE_REWARD_POINTS} 护肤点数`,
      },
    });
  } catch (error) {
    console.error("[ShareReward] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    wechat: "微信",
    weibo: "微博",
    xiaohongshu: "小红书",
    douyin: "抖音",
    copy: "剪贴板",
    native: "其他",
  };
  return names[platform] || platform;
}

