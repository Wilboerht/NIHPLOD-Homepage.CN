/**
 * 管理端 - 抽奖活动详情 API
 * GET /api/admin/lottery/:id - 获取活动详情
 * DELETE /api/admin/lottery/:id - 删除活动
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// GET - 获取活动详情
export async function GET(
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

    const activity = await prisma.lotteryActivity.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    // 分离中奖者和普通参与者（status: won 或 verified 表示中奖）
    const winners = activity.entries.filter((e) => e.status === "won" || e.status === "verified");
    const entries = activity.entries;

    return NextResponse.json({
      success: true,
      data: {
        id: activity.id,
        name: activity.name,
        prizeName: activity.prizeName,
        prizeImage: activity.prizeImage,
        prizeQuantity: activity.prizeCount,
        status: activity.status,
        drawTime: activity.drawTime.toISOString(),
        createdAt: activity.createdAt.toISOString(),
        entryCount: activity.entries.length,
        winnerCount: winners.length,
        entries: entries.map((e) => ({
          id: e.id,
          phone: e.phone,
          drawingUrl: e.drawingUrl,
          bonusWeight: e.bonusWeight,
          isWinner: e.status === "won" || e.status === "verified",
          status: e.status,
          createdAt: e.createdAt.toISOString(),
        })),
        winners: winners.map((e) => ({
          id: e.id,
          phone: e.phone,
          drawingUrl: e.drawingUrl,
          bonusWeight: e.bonusWeight,
          isWinner: true,
          status: e.status,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("获取活动详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// DELETE - 删除活动
export async function DELETE(
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

    // 检查活动是否存在
    const activity = await prisma.lotteryActivity.findUnique({
      where: { id },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "活动不存在" } },
        { status: 404 }
      );
    }

    // 已结束的活动不能删除
    if (activity.status === "ended") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "已结束的活动不能删除" } },
        { status: 403 }
      );
    }

    // 删除关联的参与记录和活动
    await prisma.$transaction([
      prisma.lotteryEntry.deleteMany({ where: { activityId: id } }),
      prisma.lotteryActivity.delete({ where: { id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { message: "活动已删除" },
    });
  } catch (error) {
    console.error("删除活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除失败" } },
      { status: 500 }
    );
  }
}

