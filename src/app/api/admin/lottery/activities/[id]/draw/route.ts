/**
 * 管理端 - 执行开奖
 * POST /api/admin/lottery/activities/[id]/draw - 执行开奖
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { drawWinners } from "@/lib/lottery";

type Params = { params: Promise<{ id: string }> };

// POST - 执行开奖
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id: activityId } = await params;

    // 1. 获取活动信息
    const activity = await prisma.lotteryActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    // 检查状态
    if (activity.status === "finished") {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_DRAWN", message: "活动已开奖" } },
        { status: 400 }
      );
    }

    if (activity.status !== "active") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "只有进行中的活动可以开奖" } },
        { status: 400 }
      );
    }

    // 2. 获取所有参与记录
    const entries = await prisma.lotteryEntry.findMany({
      where: {
        activityId,
        status: "pending",
      },
      select: {
        id: true,
        riskScore: true,
        bonusWeight: true, // 邀请加成权重
      },
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_ENTRIES", message: "没有有效的参与记录" } },
        { status: 400 }
      );
    }

    // 3. 执行抽奖
    const winnerIds = drawWinners(entries, {
      totalWinners: activity.prizeCount,
      excludeHighRisk: true,  // 排除高风险用户
      weightByRisk: true,     // 低风险用户更容易中奖
    });

    if (winnerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_VALID_ENTRIES", message: "没有符合条件的参与者" } },
        { status: 400 }
      );
    }

    // 4. 更新中奖记录
    const now = new Date();
    await Promise.all(
      winnerIds.map((id, index) =>
        prisma.lotteryEntry.update({
          where: { id },
          data: {
            status: "won",
            wonAt: now,
            wonRank: index + 1,
          },
        })
      )
    );

    // 5. 更新活动状态
    await prisma.lotteryActivity.update({
      where: { id: activityId },
      data: {
        status: "finished",
        drawnAt: now,
      },
    });

    // 6. 获取中奖者详情（用于展示）
    const winners = await prisma.lotteryEntry.findMany({
      where: { id: { in: winnerIds } },
      orderBy: { wonRank: "asc" },
      select: {
        id: true,
        drawingUrl: true,
        wonRank: true,
        riskScore: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        winnersCount: winnerIds.length,
        totalEntries: entries.length,
        winners,
        message: `开奖成功！共 ${winnerIds.length} 人中奖`,
      },
    });
  } catch (error) {
    console.error("开奖失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "开奖失败" } },
      { status: 500 }
    );
  }
}

