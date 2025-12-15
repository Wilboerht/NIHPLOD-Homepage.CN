/**
 * GET /api/lottery/garden - 获取花园中的花朵列表
 * 用于前端展示花园效果
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("activityId");
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
    const offset = parseInt(searchParams.get("offset") || "0");

    // 如果没有指定活动ID，获取当前进行中的活动
    let targetActivityId = activityId;
    if (!targetActivityId) {
      const now = new Date();
      const currentActivity = await prisma.lotteryActivity.findFirst({
        where: {
          status: { in: ["active", "finished"] },
          startTime: { lte: now },
        },
        orderBy: { startTime: "desc" },
        select: { id: true },
      });
      targetActivityId = currentActivity?.id || null;
    }

    if (!targetActivityId) {
      return NextResponse.json({
        success: true,
        data: {
          flowers: [],
          total: 0,
          activityId: null,
        },
      });
    }

    // 获取花朵列表（只获取展示需要的数据，不包含敏感信息）
    const [flowers, total] = await Promise.all([
      prisma.lotteryEntry.findMany({
        where: {
          activityId: targetActivityId,
          drawingType: "flower",
        },
        select: {
          id: true,
          drawingUrl: true,
          flowerData: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.lotteryEntry.count({
        where: {
          activityId: targetActivityId,
          drawingType: "flower",
        },
      }),
    ]);

    // 获取活动信息
    const activity = await prisma.lotteryActivity.findUnique({
      where: { id: targetActivityId },
      select: {
        id: true,
        name: true,
        prizeName: true,
        prizeImage: true,
        drawTime: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        flowers: flowers.map((f) => ({
          id: f.id,
          imageUrl: f.drawingUrl,
          flowerData: f.flowerData,
          isWinner: f.status === "won" || f.status === "verified",
          createdAt: f.createdAt,
        })),
        total,
        activity,
      },
    });
  } catch (error) {
    console.error("获取花园数据失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取花园失败" } },
      { status: 500 }
    );
  }
}

