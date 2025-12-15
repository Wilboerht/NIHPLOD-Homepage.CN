/**
 * 管理端 - 执行开奖 API
 * POST /api/admin/lottery/:id/draw
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 加权随机抽取算法
function weightedRandomSelect<T extends { weight: number; bonusWeight: number }>(
  items: T[],
  count: number
): T[] {
  if (items.length <= count) return items;

  const selected: T[] = [];
  const remaining = [...items];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    // 计算总权重
    const totalWeight = remaining.reduce(
      (sum, item) => sum + item.weight + item.bonusWeight,
      0
    );

    // 随机选择
    let random = Math.random() * totalWeight;
    let selectedIndex = 0;

    for (let j = 0; j < remaining.length; j++) {
      random -= remaining[j].weight + remaining[j].bonusWeight;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    // 移除已选中的
    selected.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  return selected;
}

// POST - 执行开奖
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 获取活动
    const activity = await prisma.lotteryActivity.findUnique({
      where: { id },
      include: {
        entries: {
          where: { isWinner: false },
        },
      },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    if (activity.status === "ended") {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_DRAWN", message: "活动已开奖" } },
        { status: 400 }
      );
    }

    if (activity.entries.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NO_ENTRIES", message: "暂无参与者" } },
        { status: 400 }
      );
    }

    // 执行加权随机抽取
    const winners = weightedRandomSelect(activity.entries, activity.prizeCount);

    // 更新数据库
    await prisma.$transaction([
      // 标记中奖者
      prisma.lotteryEntry.updateMany({
        where: { id: { in: winners.map((w) => w.id) } },
        data: { isWinner: true },
      }),
      // 更新活动状态
      prisma.lotteryActivity.update({
        where: { id },
        data: { status: "ended" },
      }),
    ]);

    // TODO: 发送中奖短信通知
    // for (const winner of winners) {
    //   await sendSMS(winner.phone, `恭喜您在「${activity.name}」活动中中奖！`);
    // }

    return NextResponse.json({
      success: true,
      data: {
        winners: winners.map((w) => ({
          id: w.id,
          phone: w.phone,
          weight: w.weight,
          bonusWeight: w.bonusWeight,
        })),
        message: `成功抽取 ${winners.length} 位中奖者`,
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

