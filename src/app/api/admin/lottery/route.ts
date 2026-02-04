/**
 * 管理端 - 抽奖活动 API（简化版）
 * GET /api/admin/lottery - 获取活动列表
 * POST /api/admin/lottery - 创建活动
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// 创建活动参数校验
const CreateActivitySchema = z.object({
  name: z.string().min(1, "活动名称不能为空").max(100),
  description: z.string().optional(),
  prizeName: z.string().min(1, "奖品名称不能为空"),
  prizeImage: z.string().optional(),
  prizeQuantity: z.number().int().min(1).default(1),
  drawTime: z.string().datetime(),
});

// GET - 获取活动列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // 构建查询条件
    const where: Record<string, unknown> = {};
    if (status && status !== "all") {
      where.status = status;
    }
    if (search) {
      where.name = { contains: search };
    }

    const activities = await prisma.lotteryActivity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { entries: true } },
        entries: {
          where: { status: { in: ["won", "verified"] } },
          select: { id: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        items: activities.map((a) => ({
          id: a.id,
          name: a.name,
          prizeName: a.prizeName,
          prizeImage: a.prizeImage,
          status: a.status,
          drawTime: a.drawTime.toISOString(),
          entryCount: a._count.entries,
          winnerCount: a.entries.length,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("获取活动列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// POST - 创建活动
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = CreateActivitySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { drawTime, prizeQuantity, ...rest } = validated.data;
    const draw = new Date(drawTime);
    const now = new Date();

    // 设置活动时间
    const activity = await prisma.lotteryActivity.create({
      data: {
        ...rest,
        prizeCount: prizeQuantity,
        startTime: now,
        endTime: draw,
        drawTime: draw,
        status: now < draw ? "active" : "pending",
      },
    });

    return NextResponse.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("创建活动失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建失败" } },
      { status: 500 }
    );
  }
}

