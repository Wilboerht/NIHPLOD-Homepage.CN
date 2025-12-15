/**
 * GET /api/lottery/current - 获取当前进行中的抽奖活动
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const now = new Date();

    // 查找正在进行的活动
    const activity = await prisma.lotteryActivity.findFirst({
      where: {
        status: "active",
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { endTime: "asc" }, // 最近结束的优先
    });

    if (!activity) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "当前没有进行中的抽奖活动",
      });
    }

    // 获取当前参与人数
    const entryCount = await prisma.lotteryEntry.count({
      where: { activityId: activity.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: activity.id,
        name: activity.name,
        description: activity.description,
        prizeName: activity.prizeName,
        prizeImage: activity.prizeImage,
        prizeCount: activity.prizeCount,
        startTime: activity.startTime,
        endTime: activity.endTime,
        drawTime: activity.drawTime,
        entryCount,
      },
    });
  } catch (error) {
    console.error("获取抽奖活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取活动失败" } },
      { status: 500 }
    );
  }
}

